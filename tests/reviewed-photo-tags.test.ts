import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { renderReviewedTags } from "../src/lib/photo-blackout/reviewed";

test("lossless tag mask preserves every pixel outside an angled tag", async () => {
  const width = 80, height = 60;
  const pixels = Buffer.from(Array.from({ length: width * height * 3 }, (_, i) => (i * 37) % 256));
  const source = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const original = Buffer.from(source);
  const output = await renderReviewedTags(source, [[[0.25, 0.25], [0.5, 0.25], [0.25, 0.5]]]);
  const result = await sharp(output).removeAlpha().raw().toBuffer();
  let covered = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const inside = x + 0.5 >= 20 && y + 0.5 >= 15 && (x + 0.5 - 20) / 20 + (y + 0.5 - 15) / 15 < 1;
    const offset = (y * width + x) * 3;
    assert.deepEqual(result.subarray(offset, offset + 3), inside ? Buffer.alloc(3) : pixels.subarray(offset, offset + 3));
    if (inside) covered++;
  }
  assert.ok(covered > 0);
  assert.deepEqual(source, original);
});

test("rejects unbounded, non-finite and oversized tag masks", async () => {
  for (const polygon of [
    [[0, 0], [1, 0], [1, 1], [0, 1]],
    [[-0.1, 0.2], [0.3, 0.2], [0.3, 0.4]],
    [[NaN, 0.2], [0.3, 0.2], [0.3, 0.4]],
  ] as Array<Array<[number, number]>>) {
    await assert.rejects(renderReviewedTags(Buffer.alloc(0), [polygon]));
  }
});
