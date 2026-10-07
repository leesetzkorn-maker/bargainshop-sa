"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  deleteIntakePhotoAction,
  saveIntakeAction,
  uploadIntakePhotosAction,
  type IntakePhotoView,
  type IntakeSaveState,
  type IntakeUploadState,
} from "@/app/actions/intake";
import { Alert } from "@/components/ui";
import { Field } from "@/components/admin/ui";
import { centsToInput, formatZAR, parseZARToCents } from "@/lib/money";
import { classifyMarket } from "@/lib/intake/market";
import { buildDraftDescription, decidePrice } from "@/lib/intake/draft";
import { combinePriceReads, type PriceRead } from "@/lib/intake/price-read";
import { suggestTitle } from "@/lib/intake/identify";
import type { MaskBox } from "@/lib/intake/photos";
import { DISPOSITIONS, type Disposition } from "@/lib/intake/constants";
import { pricingBreakdown, type PricingSettings } from "@/lib/pricing";
import {
  MEASUREMENT_SOURCES,
  PRODUCT_CONDITIONS,
  PRODUCT_CONDITION_LABELS,
  TESTING_STATUSES,
  TESTING_STATUS_LABELS,
} from "@/lib/enums";

/**
 * Admin → Add stock.
 *
 * The whole intake in one page: photos go up, the system says what it found
 * (tag regions, a price read, a brand), Lee corrects anything it is unsure
 * about, the engine prices it, and the result is saved as a draft.
 *
 * Everything the system suggests is visibly a suggestion: a read that is not
 * confident says "price needs confirmation", a mask can be redrawn or dropped,
 * and no number on this page becomes public until the save button.
 */

const CONDITION_LABELS: Record<string, string> = PRODUCT_CONDITION_LABELS;
const MEASUREMENT_LABELS: Record<string, string> = {
  MEASURED: "Measured",
  ESTIMATED: "Estimated",
};
const DISPOSITION_LABELS: Record<Disposition, string> = {
  PUBLISH: "Publish",
  HOLD: "Hold",
  BUNDLE: "Bundle",
  DO_NOT_BUY: "Don't buy",
};

interface MaskState {
  boxes: MaskBox[];
  mode: "auto" | "manual" | "none";
  accepted: boolean;
}

/** What Lee has typed into the details so far; anything absent falls back to a suggestion. */
interface DetailsDraft {
  name?: string;
  brand?: string;
  model?: string;
  categoryId?: string;
  condition?: string;
  conditionNote?: string;
  description?: string;
  specifications?: string;
  includedItems?: string;
  productWeightGrams?: string;
  packageWeightGrams?: string;
  packageLengthCm?: string;
  packageWidthCm?: string;
  packageHeightCm?: string;
  stockQty?: string;
  measurementSource?: string;
  testingStatus?: string;
  adminNotes?: string;
}

const initialUpload: IntakeUploadState = { ok: false };
const initialSave: IntakeSaveState = { ok: false };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function IntakeWizard({
  categories,
  pricingSettings,
}: {
  categories: Array<{ id: string; name: string }>;
  pricingSettings: PricingSettings;
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadIntakePhotosAction, initialUpload);
  const [saveState, saveAction, savePending] = useActionState(saveIntakeAction, initialSave);

  // The action reports each batch together with the ones before it, so the
  // batch is derived; dropping a photo only records the key.
  const [removedKeys, setRemovedKeys] = useState<string[]>([]);
  const [masks, setMasks] = useState<Record<string, MaskState>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Every field starts empty: the value shown is the suggestion below until
  // Lee types, and what he types (even clearing a field) wins from then on.
  const [details, setDetails] = useState<DetailsDraft>({});
  const [sourceCostText, setSourceCostText] = useState<string | null>(null);
  const [sourceConfirmed, setSourceConfirmed] = useState<boolean | null>(null);
  const [priceText, setPriceText] = useState("");
  const [disposition, setDisposition] = useState<Disposition>("HOLD");
  const [comparable, setComparable] = useState(false);
  const [ceilingText, setCeilingText] = useState("");

  const removed = new Set(removedKeys);
  const photos = (uploadState.photos ?? []).filter((photo) => !removed.has(photo.key));

  const first = photos[0] ?? null;
  const suggestion = useMemo(() => {
    if (!first) return null;
    const brand = first.brand?.brand ?? "";
    return {
      brand,
      name: suggestTitle({ brand, type: first.productType ?? "" }),
      categoryId: first.category?.id ?? "",
    };
  }, [first]);

  const nameValue = details.name ?? suggestion?.name ?? "";
  const brandValue = details.brand ?? suggestion?.brand ?? "";
  const categoryIdValue = details.categoryId ?? suggestion?.categoryId ?? "";
  const conditionValue = details.condition ?? "GOOD";
  const descriptionValue =
    details.description ??
    (nameValue
      ? buildDraftDescription({ name: nameValue, brand: brandValue, condition: conditionValue })
      : "");
  const maskFor = (photo: IntakePhotoView): MaskState =>
    masks[photo.key] ?? {
      boxes: photo.tagBoxes,
      mode: photo.tagBoxes.length > 0 ? "auto" : "none",
      accepted: false,
    };

  const combined: PriceRead | null = useMemo(() => {
    const reads = photos
      .map((photo) => photo.price)
      .filter((read): read is PriceRead => read !== null);
    if (reads.length === 0) return null;
    return combinePriceReads(reads);
  }, [photos]);

  // The tag read fills the cost fields until Lee types over them.
  const sourceCostValue =
    sourceCostText ?? (combined?.sourceCostCents ? centsToInput(combined.sourceCostCents) : "");
  const sourceConfirmedValue = sourceConfirmed ?? combined?.confidence === "CONFIRMED";

  const sourceCostCents = parseZARToCents(sourceCostValue);
  const manualPriceCents = parseZARToCents(priceText);
  const decision = decidePrice({ sourceCostCents, manualPriceCents, settings: pricingSettings });
  const breakdown = pricingBreakdown(sourceCostCents, decision.priceCents || null, pricingSettings);
  const verdict = classifyMarket({
    sourceCostCents,
    sellingPriceCents: decision.priceCents || null,
    settings: pricingSettings,
    marketCeilingCents: parseZARToCents(ceilingText),
    hasComparableResearch: comparable,
  });

  const photosPayload = JSON.stringify(
    photos.map((photo) => {
      const mask = maskFor(photo);
      return {
        key: photo.key,
        boxes: mask.boxes,
        coverMode: mask.mode === "none" ? "NONE" : mask.mode === "auto" ? "AUTO_MASK" : "MANUAL_MASK",
      };
    }),
  );

  const setMask = (key: string, boxes: MaskBox[], mode: MaskState["mode"], accepted = false) =>
    setMasks((current) => ({ ...current, [key]: { boxes, mode, accepted } }));

  const removePhoto = async (key: string) => {
    const body = new FormData();
    body.set("key", key);
    await deleteIntakePhotoAction(body);
    setRemovedKeys((current) => (current.includes(key) ? current : [...current, key]));
    setMasks((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const editing = editingKey ? photos.find((photo) => photo.key === editingKey) ?? null : null;
  const editingMask = editing ? maskFor(editing) : undefined;
  const priceRead = combined;

  return (
    <div className="space-y-6">
      {saveState.error ? (
        <Alert tone="danger">{saveState.error}</Alert>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* 1. Photos                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">1. Photos</h2>
          <p className="mt-1 text-sm text-ink-600">
            Upload every angle of the same item together — they become one listing with a gallery.
            Your originals are archived untouched; only the copies the shop sees get a price tag
            covered.
          </p>
        </div>

        <form action={uploadAction} className="space-y-3">
          <input
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            required
            className="block w-full text-sm text-ink-600 file:btn file:btn-secondary file:mr-3"
          />
          <button type="submit" className="btn btn-primary" disabled={uploadPending}>
            {uploadPending ? "Analysing…" : photos.length > 0 ? "Add more photos" : "Upload & analyse"}
          </button>
          {uploadState.error && !uploadPending ? (
            <p role="alert" className="text-sm text-red-700">
              {uploadState.error}
            </p>
          ) : null}
        </form>

        {photos.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo, index) => {
              const mask = maskFor(photo);
              return (
                <li key={photo.key} className="rounded-lg border border-ink-200 bg-white p-3">
                  <div className="relative overflow-hidden rounded border border-ink-100 bg-ink-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={`Upload ${index + 1}`} className="block w-full" />
                    {mask.boxes.map((box, boxIndex) => (
                      <span
                        key={boxIndex}
                        aria-hidden
                        className="absolute bg-black"
                        style={{
                          left: `${box.x0 * 100}%`,
                          top: `${box.y0 * 100}%`,
                          width: `${(box.x1 - box.x0) * 100}%`,
                          height: `${(box.y1 - box.y0) * 100}%`,
                        }}
                      />
                    ))}
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-ink-600">
                    <p>
                      Tag regions found:{" "}
                      <strong>{photo.tagBoxes.length > 0 ? photo.tagBoxes.length : "none"}</strong>
                    </p>
                    <PriceReadLine photo={photo} combined={priceRead} />
                    {photo.brand ? (
                      <p>
                        Brand read: <strong>{photo.brand.brand}</strong> ({photo.brand.confidence.toLowerCase()})
                      </p>
                    ) : null}
                    {photo.productType ? (
                      <p>
                        Looks like: <strong>{photo.productType}</strong>
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        setMask(photo.key, photo.tagBoxes, photo.tagBoxes.length ? "auto" : "none", true)
                      }
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setMask(photo.key, photo.tagBoxes, photo.tagBoxes.length ? "auto" : "none")}
                      disabled={photo.tagBoxes.length === 0}
                    >
                      Retry mask
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditingKey(photo.key)}
                    >
                      Manual mask
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setMask(photo.key, [], "none", true)}
                    >
                      Use original
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void removePhoto(photo.key)}
                    >
                      Remove
                    </button>
                  </div>

                  <p className="mt-1 text-[11px] text-ink-500">
                    {mask.mode === "none"
                      ? "No cover — the full photo, tag included, will be public."
                      : `${mask.mode === "auto" ? "Automatic" : "Manual"} black cover over ${mask.boxes.length} region${mask.boxes.length === 1 ? "" : "s"}.`}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. Mask review                                                   */}
      {/* ---------------------------------------------------------------- */}
      {editing && editingMask ? (
        <MaskReview
          photo={editing}
          mask={editingMask}
          onChange={(boxes, mode) => setMask(editing.key, boxes, mode)}
          onClose={() => setEditingKey(null)}
        />
      ) : null}

      {/* Everything below the photos is one form: the source cost, the price
          and the details all submit together with the batch. */}
      <form action={saveAction} className="space-y-6">
        {/* The photos being saved, as the server expects them. */}
        <input type="hidden" name="photos" value={photosPayload} />

        {/* ---------------------------------------------------------------- */}
        {/* 2. Source cost                                                   */}
        {/* ---------------------------------------------------------------- */}
        <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">2. Source cost</h2>

        {priceRead ? (
          <Alert tone={priceRead.confidence === "CONFIRMED" ? "success" : "info"}>
            <strong>
              {priceRead.confidence === "CONFIRMED"
                ? "Price read"
                : priceRead.confidence === "NEEDS_CONFIRMATION"
                  ? "Price needs confirmation"
                  : "No price read"}
            </strong>{" "}
            — {priceRead.note}
          </Alert>
        ) : photos.length > 0 ? (
          <Alert tone="info">
            No automatic reading for this batch. Type the price off the tag and tick the box below.
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Source cost (what you paid)" hint="Private — never shown publicly.">
            <input
              className="input"
              name="sourceCost"
              inputMode="decimal"
              placeholder="e.g. 495"
              value={sourceCostValue}
              onChange={(event) => {
                setSourceCostText(event.target.value);
                setSourceConfirmed(false);
              }}
            />
          </Field>
          <Field label="Selling price" hint={decision.recommendedPriceCents ? `Engine recommends ${formatZAR(decision.recommendedPriceCents)}` : "Enter a source cost for a recommendation"}>
            <input
              className="input"
              name="price"
              inputMode="decimal"
              placeholder="e.g. 799"
              value={priceText}
              onChange={(event) => setPriceText(event.target.value)}
            />
          </Field>
          <Field label="Stock / reference number" hint="Read from the tag when visible.">
            <input
              className="input"
              name="stockRef"
              defaultValue={priceRead?.stockRef ?? ""}
              placeholder="e.g. S029164A"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="sourceConfirmed"
            checked={sourceConfirmedValue}
            onChange={(event) => setSourceConfirmed(event.target.checked)}
          />
          I checked this amount against the photo — confirm it as the source cost
        </label>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Pricing                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">3. Pricing</h2>

        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Source cost" value={sourceCostCents != null ? formatZAR(sourceCostCents) : "—"} />
          <Metric
            label="Recommended selling price"
            value={decision.recommendedPriceCents ? formatZAR(decision.recommendedPriceCents) : "—"}
          />
          <Metric
            label="Estimated profit"
            value={breakdown.grossProfitCents != null ? formatZAR(breakdown.grossProfitCents) : "—"}
          />
          <Metric
            label="Margin %"
            value={breakdown.marginPercent != null ? `${breakdown.marginPercent.toFixed(1)}%` : "—"}
          />
        </div>

        <div
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            verdict.flag === "LOW_MARGIN"
              ? "border-red-300 bg-red-50 text-red-800"
              : verdict.flag === "GOOD_MARGIN"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : verdict.flag
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-ink-200 bg-ink-50 text-ink-600"
          }`}
        >
          {verdict.label}
          {verdict.warning ? <span className="mt-0.5 block font-normal">{verdict.warning}</span> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Comparable resale ceiling" hint="Optional. Above this, review before publishing.">
            <input
              className="input"
              name="marketCeiling"
              inputMode="decimal"
              value={ceilingText}
              onChange={(event) => setCeilingText(event.target.value)}
            />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name="comparableResearch"
              checked={comparable}
              onChange={(event) => setComparable(event.target.checked)}
            />
            I checked comparable listings for this item
          </label>
          <Field label="What are you doing with it?">
            <select
              className="input"
              name="disposition"
              value={disposition}
              onChange={(event) => setDisposition(event.target.value as Disposition)}
            >
              {DISPOSITIONS.map((value) => (
                <option key={value} value={value}>
                  {DISPOSITION_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

        {/* ---------------------------------------------------------------- */}
        {/* 4. Details + save                                                */}
        {/* ---------------------------------------------------------------- */}
        <section className="card space-y-5 p-5">
          <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">4. Details &amp; save</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name" error={saveState.fieldErrors?.name?.[0]} className="sm:col-span-2">
            <input
              className="input"
              name="name"
              required
              value={nameValue}
              onChange={(event) => setDetails((d) => ({ ...d, name: event.target.value }))}
            />
          </Field>
          <Field label="Brand">
            <input
              className="input"
              name="brand"
              value={brandValue}
              onChange={(event) => setDetails((d) => ({ ...d, brand: event.target.value }))}
            />
          </Field>
          <Field label="Model">
            <input
              className="input"
              name="model"
              value={details.model ?? ""}
              onChange={(event) => setDetails((d) => ({ ...d, model: event.target.value }))}
            />
          </Field>
          <Field label="Category" error={saveState.fieldErrors?.categoryId?.[0]}>
            <select
              className="input"
              name="categoryId"
              required
              value={categoryIdValue}
              onChange={(event) => setDetails((d) => ({ ...d, categoryId: event.target.value }))}
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition" hint="Judge it from the photos — wear and damage are visible.">
            <select
              className="input"
              name="condition"
              value={conditionValue}
              onChange={(event) => setDetails((d) => ({ ...d, condition: event.target.value }))}
            >
              {PRODUCT_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition note" className="sm:col-span-2">
            <input
              className="input"
              name="conditionNote"
              value={details.conditionNote ?? ""}
              onChange={(event) => setDetails((d) => ({ ...d, conditionNote: event.target.value }))}
            />
          </Field>
          <Field label="Description" error={saveState.fieldErrors?.description?.[0]} className="sm:col-span-2">
            <textarea
              className="input min-h-32"
              name="description"
              required
              value={descriptionValue}
              onChange={(event) => setDetails((d) => ({ ...d, description: event.target.value }))}
            />
          </Field>
          <Field label="Specifications" className="sm:col-span-2">
            <textarea
              className="input min-h-24"
              name="specifications"
              value={details.specifications ?? ""}
              onChange={(event) => setDetails((d) => ({ ...d, specifications: event.target.value }))}
            />
          </Field>
          <Field label="What's included">
            <input
              className="input"
              name="includedItems"
              value={details.includedItems ?? ""}
              onChange={(event) => setDetails((d) => ({ ...d, includedItems: event.target.value }))}
            />
          </Field>
          <Field label="Testing status" hint="Only set tested if you actually switched it on.">
            <select
              className="input"
              name="testingStatus"
              value={details.testingStatus ?? "NOT_TESTED"}
              onChange={(event) => setDetails((d) => ({ ...d, testingStatus: event.target.value }))}
            >
              {TESTING_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {TESTING_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Product weight (g)" error={saveState.fieldErrors?.productWeightGrams?.[0]}>
            <input
              className="input"
              name="productWeightGrams"
              inputMode="numeric"
              value={details.productWeightGrams ?? "0"}
              onChange={(event) => setDetails((d) => ({ ...d, productWeightGrams: event.target.value }))}
            />
          </Field>
          <Field label="Packed weight (g)">
            <input
              className="input"
              name="packageWeightGrams"
              inputMode="numeric"
              value={details.packageWeightGrams ?? "0"}
              onChange={(event) => setDetails((d) => ({ ...d, packageWeightGrams: event.target.value }))}
            />
          </Field>
          <Field label="Packed length (cm)" error={saveState.fieldErrors?.packageLengthCm?.[0]}>
            <input
              className="input"
              name="packageLengthCm"
              inputMode="decimal"
              value={details.packageLengthCm ?? "0"}
              onChange={(event) => setDetails((d) => ({ ...d, packageLengthCm: event.target.value }))}
            />
          </Field>
          <Field label="Packed width (cm)" error={saveState.fieldErrors?.packageWidthCm?.[0]}>
            <input
              className="input"
              name="packageWidthCm"
              inputMode="decimal"
              value={details.packageWidthCm ?? "0"}
              onChange={(event) => setDetails((d) => ({ ...d, packageWidthCm: event.target.value }))}
            />
          </Field>
          <Field label="Packed height (cm)" error={saveState.fieldErrors?.packageHeightCm?.[0]}>
            <input
              className="input"
              name="packageHeightCm"
              inputMode="decimal"
              value={details.packageHeightCm ?? "0"}
              onChange={(event) => setDetails((d) => ({ ...d, packageHeightCm: event.target.value }))}
            />
          </Field>
          <Field label="Shipping figures" hint="Estimated until the packed item is weighed and measured.">
            <select
              className="input"
              name="measurementSource"
              value={details.measurementSource ?? "ESTIMATED"}
              onChange={(event) => setDetails((d) => ({ ...d, measurementSource: event.target.value }))}
            >
              {MEASUREMENT_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {MEASUREMENT_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity" hint="Second-hand stock is usually 1.">
            <input
              className="input"
              name="stockQty"
              inputMode="numeric"
              value={details.stockQty ?? "1"}
              onChange={(event) => setDetails((d) => ({ ...d, stockQty: event.target.value }))}
            />
          </Field>
          <Field label="Admin notes" className="sm:col-span-2">
            <textarea
              className="input min-h-20"
              name="adminNotes"
              value={details.adminNotes ?? ""}
              onChange={(event) => setDetails((d) => ({ ...d, adminNotes: event.target.value }))}
            />
          </Field>
        </div>

        <Alert tone="info">
          Saves as a draft with your photos, source cost and price. Publish from the product page
          once the listing details are complete — nothing goes public from this screen on its own.
        </Alert>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={savePending || photos.length === 0}>
            {savePending ? "Saving…" : disposition === "PUBLISH" ? "Save & publish" : "Save product"}
          </button>
          <Link href="/admin/products" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
        </section>
      </form>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2">
      <span className="block text-[11px] font-bold tracking-wide text-ink-500 uppercase">{label}</span>
      <span className="block text-lg font-bold text-ink-900">{value}</span>
    </div>
  );
}

function PriceReadLine({ photo, combined }: { photo: IntakePhotoView; combined: PriceRead | null }) {
  if (photo.ocrSkipped) {
    return <p>Text read: skipped (one photo is enough for one item)</p>;
  }
  if (photo.ocrUnavailable) {
    return <p>Text read: engine unavailable — enter the cost by hand</p>;
  }
  if (!photo.price || photo.price.confidence === "NONE") {
    return <p>Text read: no price seen on this photo</p>;
  }
  const cents = photo.price.sourceCostCents;
  const shared = combined && cents != null && combined.sourceCostCents === cents;
  return (
    <p>
      This photo: <strong>{cents != null ? formatZAR(cents) : "—"}</strong>
      {shared ? " (used below)" : ""}
    </p>
  );
}

/**
 * Original vs public, side by side, with a draw-it-yourself mask.
 *
 * The preview on the right is the same photograph with the same rectangles
 * painted black that the server will paint — the cover is flat colour, never a
 * regeneration, so what Lee approves here is exactly what customers see.
 */
function MaskReview({
  photo,
  mask,
  onChange,
  onClose,
}: {
  photo: IntakePhotoView;
  mask: MaskState;
  onChange: (boxes: MaskBox[], mode: MaskState["mode"]) => void;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<MaskBox | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const pointAt = (event: React.PointerEvent) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const point = pointAt(event);
    if (!point) return;
    origin.current = point;
    setDraft({ x0: point.x, y0: point.y, x1: point.x, y1: point.y });
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const point = pointAt(event);
    if (!origin.current || !point) return;
    setDraft({
      x0: Math.min(origin.current.x, point.x),
      y0: Math.min(origin.current.y, point.y),
      x1: Math.max(origin.current.x, point.x),
      y1: Math.max(origin.current.y, point.y),
    });
  };

  const onPointerUp = () => {
    const drawn = draft;
    origin.current = null;
    setDraft(null);
    if (!drawn) return;
    if (drawn.x1 - drawn.x0 < 0.02 || drawn.y1 - drawn.y0 < 0.02) return;
    onChange([...mask.boxes, drawn], "manual");
  };

  const boxes = draft ? [...mask.boxes, draft] : mask.boxes;

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-bold tracking-wide text-ink-500 uppercase">
          Review photo — original vs public
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          Drag on the right-hand image to cover the retailer&apos;s price tag. Only those rectangles
          change: the product, wear, logos and accessories stay exactly as photographed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <figure>
          <figcaption className="mb-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
            Original (kept private)
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Untouched original upload" className="w-full rounded border border-ink-200" />
        </figure>
        <figure>
          <figcaption className="mb-1 text-xs font-bold tracking-wide text-ink-500 uppercase">
            Public photo — drag to cover the tag
          </figcaption>
          <div
            ref={frameRef}
            className="relative touch-none select-none overflow-hidden rounded border border-ink-200"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="Public preview with cover" className="block w-full" draggable={false} />
            {boxes.map((box, index) => (
              <span
                key={index}
                aria-hidden
                className="absolute bg-black"
                style={{
                  left: `${box.x0 * 100}%`,
                  top: `${box.y0 * 100}%`,
                  width: `${(box.x1 - box.x0) * 100}%`,
                  height: `${(box.y1 - box.y0) * 100}%`,
                }}
              />
            ))}
          </div>
        </figure>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onChange(mask.boxes, mask.boxes.length ? "manual" : "none");
            onClose();
          }}
        >
          Accept
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange(mask.boxes.slice(0, -1), "manual")}
          disabled={mask.boxes.length === 0}
        >
          Undo cover
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange(photo.tagBoxes, photo.tagBoxes.length ? "auto" : "none")}
          disabled={photo.tagBoxes.length === 0}
        >
          Retry automatic mask
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onChange([], "none")}>
          Use original
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <Alert tone={mask.boxes.length > 0 ? "success" : "info"}>
        {mask.boxes.length > 0
          ? `${mask.boxes.length} region${mask.boxes.length === 1 ? "" : "s"} will be blacked out on the public photo.`
          : "No cover: the public photo will be the full frame, price tag included."}
      </Alert>
    </section>
  );
}
