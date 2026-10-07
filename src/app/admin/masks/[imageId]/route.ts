import { currentAdmin } from "@/lib/dal/admin";
import { prisma } from "@/lib/db";
import { readStoredFile } from "@/lib/storage";
import { readMaskClean } from "@/lib/product-masks";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * Serves the PRISTINE copy of a product photo for the mask editor.
 *
 * Never the painted public file and never (directly) the private original —
 * the base is the pristine snapshot captured in `data/masks-clean/`, falling
 * back to the current public copy the first time a photo is masked. Only an
 * authenticated admin can read it, and nothing downstream caches it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const { imageId } = await params;
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: { url: true },
  });
  if (!image || !image.url.startsWith("/uploads/products/")) return new Response("Not found", { status: 404 });

  const bytes = (await readMaskClean(imageId, image.url)) ?? (await readStoredFile(image.url));
  if (!bytes) return new Response("Not found", { status: 404 });

  const extension = image.url.split(".").pop() ?? "webp";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}