/**
 * Building the PUBLIC copy of a product photo from the untouched original.
 *
 * The rule this exists for: the photograph of a second-hand item is a record of
 * that exact item, so nothing about the product may change. The only pixels
 * ever altered are inside the rectangles covering the retailer's price tag, and
 * those are painted flat black — never regenerated, never inpainted. If a
 * region cannot be covered safely, the correct answer is a bigger box or no
 * mask at all, not an AI guess.
 *
 * Deliberately free of `server-only` and of any storage import, so the whole
 * pipeline can be unit tested against generated images (tests/intake-photos.test.ts).
 */

import sharp from "sharp";
import { growBox, renderBlackout } from "@/lib/photo-blackout/render";
import type { PriceTagBox } from "@/lib/photo-blackout/detect";
import type { CoverMode } from "./constants";

/** Public gallery photos are capped here; the storefront never needs more. */
export const PUBLIC_MAX_EDGE = 1600;

/** WebP at 86 is visually clean for catalogue photos and keeps galleries fast. */
export const PUBLIC_WEBP_QUALITY = 86;

export interface MaskBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class PublicPhotoError extends Error {}

/** Grow and clamp hand-drawn boxes, refusing the degenerate ones. */
export function prepareMaskBoxes(boxes: MaskBox[], maxAreaRatio = 0.4): PriceTagBox[] {
  if (!Array.isArray(boxes)) throw new PublicPhotoError("Mask boxes must be a list.");
  if (boxes.length > 4) {
    throw new PublicPhotoError("A photo can carry at most 4 covers.");
  }

  const out: PriceTagBox[] = [];
  for (const raw of boxes) {
    const nums = [raw?.x0, raw?.y0, raw?.x1, raw?.y1].map(Number);
    if (nums.some((n) => !Number.isFinite(n))) {
      throw new PublicPhotoError("One of the mask boxes has non-numeric coordinates.");
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
      throw new PublicPhotoError("That box is too small to be a price sticker.");
    }
    if (w * h > maxAreaRatio) {
      throw new PublicPhotoError("That box covers too much of the photo. Select only the price sticker.");
    }

    out.push(growBox({ x0, y0, x1, y1, score: 1, fill: 1, textRatio: 0, pixels: 0 }, 0.01));
  }
  return out;
}

export interface BuildPublicPhotoOptions {
  /** Boxes to cover, in 0..1 coordinates of the ORIGINAL frame. */
  boxes?: MaskBox[];
  coverMode?: CoverMode;
  maxEdge?: number;
  quality?: number;
}

/**
 * Resize the original down to a web-ready photo and cover the tag.
 *
 * With no boxes this is a straight re-encode: same pixels, smaller file. With
 * boxes, the cover happens BEFORE the resize so the mask edges stay crisp.
 * The input buffer is never modified.
 */
export async function buildPublicPhoto(
  original: Buffer,
  options: BuildPublicPhotoOptions = {},
): Promise<Buffer> {
  const maxEdge = options.maxEdge ?? PUBLIC_MAX_EDGE;
  const quality = options.quality ?? PUBLIC_WEBP_QUALITY;
  const boxes = options.boxes ?? [];

  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height) {
    throw new PublicPhotoError("That photo could not be decoded.");
  }

  const prepared = boxes.length > 0 ? prepareMaskBoxes(boxes) : [];
  const masked = prepared.length > 0 ? await renderBlackout(original, prepared) : original;

  const needsResize = Math.max(meta.width, meta.height) > maxEdge;
  const pipeline = needsResize
    ? sharp(masked).resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    : sharp(masked);

  return pipeline.webp({ quality, effort: 4 }).toBuffer();
}
