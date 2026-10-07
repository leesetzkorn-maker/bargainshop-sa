import "server-only";

import sharp from "sharp";
import type { OcrLine } from "./price-read";

/**
 * Reading the text on a price tag, with a hard ceiling on how long it may take.
 *
 * OCR is an aid, never an authority: everything it produces is graded by
 * `price-read`, and anything below the confidence bar comes back to Lee as
 * "PRICE NEEDS CONFIRMATION" instead of a number. That is why a slow or
 * unavailable engine is not an error here — it degrades to "type it in", which
 * is the fallback the store specified.
 *
 * The worker is created lazily and cached. Every call is raced against a
 * timeout so a wedged engine can never stall a server action.
 */

/** A wedged OCR engine must not hold an admin action open. */
const OCR_TIMEOUT_MS = 15_000;

interface TesseractWorker {
  recognize(image: Buffer | string): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
}

let workerPromise: Promise<TesseractWorker> | null = null;
let disabled = false;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js");
    workerPromise = createWorker("eng", 1, { logger: () => undefined });
  }
  return workerPromise;
}

async function discardWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // A worker that failed to start has nothing to tear down.
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Scale a photo (or a region of it) so the engine sees crisp text, then read it.
 *
 * Returns null when the engine is unavailable, times out or throws — callers
 * treat null as "no automatic reading", never as "no price".
 */
export async function readText(
  bytes: Buffer,
  options: { box?: { x0: number; y0: number; x1: number; y1: number } } = {},
): Promise<OcrLine[] | null> {
  if (disabled) return null;

  try {
    const prepared = await prepareForOcr(bytes, options.box);
    const worker = await withTimeout(getWorker(), OCR_TIMEOUT_MS, "OCR engine did not start in time.");
    const result = await withTimeout(
      worker.recognize(prepared),
      OCR_TIMEOUT_MS,
      "OCR engine did not finish in time.",
    );

    const text = (result.data.text ?? "").trim();
    if (!text) return [];
    // Tesseract grades per line in older releases and per image in newer ones;
    // the global figure is the conservative choice for our confidence checks.
    const confidence = Math.round(result.data.confidence ?? 0);
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ text: line, confidence }));
  } catch (error) {
    console.warn("intake: OCR unavailable", error instanceof Error ? error.message : error);
    disabled = true;
    await discardWorker();
    return null;
  }
}

/** Crop to the tag, blow it up, and hand over a clean PNG. */
async function prepareForOcr(
  bytes: Buffer,
  box?: { x0: number; y0: number; x1: number; y1: number },
): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("That photo could not be decoded.");

  const pipeline = sharp(bytes);
  if (box) {
    const left = Math.max(0, Math.floor(box.x0 * width));
    const top = Math.max(0, Math.floor(box.y0 * height));
    const extractWidth = Math.min(width - left, Math.max(8, Math.ceil((box.x1 - box.x0) * width)));
    const extractHeight = Math.min(height - top, Math.max(8, Math.ceil((box.y1 - box.y0) * height)));
    pipeline.extract({ left, top, width: extractWidth, height: extractHeight });
  }

  const { data, info } = await pipeline
    .resize({ width: 900, fit: "inside", withoutEnlargement: false })
    .greyscale()
    .normalise()
    .png()
    .toBuffer({ resolveWithObject: true });

  if (info.width < 40 || info.height < 40) {
    throw new Error("That region is too small to read.");
  }
  return data;
}
