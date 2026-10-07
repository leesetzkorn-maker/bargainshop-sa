import { currentAdmin } from "@/lib/dal/admin";
import { isSafeOriginalKey, readOriginal, readPendingOriginal } from "@/lib/intake/private-store";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * The only way an untouched original ever leaves the server.
 *
 * These files show the retailer's price tag, which is the store's private
 * source cost, so they live outside `public/` and are streamed here to an
 * authenticated admin and to nobody else — no store, no CDN cache, no
 * guessable URL. `Cache-Control: private, no-store` keeps intermediaries out
 * of it as well.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  if (!isSafeOriginalKey(key)) return new Response("Not found", { status: 404 });

  const bytes = (await readPendingOriginal(key)) ?? (await readOriginal(key));
  if (!bytes) return new Response("Not found", { status: 404 });

  const extension = key.split(".").pop() ?? "jpg";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
