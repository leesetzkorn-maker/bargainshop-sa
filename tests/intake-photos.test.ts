import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  buildPublicPhoto,
  prepareMaskBoxes,
  PublicPhotoError,
  PUBLIC_MAX_EDGE,
} from "../src/lib/intake/photos";

/**
 * The public-photo guarantees.
 *
 * A public copy is the original photograph, smaller, with flat black rectangles
 * over the retailer's price tag. Nothing else may move: if the mask pipeline
 * ever starts re-encoding the product in a way that shifts pixels outside the
 * drawn boxes, a listing would stop being a record of the actual item.
 */

async function sampleOriginal(): Promise<Buffer> {
  // A large frame with a bright "tag" patch, so resizing and masking are both
  // exercised on real pixels.
  const tag = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000">
    <rect width="3000" height="2000" fill="#1a4099"/>
    <rect x="900" y="700" width="700" height="400" fill="#f4f4f0"/>
    <rect x="950" y="760" width="600" height="60" fill="#111111"/>
    <rect x="950" y="880" width="600" height="60" fill="#111111"/>
  </svg>`;
  return sharp(Buffer.from(tag)).png().toBuffer();
}

function pixelAt(data: Buffer, width: number, channels: number, nx: number, ny: number, height: number) {
  const x = Math.min(width - 1, Math.max(0, Math.floor(nx * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(ny * height)));
  const i = (y * width + x) * channels;
  return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
}

describe("buildPublicPhoto", () => {
  it("produces a web-ready public copy", async () => {
    const original = await sampleOriginal();
    const publicCopy = await buildPublicPhoto(original, {});

    const meta = await sharp(publicCopy).metadata();
    assert.equal(meta.format, "webp");
    assert.ok((meta.width ?? 0) <= PUBLIC_MAX_EDGE);
    assert.ok((meta.height ?? 0) <= PUBLIC_MAX_EDGE);
    assert.ok((meta.width ?? 0) > 0);
  });

  it("never modifies the original buffer it was handed", async () => {
    const original = await sampleOriginal();
    const before = Buffer.from(original);
    await buildPublicPhoto(original, { boxes: [{ x0: 0.3, y0: 0.35, x1: 0.55, y1: 0.55 }] });
    assert.equal(Buffer.compare(original, before), 0);
  });

  it("covers only the mask box with black, leaving the rest of the photo alone", async () => {
    const original = await sampleOriginal();
    const mask = { x0: 0.3, y0: 0.35, x1: 0.53, y1: 0.55 };

    const unmasked = await buildPublicPhoto(original, {});
    const masked = await buildPublicPhoto(original, { boxes: [mask] });

    const a = await sharp(unmasked).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(masked).raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = b.info;
    assert.equal(a.info.width, width);

    // Inside the drawn box: flat black, the price tag is gone.
    const covered = pixelAt(b.data, width, channels, (mask.x0 + mask.x1) / 2, (mask.y0 + mask.y1) / 2, height);
    assert.ok(covered.r < 24 && covered.g < 24 && covered.b < 24, `mask centre is ${JSON.stringify(covered)}`);

    // Outside it: the product pixels are still the product pixels. WebP is
    // lossy, so this is a tolerance rather than byte equality.
    const probes: Array<[number, number]> = [
      [0.05, 0.05],
      [0.75, 0.1],
      [0.1, 0.9],
      [0.9, 0.85],
      [0.7, 0.6],
    ];
    for (const [nx, ny] of probes) {
      const before = pixelAt(a.data, width, channels, nx, ny, height);
      const after = pixelAt(b.data, width, channels, nx, ny, height);
      for (const channel of ["r", "g", "b"] as const) {
        const drift = Math.abs(before[channel] - after[channel]);
        assert.ok(drift <= 16, `${channel} drifted by ${drift} at ${nx},${ny}`);
      }
    }
  });

  it("keeps the cover aligned after downscaling to gallery size", async () => {
    const original = await sampleOriginal();
    const mask = { x0: 0.3, y0: 0.35, x1: 0.53, y1: 0.55 };
    const masked = await buildPublicPhoto(original, { boxes: [mask] });

    const raw = await sharp(masked).raw().toBuffer({ resolveWithObject: true });
    const { width, channels, height } = raw.info;
    // Just inside each edge of the box must be black; just outside must not be.
    const insideLeft = pixelAt(raw.data, width, channels, mask.x0 + 0.01, (mask.y0 + mask.y1) / 2, height);
    const outsideLeft = pixelAt(raw.data, width, channels, mask.x0 - 0.05, (mask.y0 + mask.y1) / 2, height);
    assert.ok(insideLeft.r < 24, `expected black at left edge, got ${JSON.stringify(insideLeft)}`);
    assert.ok(outsideLeft.b > 60, `expected untouched background, got ${JSON.stringify(outsideLeft)}`);
  });
});

describe("prepareMaskBoxes (manual mask)", () => {
  it("grows a hand-drawn box slightly so no tag edge survives", () => {
    const [box] = prepareMaskBoxes([{ x0: 0.4, y0: 0.4, x1: 0.5, y1: 0.5 }]);
    assert.ok(box);
    assert.ok(box.x0 < 0.4 && box.y0 < 0.4);
    assert.ok(box.x1 > 0.5 && box.y1 > 0.5);
  });

  it("normalises a box drawn in the wrong direction", () => {
    const [box] = prepareMaskBoxes([{ x0: 0.8, y0: 0.7, x1: 0.5, y1: 0.3 }]);
    assert.ok(box.x0 < box.x1);
    assert.ok(box.y0 < box.y1);
  });

  it("refuses a box that would cover most of the photo", () => {
    assert.throws(
      () => prepareMaskBoxes([{ x0: 0, y0: 0, x1: 1, y1: 1 }]),
      (error: Error) => error instanceof PublicPhotoError,
    );
  });

  it("refuses a box too small to be a sticker", () => {
    assert.throws(
      () => prepareMaskBoxes([{ x0: 0.5, y0: 0.5, x1: 0.501, y1: 0.501 }]),
      (error: Error) => error instanceof PublicPhotoError,
    );
  });

  it("refuses non-numeric coordinates rather than painting by accident", () => {
    assert.throws(
      () => prepareMaskBoxes([{ x0: Number.NaN, y0: 0.4, x1: 0.5, y1: 0.5 }]),
      (error: Error) => error instanceof PublicPhotoError,
    );
  });

  it("caps how many covers one photo may carry", () => {
    assert.throws(
      () =>
        prepareMaskBoxes(
          Array.from({ length: 5 }, () => ({ x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 })),
        ),
      (error: Error) => error instanceof PublicPhotoError,
    );
  });
});
