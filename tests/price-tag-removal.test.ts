import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMaskSvg, expandRegion, usableRegions } from "../src/lib/ai/remove-price-tag-geometry";

/**
 * The product-preservation guarantee rests entirely on these three functions.
 *
 * If `expandRegion` ever grew, or `usableRegions` stopped rejecting a
 * full-frame "sticker", the composite would start blending regenerated pixels
 * over the product itself — which is the one thing this feature promises never
 * to do. So the bounds are pinned down here rather than left to review.
 */

const FULL_FRAME = { x0: 0, y0: 0, x1: 1, y1: 1 };

describe("expandRegion", () => {
  it("converts normalised coordinates into an exact pixel box", () => {
    const box = expandRegion({ x0: 0.5, y0: 0.25, x1: 0.75, y1: 0.5 }, 1000, 800, 0);
    assert.deepEqual(box, { left: 500, top: 200, width: 250, height: 200 });
  });

  it("grows the box slightly so a sticker edge is not left behind", () => {
    const tight = expandRegion({ x0: 0.5, y0: 0.5, x1: 0.6, y1: 0.6 }, 1000, 1000, 0);
    const padded = expandRegion({ x0: 0.5, y0: 0.5, x1: 0.6, y1: 0.6 }, 1000, 1000, 0.01);
    assert.ok(padded.left < tight.left);
    assert.ok(padded.top < tight.top);
    assert.ok(padded.width > tight.width);
    assert.ok(padded.height > tight.height);
  });

  it("never escapes the photograph, however far off the edge a box sits", () => {
    const box = expandRegion({ x0: -0.4, y0: -0.2, x1: 1.4, y1: 1.3 }, 400, 300, 0.02);
    assert.ok(box.left >= 0);
    assert.ok(box.top >= 0);
    assert.equal(box.left + box.width, 400);
    assert.equal(box.top + box.height, 300);
  });

  it("stays a valid box even for a degenerate zero-area region", () => {
    const box = expandRegion({ x0: 0.4, y0: 0.4, x1: 0.4, y1: 0.4 }, 200, 200, 0);
    assert.ok(box.width >= 1);
    assert.ok(box.height >= 1);
    assert.ok(box.left + box.width <= 200);
  });
});

describe("usableRegions", () => {
  it("keeps a plausible sticker", () => {
    const kept = usableRegions([{ x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.2 }]);
    assert.equal(kept.length, 1);
  });

  it("refuses a near-full-frame region, which would repaint the product", () => {
    // The single most dangerous failure: "remove the sticker" interpreted as
    // "remove everything", which would replace the whole product.
    assert.deepEqual(usableRegions([FULL_FRAME]), []);
    assert.deepEqual(usableRegions([{ x0: 0.02, y0: 0.02, x1: 0.98, y1: 0.98 }]), []);
  });

  it("refuses a speck too small to be a sticker", () => {
    assert.deepEqual(usableRegions([{ x0: 0.5, y0: 0.5, x1: 0.501, y1: 0.501 }]), []);
  });

  it("caps how many regions one edit will touch", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      x0: 0.05 + index * 0.09,
      y0: 0.05,
      x1: 0.11 + index * 0.09,
      y1: 0.15,
    }));
    assert.equal(usableRegions(many).length, 4);
  });

  it("keeps every region that survives, not just the biggest", () => {
    const kept = usableRegions([
      { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.15 },
      { x0: 0.6, y0: 0.6, x1: 0.75, y1: 0.7 },
    ]);
    assert.equal(kept.length, 2);
  });
});

describe("buildMaskSvg", () => {
  it("produces one rectangle per region", () => {
    const svg = buildMaskSvg(
      [
        { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 },
        { x0: 0.5, y0: 0.5, x1: 0.6, y1: 0.6 },
      ],
      1000,
      800,
    );
    assert.equal(svg.match(/<rect /g)?.length, 2);
    assert.ok(svg.includes('width="1000"'));
    assert.ok(svg.includes('height="800"'));
  });

  it("keeps the mask white, so 'white' always means 'replace these pixels'", () => {
    const svg = buildMaskSvg([{ x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 }], 100, 100, 0);
    assert.ok(svg.includes('fill="#ffffff"'));
  });

  it("emits valid SVG with nothing to replace", () => {
    const svg = buildMaskSvg([], 640, 480);
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.endsWith("</svg>"));
    assert.equal(svg.includes("<rect "), false);
  });

  it("only ever emits integers, so the geometry cannot land off-grid", () => {
    const svg = buildMaskSvg([{ x0: 0.1234567, y0: 0.7654321, x1: 0.3333333, y1: 0.9999999 }], 997, 1231);
    // Leading whitespace matters: without it `viewBox="..."` matches as `x="..."`.
    const attributes = svg.match(/[\s"](?:x|y|width|height|rx|ry)="([^"]*)"/g) ?? [];
    assert.ok(attributes.length > 0);
    for (const attribute of attributes) {
      const value = Number(attribute.split('"')[1]);
      assert.ok(Number.isInteger(value), `${attribute} is not an integer`);
    }
  });
});