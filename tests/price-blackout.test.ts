import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectPriceTagBoxes, padBox, DEFAULTS, type PriceTagBox } from "../src/lib/photo-blackout/detect";

/**
 * The automatic tag detector, on synthetic frames.
 *
 * A miss is fine — Lee draws the box by hand. A false positive that lands on
 * the product is not, so the two frames that must come back empty (a flat
 * background, a large light-coloured shell) are pinned here along with the one
 * that must find a ticket.
 */

const WIDTH = 400;
const HEIGHT = 400;

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function frame(background: { r: number; g: number; b: number }, regions: Array<Region & { color: { r: number; g: number; b: number } }>): Uint8Array {
  const data = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 3;
      data[i] = background.r;
      data[i + 1] = background.g;
      data[i + 2] = background.b;
    }
  }
  for (const region of regions) {
    for (let y = region.y0; y < region.y1; y++) {
      for (let x = region.x0; x < region.x1; x++) {
        const i = (y * WIDTH + x) * 3;
        data[i] = region.color.r;
        data[i + 1] = region.color.g;
        data[i + 2] = region.color.b;
      }
    }
  }
  return data;
}

/** A dark scene with a light rectangular ticket carrying dark "writing". */
function ticketFrame(): { data: Uint8Array; ticket: Region } {
  const ticket: Region = { x0: 100, y0: 100, x1: 200, y1: 160 };
  const paper = { r: 244, g: 244, b: 240 };
  const ink = { r: 17, g: 17, b: 17 };
  const stripes: Array<Region & { color: { r: number; g: number; b: number } }> = [
    { ...ticket, color: paper },
    { x0: 105, y0: 110, x1: 195, y1: 116, color: ink },
    { x0: 105, y0: 126, x1: 195, y1: 132, color: ink },
    { x0: 105, y0: 142, x1: 195, y1: 148, color: ink },
  ];
  return { data: frame({ r: 38, g: 38, b: 44 }, stripes), ticket };
}

function overlaps(inner: Region, outer: Region): boolean {
  const w = Math.min(inner.x1, outer.x1) - Math.max(inner.x0, outer.x0);
  const h = Math.min(inner.y1, outer.y1) - Math.max(inner.y0, outer.y0);
  const area = Math.max(0, w) * Math.max(0, h);
  const innerArea = (inner.x1 - inner.x0) * (inner.y1 - inner.y0);
  return area / innerArea > 0.5;
}

describe("detectPriceTagBoxes", () => {
  it("finds a printed ticket on a dark background", () => {
    const { data, ticket } = ticketFrame();
    const boxes = detectPriceTagBoxes(data, WIDTH, HEIGHT, 3);
    assert.ok(boxes.length > 0, "expected at least one candidate box");

    const pixelBoxes = boxes.map((box) => ({
      x0: box.x0 * WIDTH,
      y0: box.y0 * HEIGHT,
      x1: box.x1 * WIDTH,
      y1: box.y1 * HEIGHT,
    }));
    assert.ok(
      pixelBoxes.some((box) => overlaps(box, ticket)),
      `no box covered the ticket: ${JSON.stringify(pixelBoxes)}`,
    );
  });

  it("finds nothing on a flat frame", () => {
    const data = frame({ r: 30, g: 30, b: 34 }, []);
    assert.deepEqual(detectPriceTagBoxes(data, WIDTH, HEIGHT, 3), []);
  });

  it("finds nothing on a large light-coloured shell", () => {
    // What a white helmet looks like to a "white rectangle with ink" detector:
    // the frame itself is paper. The area ceiling must reject it.
    const data = frame({ r: 240, g: 240, b: 238 }, [
      { x0: 40, y0: 60, x1: 360, y1: 340, color: { r: 246, g: 246, b: 244 } },
      { x0: 120, y0: 180, x1: 280, y1: 200, color: { r: 20, g: 20, b: 20 } },
    ]);
    assert.deepEqual(detectPriceTagBoxes(data, WIDTH, HEIGHT, 3), []);
  });

  it("returns boxes best-first, capped by maxResults", () => {
    const { data } = ticketFrame();
    const boxes = detectPriceTagBoxes(data, WIDTH, HEIGHT, 3, { maxResults: 1 });
    assert.ok(boxes.length <= 1);
  });

  it("keeps every default threshold in a sane range", () => {
    assert.ok(DEFAULTS.minAreaRatio > 0 && DEFAULTS.minAreaRatio < DEFAULTS.maxAreaRatio);
    assert.ok(DEFAULTS.minFill > 0 && DEFAULTS.minFill <= 1);
    assert.ok(DEFAULTS.maxResults >= 1);
  });
});

describe("padBox", () => {
  const box: PriceTagBox = {
    x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6, score: 1, fill: 1, textRatio: 0, pixels: 100,
  };

  it("grows the box by the requested ratio", () => {
    const grown = padBox(box, 0.1);
    assert.ok(grown.x0 < box.x0);
    assert.ok(grown.x1 > box.x1);
    assert.ok(grown.y0 < box.y0);
    assert.ok(grown.y1 > box.y1);
  });

  it("never escapes the frame", () => {
    const atEdge: PriceTagBox = { ...box, x0: 0, y0: 0, x1: 0.1, y1: 0.1 };
    const grown = padBox(atEdge, 0.5);
    assert.equal(grown.x0, 0);
    assert.equal(grown.y0, 0);
    assert.ok(grown.x1 <= 1 && grown.y1 <= 1);
  });
});
