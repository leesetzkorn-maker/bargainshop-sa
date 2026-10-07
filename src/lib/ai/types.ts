import "server-only";

/**
 * Image-editing provider contract.
 *
 * Two separate capabilities, on purpose:
 *
 *   1. `findPriceSticker` — locate the shop's own price sticker, and return
 *      WHERE it is. This is what makes the tool automatic: the admin does not
 *      paint a mask.
 *   2. `removeRegions` — regenerate the pixels inside those coordinates.
 *
 * Keeping them apart matters for correctness. The caller composites the result
 * back through the same coordinates, so every pixel *outside* the sticker is
 * the untouched original photograph. That is what lets the feature honour
 * "preserve the product exactly" instead of merely asking a model nicely.
 *
 * A provider that cannot separate the two should not implement this interface.
 */

export interface ImagePayload {
  bytes: Buffer;
  contentType: string;
}

/**
 * A rectangle in normalised 0-1 image space, matching Google's `box_2d`
 * convention (ymin, xmin, ymax, xmax) once scaled.
 */
export interface Region {
  y0: number;
  x0: number;
  y1: number;
  x1: number;
}

export interface StickerDetection {
  region: Region;
  /** 0-1. Low-confidence detections are refused rather than acted on. */
  confidence: number;
  /** What the model thinks it found, shown to the admin for the sanity check. */
  description: string;
}

export interface ImageEditProvider {
  readonly key: string;
  readonly label: string;
  /** False when credentials are missing; the admin hides the tools. */
  isConfigured(): boolean;
  findPriceSticker(image: ImagePayload, signal?: AbortSignal): Promise<StickerDetection[]>;
  removeRegions(
    image: ImagePayload,
    regions: Region[],
    signal?: AbortSignal,
  ): Promise<ImagePayload>;
}

/**
 * Every failure the admin is allowed to see, phrased so it tells the store
 * owner what to actually do next. Anything not wrapped in this class is a bug
 * and gets logged and replaced with a generic message.
 */
export class AiImageError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiImageError";
  }
}