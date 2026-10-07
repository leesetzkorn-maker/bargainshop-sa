import "server-only";

import sharp from "sharp";
import { detectPriceTagBoxes } from "@/lib/photo-blackout/detect";
import { combinePriceReads, readPriceTag, type PriceRead } from "./price-read";
import { identifyBrand, matchCategory, suggestProductType, type CategoryOption } from "./identify";
import { readText } from "./ocr";
import type { MaskBox } from "./photos";

/**
 * What the system works out from a freshly uploaded photo, before Lee touches
 * anything:
 *
 *   1. where a retailer price tag appears (local pixel detection),
 *   2. what the tag says (OCR, time-boxed, never fatal),
 *   3. what the item appears to be (brand / type / category, only from words
 *      that were actually read).
 *
 * Every step is allowed to come back empty. "Nothing found" is a normal answer
 * that moves Lee to the manual path — it is never filled in with a guess.
 */

const ANALYSIS_WIDTH = 480;

/** Enough raw text to identify with, without shipping a whole OCR dump. */
const MAX_TEXT_CHARS = 600;

export interface PhotoAnalysis {
  /** Decoded frame size, so the admin can lay out the preview. */
  width: number;
  height: number;
  /** Candidate tag regions, normalised 0..1, best first. These seed the mask. */
  tagBoxes: MaskBox[];
  /** null when no automatic reading was possible (engine off, slow or failed). */
  price: PriceRead | null;
  /** True when OCR itself could not run — Lee enters the cost by hand. */
  ocrUnavailable: boolean;
  brand: { brand: string; confidence: string; all: string[] } | null;
  productType: string | null;
  category: { id: string; name: string; score: number } | null;
  /** Whatever was read, trimmed, for the admin trail. */
  text: string;
}

export interface AnalyseOptions {
  /**
   * Run the (comparatively slow) text read. Detection is cheap and always
   * runs, so a batch can be laid out instantly and only the photo that
   * actually shows a tag pays for the OCR pass.
   */
  withOcr?: boolean;
}

export async function analysePhotoBytes(
  bytes: Buffer,
  categories: CategoryOption[] = [],
  options: AnalyseOptions = {},
): Promise<PhotoAnalysis> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("That photo could not be decoded.");
  }

  const tagBoxes = await detectTagBoxes(bytes, width, height);

  const lines =
    options.withOcr === false
      ? null
      : await readText(bytes, tagBoxes.length > 0 ? { box: tagBoxes[0] } : undefined);
  const price = lines ? readPriceTag(lines) : null;
  const text = (lines ?? [])
    .map((line) => line.text)
    .join(" ")
    .slice(0, MAX_TEXT_CHARS);

  const brand = identifyBrand(text);

  return {
    width,
    height,
    tagBoxes,
    price,
    ocrUnavailable: options.withOcr === false ? false : lines === null,
    brand: brand ? { brand: brand.brand, confidence: brand.confidence, all: brand.all } : null,
    productType: suggestProductType(text),
    category: matchCategory(text, categories),
    text,
  };
}

/**
 * The detector runs on a small analysis copy: 480px is enough to find a paper
 * ticket and keeps the whole pass well under a second.
 */
async function detectTagBoxes(bytes: Buffer, width: number, height: number): Promise<MaskBox[]> {
  const analysisWidth = Math.min(ANALYSIS_WIDTH, width);
  const analysisHeight = Math.max(1, Math.round((height / width) * analysisWidth));

  const { data, info } = await sharp(bytes)
    .resize({ width: analysisWidth, height: analysisHeight, fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return detectPriceTagBoxes(data, info.width, info.height, info.channels)
    .slice(0, 4)
    .map((box) => ({
      x0: Math.max(0, Math.min(1, box.x0)),
      y0: Math.max(0, Math.min(1, box.y0)),
      x1: Math.max(0, Math.min(1, box.x1)),
      y1: Math.max(0, Math.min(1, box.y1)),
    }));
}

/**
 * Combine the reads from several photos of the SAME item — which is what an
 * intake batch is — into one source cost.
 */
export function combineAnalyses(analyses: PhotoAnalysis[]): PriceRead | null {
  const reads = analyses
    .map((analysis) => analysis.price)
    .filter((read): read is PriceRead => read !== null);
  if (reads.length === 0) return null;
  return combinePriceReads(reads);
}
