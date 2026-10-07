"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProductMasksAction } from "@/app/actions/product-masks";
import { Alert } from "@/components/ui";
import type { MaskBox } from "@/lib/intake/photos";

export interface ProductPhotoRow {
  id: string;
  url: string;
  alt: string | null;
  coverMode: string | null;
  maskBoxes: string | null;
}

const MIN_BOX = 0.004;
const MAX_BOXES = 4;
const MAX_AREA = 0.4;
const HANDLE_PX = 14;

type Mode = "draw" | "move" | "resize" | null;

interface Gesture {
  mode: NonNullable<Mode>;
  index: number;
  start: { x: number; y: number };
  orig: MaskBox;
  corner?: "nw" | "ne" | "sw" | "se";
  fixed?: { x: number; y: number };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function parseBoxes(raw: string | null | undefined): MaskBox[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .map((b) => ({
        x0: Number((b as { x0?: unknown }).x0),
        y0: Number((b as { y0?: unknown }).y0),
        x1: Number((b as { x1?: unknown }).x1),
        y1: Number((b as { y1?: unknown }).y1),
      }))
      .filter((b) => [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite));
  } catch {
    return [];
  }
}

const COVER_LABEL: Record<string, string> = {
  NONE: "No cover",
  AUTO_MASK: "Auto mask",
  MANUAL_MASK: "Manual mask",
  AI_REMOVED: "AI removed",
};

/**
 * Existing-product mask editor.
 *
 * Draw a rectangle over the retailer's sticker; pointers only ever paint flat
 * black inside the boxes. The pristine base photograph is served by an
 * admin-only route (`/admin/masks/[imageId]`), the overlay previews exactly
 * what the storefront will show, and saving writes a NEW public file while the
 * original upload stays untouched.
 */
export function ExistingProductMaskEditor({
  productId,
  images,
}: {
  productId: string;
  images: ProductPhotoRow[];
}) {
  const [openImageId, setOpenImageId] = useState<string | null>(
    () => images.find((image) => image.coverMode && image.coverMode !== "NONE")?.id ?? null,
  );

  if (images.length === 0) {
    return (
      <p className="text-sm text-ink-500">This product has no photos yet.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {images.map((image) => {
        const savedBoxes = parseBoxes(image.maskBoxes);
        return (
          <li key={image.id} className="rounded-xl border border-ink-200 p-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                className="h-16 w-16 rounded-lg border border-ink-200 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">
                  {image.alt || "Photo"}
                </p>
                <p className="text-xs text-ink-500">
                  {image.coverMode ? COVER_LABEL[image.coverMode] ?? image.coverMode : "No cover"}
                  {savedBoxes.length > 0
                    ? ` · ${savedBoxes.length} saved box${savedBoxes.length === 1 ? "" : "es"}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setOpenImageId(openImageId === image.id ? null : image.id)}
              >
                {openImageId === image.id ? "Close" : "Mask price tags"}
              </button>
            </div>
            {openImageId === image.id ? (
              <MaskEditor key={image.id} productId={productId} image={image} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function MaskEditor({
  productId,
  image,
}: {
  productId: string;
  image: ProductPhotoRow;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const [boxes, setBoxes] = useState<MaskBox[]>(() => parseBoxes(image.maskBoxes));
  const [history, setHistory] = useState<MaskBox[][]>([]);
  const [draft, setDraft] = useState<MaskBox | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function commitHistory() {
    setHistory((h) => [...h, boxes]);
  }

  function normPoint(clientX: number, clientY: number) {
    const frame = frameRef.current!;
    const rect = frame.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !frameRef.current) return;
    const frame = frameRef.current;
    const point = normPoint(e.clientX, e.clientY);
    const width = frame.clientWidth;
    const height = frame.clientHeight;

    for (let index = boxes.length - 1; index >= 0; index -= 1) {
      const box = boxes[index];
      const corners = [
        { x: box.x0, y: box.y0 },
        { x: box.x0, y: box.y1 },
        { x: box.x1, y: box.y0 },
        { x: box.x1, y: box.y1 },
      ];
      const names = ["nw", "sw", "ne", "se"] as const;
      const fixed: Record<string, { x: number; y: number }> = {
        nw: { x: box.x1, y: box.y1 },
        sw: { x: box.x1, y: box.y0 },
        ne: { x: box.x0, y: box.y1 },
        se: { x: box.x0, y: box.y0 },
      };

      for (let c = 0; c < 4; c += 1) {
        const dx = (corners[c].x - point.x) * width;
        const dy = (corners[c].y - point.y) * height;
        if (dx * dx + dy * dy <= HANDLE_PX * HANDLE_PX) {
          commitHistory();
          gestureRef.current = {
            mode: "resize",
            index,
            start: point,
            orig: { ...box },
            corner: names[c],
            fixed: fixed[names[c]],
          };
          setSelected(index);
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }

      if (point.x >= box.x0 && point.x <= box.x1 && point.y >= box.y0 && point.y <= box.y1) {
        commitHistory();
        gestureRef.current = {
          mode: "move",
          index,
          start: point,
          orig: { ...box },
        };
        setSelected(index);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    commitHistory();
    gestureRef.current = {
      mode: "draw",
      index: boxes.length,
      start: point,
      orig: { x0: 0, y0: 0, x1: 0, y1: 0 },
    };
    setSelected(null);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const point = normPoint(e.clientX, e.clientY);

    if (gesture.mode === "draw") {
      setDraft({
        x0: Math.min(gesture.start.x, point.x),
        y0: Math.min(gesture.start.y, point.y),
        x1: Math.max(gesture.start.x, point.x),
        y1: Math.max(gesture.start.y, point.y),
      });
      return;
    }

    setBoxes((prev) => {
      const box = prev[gesture.index];
      if (!box) return prev;
      const next = [...prev];

      if (gesture.mode === "move") {
        const dx = point.x - gesture.start.x;
        const dy = point.y - gesture.start.y;
        const x0 = clamp01(gesture.orig.x0 + dx);
        const x1 = clamp01(gesture.orig.x1 + dx);
        const y0 = clamp01(gesture.orig.y0 + dy);
        const y1 = clamp01(gesture.orig.y1 + dy);
        if (x1 - x0 < MIN_BOX || y1 - y0 < MIN_BOX) return prev;
        next[gesture.index] = { x0, y0, x1, y1 };
        return next;
      }

      if (gesture.corner && gesture.fixed) {
        const { corner, fixed } = gesture;
        const movingX = corner.endsWith("w");
        const movingY = corner.startsWith("n");
        let x0 = box.x0;
        let x1 = box.x1;
        let y0 = box.y0;
        let y1 = box.y1;
        if (movingX) {
          x0 = clamp01(Math.min(point.x, Math.max(0, fixed.x - MIN_BOX)));
        } else {
          x1 = clamp01(Math.max(point.x, Math.min(1, fixed.x + MIN_BOX)));
        }
        if (movingY) {
          y0 = clamp01(Math.min(point.y, Math.max(0, fixed.y - MIN_BOX)));
        } else {
          y1 = clamp01(Math.max(point.y, Math.min(1, fixed.y + MIN_BOX)));
        }
        next[gesture.index] = { x0, y0, x1, y1 };
        return next;
      }

      return prev;
    });
  }

  function onPointerUp() {
    gestureRef.current = null;
    setDraft(null);
  }

  function undo() {
    if (history.length === 0) return;
    setSelected(null);
    setDraft(null);
    setBanner(null);
    setBoxes(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }

  function removeSelected() {
    if (selected === null) return;
    commitHistory();
    setBoxes(boxes.filter((_, index) => index !== selected));
    setSelected(null);
  }

  function resetAll() {
    commitHistory();
    setBoxes([]);
    setSelected(null);
    setDraft(null);
    setBanner(null);
  }

  function clientError(): string | null {
    if (boxes.length > MAX_BOXES) {
      return `A photo can carry at most ${MAX_BOXES} covers.`;
    }
    for (const box of boxes) {
      if (box.x1 - box.x0 < MIN_BOX || box.y1 - box.y0 < MIN_BOX) {
        return "One of the boxes is too small to draw.";
      }
    }
    const totalArea = boxes.reduce((sum, box) => sum + (box.x1 - box.x0) * (box.y1 - box.y0), 0);
    if (totalArea > MAX_AREA) {
      return "Those boxes cover too much of the photo. Select only the price sticker(s).";
    }
    return null;
  }

  async function save() {
    if (saving) return;
    const validation = clientError();
    if (validation) {
      setBanner({ tone: "danger", text: validation });
      return;
    }

    setBanner(null);
    setSaving(true);
    try {
      const body = new FormData();
      body.set("productId", productId);
      body.set("imageId", image.id);
      body.set(
        "boxes",
        JSON.stringify(boxes.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 }))),
      );
      const result = await saveProductMasksAction(body);
      if (result.ok) {
        setBanner({
          tone: "success",
          text: boxes.length === 0
            ? "Covers cleared — the pristine photo is live again."
            : `Saved ${boxes.length} cover${boxes.length === 1 ? "" : "s"}. The storefront now serves the new photo.`,
        });
        setHistory([]);
        router.refresh();
      } else {
        setBanner({ tone: "danger", text: result.error ?? "The covers could not be saved." });
      }
    } catch {
      setBanner({ tone: "danger", text: "The covers could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) {
      e.preventDefault();
      removeSelected();
    }
  }

  return (
    <div className="mt-4">
      {banner ? (
        <div className="mb-3">
          <Alert tone={banner.tone}>{banner.text}</Alert>
        </div>
      ) : null}

      <p className="mb-2 text-xs text-ink-500">
        Drag on the photo to draw a cover. Drag inside a box to move it; pull a
        corner to resize; click a box to select it. Black is exactly what the
        storefront shows — everything else stays untouched.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div
          ref={frameRef}
          tabIndex={0}
          role="application"
          aria-label="Price tag mask editor"
          className="relative cursor-crosshair overflow-hidden rounded-xl border border-ink-200 bg-ink-100 outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/admin/masks/${image.id}`}
            alt=""
            draggable={false}
            className="pointer-events-none block h-auto w-full select-none"
          />
          {draft ? (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-white/90 bg-black/40"
              style={{
                left: `${draft.x0 * 100}%`,
                top: `${draft.y0 * 100}%`,
                width: `${(draft.x1 - draft.x0) * 100}%`,
                height: `${(draft.y1 - draft.y0) * 100}%`,
              }}
            />
          ) : null}
          {boxes.map((box, index) => {
            const isSelected = index === selected;
            return (
              <div
                key={index}
                className={
                  "pointer-events-none absolute bg-black " +
                  (isSelected ? "ring-2 ring-white/80" : "opacity-95")
                }
                style={{
                  left: `${box.x0 * 100}%`,
                  top: `${box.y0 * 100}%`,
                  width: `${(box.x1 - box.x0) * 100}%`,
                  height: `${(box.y1 - box.y0) * 100}%`,
                }}
              >
                {isSelected ? (
                  <>
                    {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                      <span
                        key={corner}
                        className="absolute h-3 w-3 border border-black bg-white shadow"
                        style={
                          corner === "nw"
                            ? { left: 0, top: 0, transform: "translate(-50%, -50%)" }
                            : corner === "ne"
                              ? { right: 0, top: 0, transform: "translate(50%, -50%)" }
                              : corner === "sw"
                                ? { left: 0, bottom: 0, transform: "translate(-50%, 50%)" }
                                : { right: 0, bottom: 0, transform: "translate(50%, 50%)" }
                        }
                      />
                    ))}
                    <span className="absolute -top-6 left-0 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Box {index + 1}
                    </span>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={undo}
            disabled={history.length === 0}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={removeSelected}
            disabled={selected === null}
          >
            Remove selected box
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={resetAll}
            disabled={boxes.length === 0 && draft === null}
          >
            Clear all covers
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm mt-1"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : boxes.length === 0 ? "Save — remove covers" : `Save ${boxes.length} cover${boxes.length === 1 ? "" : "s"}`}
          </button>
          <p className="mt-1 text-xs text-ink-500">
            You can draw up to {MAX_BOXES} covers. Saving never touches the
            original upload — it publishes a fresh photo and keeps a pristine
            copy that clearing restores.
          </p>
        </div>
      </div>
    </div>
  );
}