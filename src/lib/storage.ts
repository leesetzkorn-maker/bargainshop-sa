import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { storageDriver } from "@/lib/env";
import { mintedKey, productImageKey } from "@/lib/storage-keys";

/**
 * Product image storage.
 *
 * Uploads go to ./public/uploads on the `local` driver. That is correct for a
 * VPS or any host with a persistent disk, but NOT for serverless platforms where
 * the filesystem is ephemeral. The interface is deliberately narrow so an
 * S3/Blob adapter can be dropped in later without touching the admin UI.
 */

export interface StoredFile {
  /** Public URL path, e.g. "/uploads/products/abc123.webp". */
  url: string;
  key: string;
  bytes: number;
  contentType: string;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "products");

/**
 * AI edit candidates live in their own directory, apart from the product
 * images. Nothing under `/uploads/ai/` is ever referenced by a Product row, so
 * an unapproved or abandoned edit cannot be served to a customer, cannot be
 * picked up by the storefront, and cannot be deleted by the product-save
 * cleanup in `deleteStoredFile` (which is scoped to `/uploads/products/`).
 */
export const AI_DIR = join(process.cwd(), "public", "uploads", "ai");

/** Thrown for any rejected upload; the message is safe to show an admin. */
export class UploadError extends Error {}

/**
 * Path traversal guard. Returns null when the resolved path escapes `base`.
 */
export function isInsideBase(base: string, candidate: string): boolean {
  const resolvedBase = normalize(base);
  const resolved = normalize(candidate);
  return resolved === resolvedBase || resolved.startsWith(resolvedBase + sep);
}

export async function storeProductImage(file: File): Promise<StoredFile> {
  if (storageDriver() !== "local") {
    throw new UploadError(
      "The configured storage driver is not available in this build. Only the local driver is wired up.",
    );
  }

  const contentType = file.type.toLowerCase();
  if (!EXT_BY_TYPE[contentType]) {
    throw new UploadError("Upload a JPEG, PNG, WebP or AVIF image.");
  }
  if (file.size <= 0) {
    throw new UploadError("That file is empty.");
  }
  // 8 MB ceiling is plenty for a product photo and keeps the page fast.
  if (file.size > 8 * 1024 * 1024) {
    throw new UploadError("Images must be 8 MB or smaller.");
  }

  const ext = EXT_BY_TYPE[contentType];
  const key = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${ext}`;
  const target = join(UPLOAD_DIR, key);

  if (!isInsideBase(UPLOAD_DIR, target)) {
    throw new UploadError("Invalid upload path.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(target, bytes);

  return {
    url: `/uploads/products/${key}`,
    key,
    bytes: bytes.byteLength,
    contentType,
  };
}

export async function deleteStoredFile(url: string): Promise<void> {
  if (!url.startsWith("/uploads/products/")) return;
  const key = url.slice("/uploads/products/".length);
  if (!/^[a-z0-9-]+\.[a-z0-9]+$/i.test(key)) return;
  const target = join(UPLOAD_DIR, key);
  if (!isInsideBase(UPLOAD_DIR, target)) return;
  try {
    await unlink(target);
  } catch {
    // Already gone — deleting a missing file is not an error worth surfacing.
  }
}

// ---------------------------------------------------------------------------
// AI edit candidates
// ---------------------------------------------------------------------------

/**
 * Keys we mint ourselves look like `<base36 time>-<16 hex>.<ext>`. Matching that
 * exactly is stricter than the loose check `deleteStoredFile` uses, and that is
 * the point: these helpers resolve a URL into a filename, so the filename must
 * be provably one of ours before it is joined onto a directory.
 *
 * The patterns themselves live in ./storage-keys, which is unit tested
 * (tests/storage-keys.test.ts) because they are the gate that decides whether a
 * URL may be turned into a filesystem path at all.
 */

const EXT_BY_TYPE_LOWER: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function mintKey(ext: string): string {
  return `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}.${ext}`;
}

/**
 * Read a stored image back off disk.
 *
 * The AI tools need the original bytes, and Next serves `/uploads` as a static
 * asset rather than through a route handler, so there is no request to hang
 * this off. Returns null when the URL is not one of ours or the file is gone.
 */
export async function readStoredFile(url: string): Promise<Buffer | null> {
  // Each directory is joined statically, like `deleteStoredFile` above. Looping
  // over a table of (prefix, dir) pairs reads more tidily but turns the path
  // into a dynamic filesystem access, which makes the bundler trace the entire
  // project into the server output just to read one image.
  const productKey = productImageKey(url);
  if (productKey) {
    const target = join(UPLOAD_DIR, productKey);
    if (isInsideBase(UPLOAD_DIR, target)) {
      try {
        return await readFile(target);
      } catch {
        return null;
      }
    }
  }

  const aiKey = mintedKey(url, "ai");
  if (aiKey) {
    const target = join(AI_DIR, aiKey);
    if (isInsideBase(AI_DIR, target)) {
      try {
        return await readFile(target);
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Save an AI-edited candidate for review.
 *
 * Deliberately NOT a product image: it gets its own directory so it cannot be
 * shown on the storefront until the admin approves it.
 */
export async function storeAiCandidate(bytes: Buffer, contentType: string): Promise<StoredFile> {
  const ext = EXT_BY_TYPE_LOWER[contentType.toLowerCase()];
  if (!ext) throw new UploadError("The edited image came back in an unusable format.");
  if (bytes.length === 0) throw new UploadError("The edited image was empty.");

  const key = mintKey(ext);
  const target = join(AI_DIR, key);
  if (!isInsideBase(AI_DIR, target)) throw new UploadError("Invalid candidate path.");

  await mkdir(AI_DIR, { recursive: true });
  await writeFile(target, bytes);

  return { url: `/uploads/ai/${key}`, key, bytes: bytes.byteLength, contentType };
}

/**
 * Move an approved candidate into the product image directory.
 *
 * Promotion, not a copy-and-leave: the storefront gallery and `isSafeImagePath`
 * in the admin actions only recognise `/uploads/products/`, and a second copy of
 * the same bytes under `/uploads/ai/` would be a public file with no database
 * row pointing at it. The key is regenerated on the way across so every file in
 * the products directory keeps the content-unique naming that `next.config.ts`
 * relies on for immutable caching.
 *
 * The ORIGINAL product photo is a different file and is never touched here.
 */
export async function promoteAiCandidate(url: string): Promise<StoredFile> {
  const sourceKey = mintedKey(url, "ai");
  if (!sourceKey) throw new UploadError("That candidate is not a valid preview.");

  const source = join(AI_DIR, sourceKey);
  if (!isInsideBase(AI_DIR, source)) throw new UploadError("Invalid candidate path.");

  let bytes: Buffer;
  try {
    bytes = await readFile(source);
  } catch {
    throw new UploadError("That preview is no longer available. Generate it again.");
  }

  const ext = sourceKey.slice(sourceKey.lastIndexOf(".") + 1);
  const key = mintKey(ext);
  const target = join(UPLOAD_DIR, key);
  if (!isInsideBase(UPLOAD_DIR, target)) throw new UploadError("Invalid upload path.");

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(target, bytes);

  // Only unlink once the promoted copy is safely on disk.
  await deleteAiCandidate(url);

  return {
    url: `/uploads/products/${key}`,
    key,
    bytes: bytes.byteLength,
    contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
  };
}

/** Throw away a candidate. Safe to call on a URL that has already gone. */
export async function deleteAiCandidate(url: string): Promise<void> {
  const key = mintedKey(url, "ai");
  if (!key) return;
  const target = join(AI_DIR, key);
  if (!isInsideBase(AI_DIR, target)) return;
  try {
    await unlink(target);
  } catch {
    // Already gone.
  }
}
