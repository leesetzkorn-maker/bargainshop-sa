import sharp from "sharp";

export type TagPolygon = Array<[number, number]>;

/** Reviewed tag outlines only; no detection, padding, inpainting or resizing. */
export async function renderReviewedTags(bytes: Buffer, polygons: TagPolygon[]): Promise<Buffer> {
  if (!polygons.length || polygons.length > 8) throw new Error("Select 1–8 retailer tags.");
  for (const polygon of polygons) {
    if (polygon.length < 3 || polygon.length > 16 || polygon.some(point =>
      point.length !== 2 || point.some(n => !Number.isFinite(n) || n < 0 || n > 1))) {
      throw new Error("Invalid tag outline.");
    }
    const area = Math.abs(polygon.reduce((sum, [x, y], i) => {
      const next = polygon[(i + 1) % polygon.length];
      return sum + x * next[1] - next[0] * y;
    }, 0)) / 2;
    if (area < 0.00001 || area > 0.4) throw new Error("Tag outline covers an unsafe area.");
  }
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  for (const polygon of polygons) {
    const points = polygon.map(([x, y]) => [x * width, y * height]);
    const left = Math.floor(Math.min(...points.map(p => p[0])));
    const right = Math.min(width, Math.ceil(Math.max(...points.map(p => p[0]))));
    const top = Math.floor(Math.min(...points.map(p => p[1])));
    const bottom = Math.min(height, Math.ceil(Math.max(...points.map(p => p[1]))));
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) &&
          x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) {
        const offset = (y * width + x) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 4 }).toBuffer();
}
