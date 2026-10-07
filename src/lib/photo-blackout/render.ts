import sharp from "sharp";
import type { PriceTagBox } from "./detect";

/**
 * Pixel geometry of a blackout, with no storage or server concerns.
 *
 * Everything in this module is a pure function of the bytes it is handed: it
 * never reads, writes or deletes a file, which is what lets the mask behaviour
 * be unit tested (tests/price-blackout.test.ts) without touching the catalogue.
 */

/** Flat black, so nobody mistakes the cover for part of the product. */
export const BLACKOUT_COLOR = "#000000";

/** Paint the boxes black. Everything outside them is untouched original bytes. */
export async function renderBlackout(bytes: Buffer, boxes: PriceTagBox[]): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("That image could not be decoded.");
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
    .toBuffer();
}

/**
 * Expand a box by a ratio of its own size and clamp it to the frame.
 *
 * A box that clips to the millimetre leaves a visible rim of sticker behind,
 * so both the automatic and the hand-drawn paths pad before painting.
 */
export function growBox(box: PriceTagBox, ratio: number): PriceTagBox {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  return {
    ...box,
    x0: Math.max(0, box.x0 - w * ratio),
    y0: Math.max(0, box.y0 - h * ratio),
    x1: Math.min(1, box.x1 + w * ratio),
    y1: Math.min(1, box.y1 + h * ratio),
  };
}
