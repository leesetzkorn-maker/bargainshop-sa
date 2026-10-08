/**
 * Where the untouched uploads live.
 *
 * Two rules, both absolute:
 *
 *   1. The original photograph is written once and never modified, re-encoded
 *      or deleted by anything else in the intake pipeline. It is the record of
 *      the actual item — including the retailer's price tag, which is exactly
 *      why it must NOT sit in `public/`: a publicly fetchable photo of the tag
 *      is the store's private source cost, served to anyone who guesses the
 *      URL.
 *   2. The storefront only ever sees the public copy built from this file.
 *
 * So originals are kept outside `public/` entirely, under `data/intake/` (or
 * `$DATA_DIR/intake` when that root is moved onto a persistent volume), and
 * are streamed only to an authenticated admin. Filesystem only — no Prisma, no
 * `server-only` — so the preservation guarantee is unit tested against real
 * bytes (tests/intake-originals.test.ts).
 */

import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, readFile, unlink, writeFile, copyFile, access } from "node:fs/promises";
import { join, sep } from "node:path";

import { privateDataRoot } from "@/lib/data-paths";

export class OriginalStoreError extends Error {}

const KEY_PATTERN = /^[a-f0-9]{32}\.(jpg|jpeg|png|webp|avif)$/;
const EXT_PATTERN = /^(jpg|jpeg|png|webp|avif)$/;

export function isSafeOriginalKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * `data/intake` under the app root — or `$DATA_DIR/intake` when the private
 * data root has been moved onto a persistent volume (src/lib/data-paths.ts).
 *
 * `baseDir` wins over both so tests can point at a sandbox.
 */
export function intakeRoot(baseDir?: string): string {
  return baseDir ?? join(privateDataRoot(), "intake");
}

function pendingDir(baseDir?: string): string {
  return join(intakeRoot(baseDir), "pending");
}

function originalsDir(baseDir?: string): string {
  return join(intakeRoot(baseDir), "originals");
}

function resolveInside(base: string, key: string): string {
  if (!isSafeOriginalKey(key)) {
    throw new OriginalStoreError("That photo key is not valid.");
  }
  const target = join(base, key);
  if (!target.startsWith(base + sep)) {
    throw new OriginalStoreError("That photo path is not valid.");
  }
  return target;
}

/** Write an upload to the pending area, untouched. Returns its key. */
export async function storePendingOriginal(
  bytes: Buffer,
  ext: string,
  baseDir?: string,
): Promise<string> {
  if (!EXT_PATTERN.test(ext.toLowerCase())) {
    throw new OriginalStoreError("Unsupported image format.");
  }
  if (bytes.length === 0) {
    throw new OriginalStoreError("That file is empty.");
  }

  const key = `${randomBytes(16).toString("hex")}.${ext.toLowerCase()}`;
  const dir = pendingDir(baseDir);
  const target = resolveInside(dir, key);
  await mkdir(dir, { recursive: true });
  await writeFile(target, bytes);
  return key;
}

export async function readPendingOriginal(key: string, baseDir?: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveInside(pendingDir(baseDir), key));
  } catch {
    return null;
  }
}

export async function deletePendingOriginal(key: string, baseDir?: string): Promise<void> {
  try {
    await unlink(resolveInside(pendingDir(baseDir), key));
  } catch {
    // Already gone — deleting a missing intake photo is not an error.
  }
}

/**
 * Move a pending upload into the permanent original archive.
 *
 * A copy, not a rename: the pending key stays valid until the intake session
 * is deliberately cleaned up, so a failed save never leaves the admin with a
 * photo that cannot be re-read.
 */
export async function promoteOriginal(pendingKey: string, baseDir?: string): Promise<string> {
  const source = resolveInside(pendingDir(baseDir), pendingKey);
  try {
    await access(source);
  } catch {
    throw new OriginalStoreError("That photo is no longer available. Upload it again.");
  }

  const dir = originalsDir(baseDir);
  const target = resolveInside(dir, pendingKey);
  await mkdir(dir, { recursive: true });
  // COPYFILE_EXCL: an already-archived original is never overwritten, however
  // the same key got here twice. EEXIST means "already preserved" — success.
  try {
    await copyFile(source, target, constants.COPYFILE_EXCL);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "EEXIST") {
      throw new OriginalStoreError("That photo could not be archived. Nothing was changed.");
    }
  }
  return pendingKey;
}

/** Read an archived original back, for the admin's own reference view. */
export async function readOriginal(key: string, baseDir?: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveInside(originalsDir(baseDir), key));
  } catch {
    return null;
  }
}
