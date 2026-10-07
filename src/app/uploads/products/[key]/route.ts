import { readStoredFile } from "@/lib/storage";
import { productImageKey } from "@/lib/storage-keys";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const url = `/uploads/products/${key}`;
  if (!productImageKey(url)) return new Response("Not found", { status: 404 });
  const bytes = await readStoredFile(url);
  if (!bytes) return new Response("Not found", { status: 404 });
  const extension = key.split(".").pop();
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": `image/${extension === "jpg" ? "jpeg" : extension}`, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
