import "server-only";

import { readStoredFile, storeAiCandidate, type StoredFile } from "@/lib/storage";
import { getImageEditProvider } from "./registry";
import { buildMaskSvg, usableRegions } from "./remove-price-tag-geometry";
import { AiImageError } from "./types";

/**
 * "Remove price tag with AI".
 *
 * The important part of this file is not the AI call — it is what happens to
 * the AI's answer. A generative editor re-renders the whole photograph, so
 * trusting it with the entire frame would quietly put at risk every requirement
 * that says "preserve the product exactly": the shape, the colour, the logo,
 * the camera angle, the crop, the size, the background treatment.
 *
 * So the model is only ever trusted with a *region*:
 *
 *   1. a vision pass says where the pawn shop's sticker is,
 *   2. an edit pass regenerates the pixels there,
 *   3. the result is composited back through the same region, feathered.
 *
 * Everything outside those rectangles is copied from the untouched original
 * file. That is not a request in a prompt; it is arithmetic on the pixels, so
 * the product, the branding, the serial numbers, the angle, the crop and the
 * size are preserved by construction rather than by the model behaving well.
 *
 * The original file is opened read-only and never written, moved or deleted.
 */

/**
 * The sticker is masked a little larger than its detected box, because a box
 * that clips to the millimetre leaves a visible rim of sticker behind. The
 * bounds themselves live in ./remove-price-tag-geometry, which is unit tested.
 */

interface OriginalImage {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
}

/** Read the original and measure it, so the composite lands on the same grid. */
async function loadOriginal(url: string): Promise<OriginalImage> {
  const bytes = await readStoredFile(url);
  if (!bytes) {
    throw new AiImageError("That photo could not be read from storage. Try re-uploading it.");
  }

  const sharp = await import("sharp");
  let meta: { width?: number; height?: number; format?: string };
  try {
    meta = await sharp.default(bytes).metadata();
  } catch {
    throw new AiImageError("That file is not a readable image.");
  }

  if (!meta.width || !meta.height) {
    throw new AiImageError("That image's dimensions could not be read.");
  }
  if (meta.width < 64 || meta.height < 64) {
    throw new AiImageError("That photo is too small to edit cleanly.");
  }

  return { bytes, contentType: `image/${meta.format}`, width: meta.width, height: meta.height };
}

/** Keep the output in the format the shop uploaded, so the look does not shift. */
function outputFormatFor(originalContentType: string): {
  format: "jpeg" | "png" | "webp";
  options: Record<string, number>;
} {
  if (originalContentType === "image/png") {
    return { format: "png", options: {} };
  }
  // Nearly every catalogue photo is WebP. Converting to JPEG here would inflate
  // every gallery the storefront serves, for no visual gain on a single sticker.
  if (originalContentType === "image/webp") {
    return { format: "webp", options: { quality: 92 } };
  }
  // 92 is visually indistinguishable from the source for catalogue work and
  // keeps the file small enough that the storefront gallery stays quick.
  return { format: "jpeg", options: { quality: 92 } };
}

export interface PriceTagRemovalResult {
  candidate: StoredFile;
  /** How many stickers were found and removed. */
  removedCount: number;
  /** Model's own words about what it removed, shown to the admin. */
  notes: string[];
}

export async function removePriceTagFromImage(
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<PriceTagRemovalResult> {
  const provider = getImageEditProvider();
  if (!provider.isConfigured()) {
    throw new AiImageError(
      "AI image editing is not set up. Add GEMINI_API_KEY to .env to switch it on.",
    );
  }

  const original = await loadOriginal(sourceUrl);
  const sharp = (await import("sharp")).default;

  const detections = await provider.findPriceSticker(
    { bytes: original.bytes, contentType: original.contentType },
    signal,
  );

  const regions = usableRegions(
    detections.map((detection) => detection.region),
  );

  if (regions.length === 0) {
    throw new AiImageError(
      detections.length > 0
        ? "The model found something, but not a sticker big enough to remove safely. Nothing was changed."
        : "No pawn shop price sticker was found on that photo. Nothing was changed.",
    );
  }

  const edited = await provider.removeRegions(
    { bytes: original.bytes, contentType: original.contentType },
    regions,
    signal,
  );

  // The feather is what hides the seam between regenerated and original pixels.
  // It is a fraction of the sticker, not of the photo, so it cannot reach the
  // product unless the sticker is sitting directly on it — which is exactly
  // where a few blurred pixels of sticker would otherwise show.
  const feather = Math.max(2, Math.round(Math.min(original.width, original.height) * 0.004));

  const maskRaw = await sharp(Buffer.from(buildMaskSvg(regions, original.width, original.height)))
    .removeAlpha()
    .greyscale()
    .blur(feather)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (maskRaw.info.width !== original.width || maskRaw.info.height !== original.height) {
    throw new AiImageError("The blend mask did not match the photo. Nothing was changed.");
  }

  // Hand the mask to the edited image as its alpha channel: opaque where the
  // sticker was, transparent everywhere else.
  const editedWithMask = await sharp(edited.bytes)
    .resize(original.width, original.height, { fit: "fill" })
    .removeAlpha()
    .toColourspace("srgb")
    .joinChannel(maskRaw.data, {
      raw: { width: original.width, height: original.height, channels: 1 },
    })
    .png()
    .toBuffer();

  const { format, options } = outputFormatFor(original.contentType);
  const composite = await sharp(original.bytes)
    .composite([{ input: editedWithMask, blend: "over" }])
    .toFormat(format, options)
    .toBuffer();

  const candidate = await storeAiCandidate(composite, `image/${format}`);

  return {
    candidate,
    removedCount: regions.length,
    notes: detections.map((detection) => detection.description).filter(Boolean),
  };
}