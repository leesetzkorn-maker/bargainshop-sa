import { currentAdmin } from "@/lib/dal/admin";
import { readStoredFile } from "@/lib/storage";
import { mintedKey } from "@/lib/storage-keys";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * The only way an unapproved AI edit candidate ever leaves the server.
 *
 * Candidates live in their own directory precisely so they cannot reach the
 * storefront, but the admin still has to see the thing before approving it.
 * It is therefore served the same way the untouched originals are: to an
 * authenticated admin and to nobody else, with `Cache-Control: private,
 * no-store` so nothing downstream can hold it either.
 *
 * Without this route the candidate would be an unreachable file — and with a
 * route that served it publicly, a preview of an unreleased edit would be
 * fetchable by anyone holding the URL.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const { key } = await params;
  const url = `/uploads/ai/${key}`;
  if (!mintedKey(url, "ai")) return new Response("Not found", { status: 404 });

  const bytes = await readStoredFile(url);
  if (!bytes) return new Response("Not found", { status: 404 });

  const extension = key.split(".").pop()?.toLowerCase() ?? "jpg";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
