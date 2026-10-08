import { join } from "node:path";

/**
 * Where the store keeps the files it writes at runtime.
 *
 * Two roots, two variables, both optional:
 *
 *   UPLOADS_DIR  Product photos and AI candidates. Defaults to
 *                `<cwd>/public/uploads`, which Next serves as static assets.
 *                On a host whose container filesystem is disposable — Railway
 *                rebuilds the container on every deploy — point it at the
 *                attached volume (e.g. `/data/uploads`) so photos survive.
 *                `src/app/uploads/products/route.ts` and
 *                `src/app/uploads/ai/route.ts` serve the same public URLs from
 *                wherever it points, so no URL, database row or markup changes.
 *
 *   DATA_DIR     Private data: untouched intake originals and the pristine mask
 *                bases. Defaults to `<cwd>/data`. Nothing here is ever public,
 *                so moving the root changes no route and no permission.
 *
 * Both are read when the module that uses them loads, which is before the first
 * request. Set them in the environment, never in code.
 */
export function uploadsRoot(): string {
  return process.env.UPLOADS_DIR?.trim() || join(process.cwd(), "public", "uploads");
}

export function privateDataRoot(): string {
  return process.env.DATA_DIR?.trim() || join(process.cwd(), "data");
}
