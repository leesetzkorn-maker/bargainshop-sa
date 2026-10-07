import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Pristine base copies for the existing-product mask editor.
 *
 * Masking an EXISTING listing paints a new file and records the new URL, but
 * that leaves nothing to render from (or reset to) for a photo that was never
 * made through intake. These snapshots are the pre-mask public copy, taken the
 * first time a mask is saved and never touched afterwards:
 *
 *   - the editor and the save action render from the snapshot, so a second
 *     mask never compounds on top of an earlier one;
 *   - "reset / remove covers" copies the snapshot back out as a fresh URL;
 *   - the ORIGINAL upload in `data/intake/`, `data/internal/photo-originals/`
 *     or wherever else it lives is never read or written by this module.
 *
 * These are runtime state, not source: the directory exists purely to make the
 * mask operation safe and reversible and is ignored by git.
 */

export const MASK_CLEAN_DIR = join(process.cwd(), "data", "masks-clean");

/** The extension is taken from the public URL so the base is byte-comparable. */
export function maskCleanPath(imageId: string, url: string): string {
  const dot = url.lastIndexOf(".");
  const ext = dot === -1 ? "img" : url.slice(dot + 1).toLowerCase() || "img";
  return join(MASK_CLEAN_DIR, `${imageId}.${ext}`);
}

/** Read the pristine base for a product image, or null when never captured. */
export async function readMaskClean(imageId: string, url: string): Promise<Buffer | null> {
  try {
    return await readFile(maskCleanPath(imageId, url));
  } catch {
    return null;
  }
}

/**
 * Capture the pre-mask copy. Safe to call every save: once the file exists it
 * is left alone, so an accidental re-capture can never overwrite the pristine.
 */
export async function ensureMaskClean(imageId: string, url: string, bytes: Buffer): Promise<void> {
  const target = maskCleanPath(imageId, url);
  if (await readMaskClean(imageId, url)) return;
  await mkdir(MASK_CLEAN_DIR, { recursive: true });
  await writeFile(target, bytes);
}