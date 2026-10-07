import { getPricingSettings } from "@/lib/dal/pricing";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminProduct, listAdminCategories } from "@/lib/dal/admin";
import {
  addProductNoteAction,
  aiCandidateStillReadable,
  aiImageToolsEnabled,
  setProductStatusAction,
} from "@/app/actions/admin";
import { formatWhen, one } from "@/components/admin/format";
import { Notice, PageHeader, StatusPill } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";
import { PriceTagCleaner } from "@/components/admin/price-tag-cleaner";
import { ExistingProductMaskEditor } from "@/components/admin/product-photo-masks";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [product, categories] = await Promise.all([getAdminProduct(id), listAdminCategories()]);
  if (!product) notFound();

  // The AI tools are opt-in by configuration. With no API key the admin panel
  // renders exactly as it always has, with no dead button to click.
  const aiEnabled = await aiImageToolsEnabled();

  // A candidate survives in the URL, so confirm the file is still on disk
  // before offering to approve it.
  const rawCandidate = one(query.ai);
  const candidate =
    aiEnabled && rawCandidate && (await aiCandidateStillReadable(rawCandidate))
      ? rawCandidate
      : null;
  const candidateSourceImageId = candidate ? one(query.aiFrom) : null;

  const pricingSettings = await getPricingSettings();

  return (
    <>
      <PageHeader title={product.name} description={`${product.itemId} · ${product.sku}`}>
        <StatusPill value={product.status} />
        <Link href={`/product/${product.slug}`} className="btn btn-secondary">
          View on store
        </Link>
      </PageHeader>
      <Notice error={one(query.error)} saved={one(query.saved) === "1"} />

      <div className="mb-4 flex flex-wrap gap-2">
        {product.status !== "SOLD_OUT" ? (
          <form action={setProductStatusAction}>
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="status" value="SOLD_OUT" />
            <button type="submit" className="btn btn-secondary btn-sm">
              Mark sold
            </button>
          </form>
        ) : (
          <form action={setProductStatusAction}>
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="status" value="ACTIVE" />
            <button type="submit" className="btn btn-secondary btn-sm">
              Put back on sale
            </button>
          </form>
        )}
        {product.status !== "ARCHIVED" ? (
          <form action={setProductStatusAction}>
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="status" value="ARCHIVED" />
            <button type="submit" className="btn btn-ghost btn-sm">
              Archive
            </button>
          </form>
        ) : null}
      </div>

      <ProductForm pricingSettings={pricingSettings}
        product={product}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
      />

      {aiEnabled ? (
        <PriceTagCleaner
          productId={product.id}
          images={product.images.map((image) => ({
            id: image.id,
            url: image.url,
            alt: image.alt,
          }))}
          candidate={candidate}
          candidateSourceImageId={candidateSourceImageId}
        />
      ) : null}

      <section className="card mt-6 p-5">
        <h2 className="font-bold text-ink-900">Photo covers</h2>
        <p className="mb-3 mt-1 text-sm text-ink-500">
          Hide the retailer&apos;s price sticker on a public photo. Drawing is
          saved as coordinates, so it can be undone or redone without ever
          touching the original upload.
        </p>
        <ExistingProductMaskEditor
          productId={product.id}
          images={product.images.map((image) => ({
            id: image.id,
            url: image.url,
            alt: image.alt,
            coverMode: image.coverMode,
            maskBoxes: image.maskBoxes,
          }))}
        />
      </section>

      <section className="card mt-6 p-5">
        <h2 className="font-bold text-ink-900">Private notes</h2>
        <form action={addProductNoteAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="productId" value={product.id} />
          <input className="input" name="body" placeholder="Add a note only staff can see" required />
          <button type="submit" className="btn btn-secondary">
            Add note
          </button>
        </form>
        <ul className="mt-4 space-y-3">
          {product.notes.length === 0 ? <li className="text-sm text-ink-500">No notes yet.</li> : null}
          {product.notes.map((note) => (
            <li key={note.id} className="rounded-lg bg-ink-50 px-3 py-2 text-sm">
              <p className="text-ink-900">{note.body}</p>
              <p className="mt-1 text-xs text-ink-500">
                {note.author?.name ?? "Staff"} · {formatWhen(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
