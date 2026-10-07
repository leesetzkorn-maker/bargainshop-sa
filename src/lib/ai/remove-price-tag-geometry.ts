/**
 * Geometry for the price-sticker removal blend.
 *
 * Deliberately free of `server-only`, of the filesystem and of the image
 * library, so the bounds that decide *which pixels get replaced* can be unit
 * tested directly (tests/price-tag-removal.test.ts). That matters more than it
 * looks: this module is the mechanism by which the product is protected from
 * the AI, so its behaviour needs to be pinned by tests rather than by reading.
 */

/**
 * The sticker is masked a little larger than its detected box, because a box
 * that clips to the millimetre leaves a visible rim of sticker behind.
 */
export const PADDING_RATIO = 0.01;

/** Hard ceiling on how many regions a single edit may touch. */
export const MAX_REGIONS = 4;

/** Below ~0.04% of the frame a "sticker" is noise, and erasing it risks the product. */
export const MIN_AREA_RATIO = 0.0004;

/** Above this a "sticker" is really the whole photo, so it is refused. */
export const MAX_AREA_RATIO = 0.9;

export interface Region {
  y0: number;
  x0: number;
  y1: number;
  x1: number;
}

export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Turn a normalised region into an integer pixel box with padding applied.
 *
 * The result is always inside the frame and always at least 1x1, so callers can
 * hand it straight to an image library without a second bounds check.
 */
export function expandRegion(
  region: Region,
  width: number,
  height: number,
  paddingRatio = PADDING_RATIO,
): PixelBox {
  const padX = Math.round(width * paddingRatio);
  const padY = Math.round(height * paddingRatio);

  const left = Math.max(0, Math.min(width - 1, Math.floor(region.x0 * width) - padX));
  const top = Math.max(0, Math.min(height - 1, Math.floor(region.y0 * height) - padY));
  const right = Math.max(left + 1, Math.min(width, Math.ceil(region.x1 * width) + padX));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(region.y1 * height) + padY));

  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Drop regions that are too small to be a sticker or too large to be one, and
 * cap how many survive.
 *
 * The upper bound is the important one. A model that returns a box covering
 * most of the frame has not found a sticker, it has failed — and compositing
 * through that box would repaint the entire product, which is precisely the
 * outcome this feature exists to prevent.
 */
export function usableRegions(regions: Region[]): Region[] {
  return regions
    .filter((region) => {
      const area = (region.x1 - region.x0) * (region.y1 - region.y0);
      return area >= MIN_AREA_RATIO && area <= MAX_AREA_RATIO;
    })
    .slice(0, MAX_REGIONS);
}

/**
 * A white-on-transparent SVG of the regions, which becomes the blend mask.
 *
 * White means "replace these pixels with the AI's version"; black means "keep
 * the original". The rounded corners are cosmetic — they stop the mask from
 * reading as a hard rectangular edit where a real sticker had a curved edge.
 */
export function buildMaskSvg(
  regions: Region[],
  width: number,
  height: number,
  paddingRatio = PADDING_RATIO,
): string {
  const rects = regions
    .map((region) => {
      const box = expandRegion(region, width, height, paddingRatio);
      const radius = Math.max(2, Math.round(Math.min(box.width, box.height) * 0.12));
      return `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" rx="${radius}" ry="${radius}" fill="#ffffff"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
}