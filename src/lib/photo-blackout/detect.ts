/**
 * Price-tag detection, as pure pixel geometry.
 *
 * The store must be able to black out the shop's own price sticker on a real
 * photograph without regenerating a single pixel of the product. That means the
 * region has to be *found*, not imagined: this module takes raw pixels and
 * returns boxes, and it never writes an image.
 *
 * It deliberately has no imports — no sharp, no fs, no server-only — so the
 * box-finding rules can be unit tested (tests/price-blackout.test.ts) without
 * an image fixture or a native dependency.
 *
 * What it looks for: a near-white, low-chroma blob that is roughly rectangular
 * and contains dark marks. That is what a printed paper ticket looks like in a
 * shop photograph. A white helmet shell fails the text test and, because it is
 * usually a large share of the frame, the area ceiling as well. The rules are
 * conservative on purpose: a missed sticker is reported as "no candidate" for a
 * human to draw by hand, which is a much better failure than a black box across
 * the product.
 */

/** Normalised box: every value is 0..1 of the frame, so it survives a resize. */
export interface PriceTagBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 0..1, higher means more likely to be the sticker. */
  score: number;
  /** Fraction of the bounding box the blob actually fills. */
  fill: number;
  /** Fraction of dark marks inside the box — the "there is writing here" test. */
  textRatio: number;
  /** Pixels in the blob, in the analysis buffer. */
  pixels: number;
}

export interface DetectOptions {
  /** Blob must cover at least this share of the frame. */
  minAreaRatio?: number;
  /** ...and at most this share. A white shell blows past this. */
  maxAreaRatio?: number;
  /** Blob area / bounding box area. Rectangular things score high. */
  minFill?: number;
  /** Dark-pixel share inside the box has to land in this window. */
  minTextRatio?: number;
  maxTextRatio?: number;
  /** width / height of the bounding box. */
  minAspect?: number;
  maxAspect?: number;
  /** How many boxes to return, best first. */
  maxResults?: number;
}

export const DEFAULTS = {
  minAreaRatio: 0.0012,
  maxAreaRatio: 0.09,
  minFill: 0.5,
  minTextRatio: 0.004,
  maxTextRatio: 0.4,
  minAspect: 0.25,
  maxAspect: 4,
  maxResults: 6,
} as const;

/** Luminance above this counts as paper. */
const PAPER_LUMA = 175;
/** ...and the channels must be close together: paper is not orange or blue. */
const PAPER_CHROMA = 34;
/** Below this a pixel counts as ink. */
const INK_LUMA = 130;
/** Dilation radius used to close the letter-holes in a ticket. */
const CLOSE_RADIUS = 3;

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      let on = 0;
      for (let ny = y0; ny <= y1 && !on; ny++) {
        const row = ny * w;
        for (let nx = x0; nx <= x1; nx++) {
          if (mask[row + nx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      let on = 1;
      for (let ny = y0; ny <= y1 && on; ny++) {
        const row = ny * w;
        for (let nx = x0; nx <= x1; nx++) {
          if (!mask[row + nx]) {
            on = 0;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

/**
 * Find blobs that look like a printed price ticket.
 *
 * `pixels` is raw RGB or RGBA at analysis size (about 480px wide is plenty and
 * keeps this well under a second on a phone-sized server).
 */
export function detectPriceTagBoxes(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number,
  options: DetectOptions = {},
): PriceTagBox[] {
  const cfg = { ...DEFAULTS, ...options };
  const n = width * height;

  const paper = new Uint8Array(n);
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = pixels[i * channels]!;
    const g = pixels[i * channels + 1]!;
    const b = pixels[i * channels + 2]!;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const chroma = mx - mn;
    const pixelLuma = luma(r, g, b);
    paper[i] = pixelLuma >= PAPER_LUMA && chroma <= PAPER_CHROMA ? 1 : 0;
    ink[i] = pixelLuma <= INK_LUMA ? 1 : 0;
  }

  // Closing merges the letters back into a solid ticket.
  const closed = erode(dilate(paper, width, height, CLOSE_RADIUS), width, height, CLOSE_RADIUS);

  // Connected components over the closed mask (iterative, no recursion: a
  // 480x850 frame is ~400k cells and the stack is a flat array either way).
  const label = new Int32Array(n).fill(-1);
  const boxes: PriceTagBox[] = [];
  const stack = new Int32Array(n);
  const total = n;

  for (let seed = 0; seed < total; seed++) {
    if (!closed[seed] || label[seed] !== -1) continue;
    const id = boxes.length;
    let sp = 0;
    stack[sp++] = seed;
    label[seed] = id;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    let area = 0;

    while (sp > 0) {
      const p = stack[--sp]!;
      const py = (p / width) | 0;
      const px = p - py * width;
      area++;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;

      if (px > 0 && closed[p - 1] && label[p - 1] === -1) {
        label[p - 1] = id;
        stack[sp++] = p - 1;
      }
      if (px < width - 1 && closed[p + 1] && label[p + 1] === -1) {
        label[p + 1] = id;
        stack[sp++] = p + 1;
      }
      if (py > 0 && closed[p - width] && label[p - width] === -1) {
        label[p - width] = id;
        stack[sp++] = p - width;
      }
      if (py < height - 1 && closed[p + width] && label[p + width] === -1) {
        label[p + width] = id;
        stack[sp++] = p + width;
      }
    }

    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const bboxArea = bw * bh;
    const areaRatio = area / total;
    const fill = area / bboxArea;
    const aspect = bw / bh;

    if (areaRatio < cfg.minAreaRatio || areaRatio > cfg.maxAreaRatio) continue;
    if (fill < cfg.minFill) continue;
    if (aspect < cfg.minAspect || aspect > cfg.maxAspect) continue;

    // Ink lives in the holes of the paper mask, so it is counted over the
    // bounding box rather than over the blob's own pixels.
    let inkInside = 0;
    let paperInside = 0;
    for (let y = y0; y <= y1; y++) {
      const row = y * width;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        if (ink[i]) inkInside++;
        if (paper[i]) paperInside++;
      }
    }
    const textRatio = inkInside / bboxArea;
    if (textRatio < cfg.minTextRatio || textRatio > cfg.maxTextRatio) continue;
    // A ticket is paper: most of its pixels really are paper, not a glossy
    // highlight that merely got included by the dilation.
    if (paperInside / bboxArea < 0.45) continue;

    // Ink helps up to a point, then starts meaning "busy texture" instead of
    // "writing". Squaring the fill term rewards rectangles hard.
    const textScore = Math.min(1, textRatio / 0.06);
    const score = fill * fill * (0.35 + 0.65 * textScore);

    boxes.push({
      x0: x0 / width,
      y0: y0 / height,
      x1: (x1 + 1) / width,
      y1: (y1 + 1) / height,
      score,
      fill,
      textRatio,
      pixels: area,
    });
  }

  return boxes.sort((a, b) => b.score - a.score).slice(0, cfg.maxResults);
}

/** Expand a box by a ratio of its own size and clamp it to the frame. */
export function padBox(box: PriceTagBox, ratio: number): PriceTagBox {
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
