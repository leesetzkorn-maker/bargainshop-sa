import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { UPLOAD_DIR, isInsideBase, readStoredFile } from "@/lib/storage";
import { detectPriceTagBoxes, padBox, type PriceTagBox } from "./detect";

/**
 * Cover the shop's own price sticker with a solid black rectangle.
 *
 * This is deliberately NOT a generative edit. The photograph is a record of one
 * physical second-hand item, and a model asked to "remove the sticker" is a
 * model asked to invent the surface underneath — which is how a scratch, a
 * logo or a serial number disappears from a listing. Here every pixel outside
 * the rectangles the admin drew is the original file, bit for bit, and the
 * rectangles themselves are flat black. Nothing is inferred, nothing is
 * re-rendered, and nothing outside the drawn box can move.
 *
 * The original file is never overwritten: a blackout writes a new key and the
 * caller records the old URL, so the operation is reversible.
 */

/** Analysis width for detection. Small enough to run in well under a second. */
export const ANALYSIS_WIDTH = 480;

/** A photo may carry more than one sticker (a neighbouring item's tag, say). */
export const MAX_BOXES = 4;

/** Boxes are grown slightly: a box that clips to the pixel leaves a rim. */
export const SAFETY_PAD_RATIO = 0.01;

/** Flat black, so nobody mistakes the cover for part of the product. */
const BLACKOUT_COLOR = "#000000";

export class BlackoutError extends Error {}

export interface StoredImage {
  url: string;
  bytes: Buffer;
}

export interface BoxInput {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Read a product image back off disk.
 *
 * Only our own `/uploads/products/` paths are resolvable; anything else is a
 * link to somewhere we do not control and is refused rather than fetched.
 */
export async function readProductImage(url: string): Promise<Buffer> {
  const bytes = await readStoredFile(url);
  if (!bytes) {
    throw new BlackoutError(
      "That image file could not be read from disk. Re-upload the photo, then try again.",
    );
  }
  return bytes;
}

/** Run the local detector over a stored image. Returns boxes, best first. */
export async function detectPriceTags(url: string): Promise<PriceTagBox[]> {
  const bytes = await readProductImage(url);
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new BlackoutError("That image could not be decoded.");
  }

  const analysisWidth = Math.min(ANALYSIS_WIDTH, width);
  const analysisHeight = Math.max(1, Math.round((height / width) * analysisWidth));

  const { data, info } = await sharp(bytes)
    .resize({ width: analysisWidth, height: analysisHeight, fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return detectPriceTagBoxes(data, info.width, info.height, info.channels);
}

/**
 * Validate normalised boxes and grow them by the safety pad.
 *
 * Refusing a malformed box matters more than it looks: this is the step that
 * decides which pixels get painted, so a box that arrives as `x1 < x0` or as
 * "the whole photograph" must never reach the compositor.
 */
export function normaliseBoxes(boxes: BoxInput[]): PriceTagBox[] {
  if (!Array.isArray(boxes) || boxes.length === 0) {
    throw new BlackoutError("Draw a box around the price sticker first.");
  }
  if (boxes.length > MAX_BOXES) {
    throw new BlackoutError(`A photo can carry at most ${MAX_BOXES} covers.`);
  }

  const out: PriceTagBox[] = [];
  for (const raw of boxes) {
    const nums = [raw?.x0, raw?.y0, raw?.x1, raw?.y1].map(Number);
    if (nums.some((n) => !Number.isFinite(n))) {
      throw new BlackoutError("One of the boxes has non-numeric coordinates.");
    }
    let [x0, y0, x1, y1] = nums as [number, number, number, number];
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    x0 = Math.max(0, Math.min(1, x0));
    y0 = Math.max(0, Math.min(1, y0));
    x1 = Math.max(0, Math.min(1, x1));
    y1 = Math.max(0, Math.min(1, y1));

    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 0.004 || h < 0.004) {
      throw new BlackoutError("That box is too small to be a price sticker.");
    }
    if (w * h > 0.4) {
      throw new BlackoutError(
        "That box covers too much of the photo. Select only the price sticker.",
      );
    }

    out.push(
      padBox(
        {
          x0,
          y0,
          x1,
          y1,
          score: 1,
          fill: 1,
          textRatio: 0,
          pixels: Math.round(w * h * 1000000),
        },
        SAFETY_PAD_RATIO,
      ),
    );
  }
  return out;
}

/** Paint the boxes black. Everything outside them is untouched original bytes. */
export async function renderBlackout(bytes: Buffer, boxes: PriceTagBox[]): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new BlackoutError("That image could not be decoded.");
  }

  const rects = boxes
    .map((box) => {
      const x = Math.floor(box.x0 * width);
      const y = Math.floor(box.y0 * height);
      const w = Math.max(1, Math.ceil(box.x1 * width) - x);
      const h = Math.max(1, Math.ceil(box.y1 * height) - y);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${BLACKOUT_COLOR}"/>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`;

  return sharp(bytes)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ lossless: true, effort: 4 })
    .toBuffer();
}

/**
 * Write a new product image file.
 *
 * The key pattern matches `storeProductImage`, which is what lets
 * `deleteStoredFile` and the immutable-cache rule in `next.config.ts` recognise
 * the result without knowing it came from this module.
 */
export async function storeProductImageBytes(bytes: Buffer): Promise<string> {
  if (bytes.length === 0) {
    throw new BlackoutError("The edited image came back empty.");
  }
  const key = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.webp`;
  const target = join(UPLOAD_DIR, key);
  if (!isInsideBase(UPLOAD_DIR, target)) {
    throw new BlackoutError("Invalid image path.");
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(target, bytes);
  return `/uploads/products/${key}`;
}
