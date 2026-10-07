import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  deletePendingOriginal,
  isSafeOriginalKey,
  promoteOriginal,
  readOriginal,
  readPendingOriginal,
  storePendingOriginal,
  OriginalStoreError,
} from "../src/lib/intake/private-store";
import { buildPublicPhoto } from "../src/lib/intake/photos";

/**
 * Original photo preservation.
 *
 * The untouched upload is the record of the item and the only place the real
 * price tag still exists. It must survive intake byte for byte, stay out of
 * `public/`, and never be clobbered — while the public copy is built from it
 * without touching it.
 */

const sandboxes: string[] = [];

async function sandbox(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "intake-originals-"));
  sandboxes.push(dir);
  return dir;
}

after(async () => {
  for (const dir of sandboxes) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function sampleBytes(): Promise<Buffer> {
  return sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 180, g: 60, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe("original image preservation", () => {
  it("stores an upload and reads back the exact bytes", async () => {
    const dir = await sandbox();
    const bytes = await sampleBytes();

    const key = await storePendingOriginal(bytes, "png", dir);
    assert.ok(isSafeOriginalKey(key));

    const readBack = await readPendingOriginal(key, dir);
    assert.ok(readBack);
    assert.equal(Buffer.compare(readBack, bytes), 0);
  });

  it("archives the original unchanged, and again, and again", async () => {
    const dir = await sandbox();
    const bytes = await sampleBytes();

    const key = await storePendingOriginal(bytes, "png", dir);
    const first = await promoteOriginal(key, dir);
    const second = await promoteOriginal(key, dir); // idempotent, no clobber
    assert.equal(first, second);

    const archived = await readOriginal(key, dir);
    assert.ok(archived);
    assert.equal(Buffer.compare(archived, bytes), 0);
  });

  it("keeps the original intact while a public copy is generated from it", async () => {
    const dir = await sandbox();
    const bytes = await sampleBytes();

    const key = await storePendingOriginal(bytes, "png", dir);
    const stored = await readPendingOriginal(key, dir);
    assert.ok(stored);

    const publicCopy = await buildPublicPhoto(stored, {
      boxes: [{ x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.5 }],
    });
    assert.ok(publicCopy.length > 0);

    const afterGeneration = await readPendingOriginal(key, dir);
    assert.ok(afterGeneration);
    assert.equal(Buffer.compare(afterGeneration, bytes), 0);
    // And the archived copy, once promoted, is the same bytes too.
    await promoteOriginal(key, dir);
    const archived = await readOriginal(key, dir);
    assert.ok(archived);
    assert.equal(Buffer.compare(archived, bytes), 0);
  });

  it("refuses keys that try to escape the archive", async () => {
    const dir = await sandbox();
    assert.equal(isSafeOriginalKey("../../etc/passwd"), false);
    assert.equal(await readOriginal("../../secret.png", dir), null);
    assert.equal(await readPendingOriginal("not-a-key", dir), null);
    await assert.rejects(
      () => storePendingOriginal(Buffer.from("x"), "exe", dir),
      (error: Error) => error instanceof OriginalStoreError,
    );
  });

  it("treats a deleted pending photo as gone rather than throwing", async () => {
    const dir = await sandbox();
    const key = await storePendingOriginal(await sampleBytes(), "png", dir);
    await deletePendingOriginal(key, dir);
    assert.equal(await readPendingOriginal(key, dir), null);
    await assert.rejects(
      () => promoteOriginal(key, dir),
      (error: Error) => error instanceof OriginalStoreError,
    );
  });
});
