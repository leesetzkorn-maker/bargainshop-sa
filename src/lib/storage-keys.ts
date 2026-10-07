/**
 * Filename rules for the upload directories.
 *
 * Deliberately free of `server-only` and of the filesystem, for the same reason
 * `ai/remove-price-tag-geometry.ts` is: these patterns decide which strings are
 * turned into filesystem paths, so their behaviour is pinned by
 * tests/storage-keys.test.ts instead of left to review.
 *
 * Two naming schemes live in /uploads/products/:
 *
 *   - keys minted here for new uploads, `<base36 time>-<16 hex>.<ext>`,
 *   - descriptive names written by the import scripts,
 *     `2ds-0045-red-canister-vacuum-cleaner.webp`.
 *
 * Both are content-unique, which is what the immutable cache header in
 * next.config.ts relies on, so both must be accepted here. Accepting only the
 * minted form left every imported photo unreadable by the AI tools.
 */

/** Keys we mint ourselves look like `<base36 time>-<16 hex>.<ext>`. */
export const MINTED_KEY = /^[a-z0-9]+-[a-f0-9]{16}\.[a-z0-9]+$/;

/**
 * An imported product photo: hyphenated words, one extension.
 *
 * Anchored, so it rejects every separator, `..`, query string, fragment and
 * absolute path outright. Callers still confirm the resolved path with
 * `isInsideBase`; this is the first gate, not the only one.
 */
export const IMPORTED_KEY = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\.[a-z0-9]+$/;

/** The key of a minted URL under `/uploads/<prefix>/`, or null. */
export function mintedKey(url: string, prefix: string): string | null {
  const dir = `/uploads/${prefix}/`;
  if (!url.startsWith(dir)) return null;
  const key = url.slice(dir.length);
  return MINTED_KEY.test(key) ? key : null;
}

/**
 * The key of a product image URL, minted or imported, or null when the URL is
 * not a product image at all.
 *
 * Placeholder art (`/placeholder/*.svg`), brand assets and anything outside the
 * uploads directory all return null, so nothing else can be read back as if it
 * were a shop upload.
 */
export function productImageKey(url: string): string | null {
  if (!url.startsWith("/uploads/products/")) return null;
  const key = url.slice("/uploads/products/".length);
  return MINTED_KEY.test(key) || IMPORTED_KEY.test(key) ? key : null;
}