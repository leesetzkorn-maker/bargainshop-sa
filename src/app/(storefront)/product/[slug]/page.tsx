import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getProductBySlugIncludingUnavailable,
  getActiveCategories,
  getRecentProducts,
} from "@/lib/dal/catalog";
import { ProductGallery } from "@/components/product-gallery";
import { AddToCartPanel } from "@/components/add-to-cart";
import { ConditionBadge, SectionHeading } from "@/components/ui";
import { TestingBadge } from "@/components/testing-badge";
import { ProductCard } from "@/components/product-card";
import { formatCustomerPrice, formatZAR, formatWeight, formatDimensions } from "@/lib/money";
import { excerpt, cn } from "@/lib/utils";
import { brand, absoluteUrl, hasWhatsapp, whatsappLink } from "@/lib/brand";
import {
  PRODUCT_CONDITION_BLURB,
  PRODUCT_CONDITION_LABELS,
  PRODUCT_CONDITIONS,
  SHIPPING_METHOD_LABELS,
  conditionDescription,
  type ProductCondition,
} from "@/lib/enums";
import { quoteShipping, toParcelLines } from "@/lib/dal/shipping";
import { BreadcrumbJsonLd } from "@/components/json-ld";

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugIncludingUnavailable(slug);
  if (!product) return { title: "Product not found" };

  const condition = PRODUCT_CONDITION_LABELS[product.condition as ProductCondition] ?? product.condition;
  const description = excerpt(
    `${condition} condition second-hand ${product.name}. ${product.description}`,
    155,
  );
  const image = product.images[0]?.url;
  const available = product.status === "ACTIVE" && product.stockQty > 0 && product.priceCents > 0;
  const previewListing = product.status === "DRAFT";

  return {
    title: available || previewListing
      ? `${product.name} — ${condition} second-hand`
      : `${product.name} — sold out`,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    robots: available ? undefined : { index: false, follow: true },
    openGraph: {
      type: "website",
      url: `/product/${product.slug}`,
      title: `${product.name} — ${condition} second-hand`,
      description,
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — ${condition} second-hand`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlugIncludingUnavailable(slug);
  if (!product) notFound();

  const previewListing = product.status === "DRAFT";
  const priceLabel = formatCustomerPrice(product.priceCents);
  const forSale = product.status === "ACTIVE" && product.stockQty > 0 && priceLabel != null;
  const soldOut = !previewListing && !forSale;

  // Delivery estimate for this single item, so the customer sees it up front.
  const quote = await quoteShipping(
    toParcelLines([{ product, quantity: 1 }]),
    product.priceCents,
  );

  const [related, categories] = await Promise.all([
    getActiveCategories().then(async (all) =>
      all.length > 0
        ? getRecentProducts(8).then((items) =>
            items
              .filter((p) => p.category.slug === product.category.slug && p.id !== product.id)
              .slice(0, 4),
          )
        : [],
    ),
    getActiveCategories(),
  ]);

  const parcel = quote.parcel;
  const anyAvailable = quote.methods.some((m) => m.available);
  const doorMethod = quote.methods.find((m) => m.method === "LOCKER_TO_DOOR");

  const jsonLd = buildProductJsonLd(product, {
    soldOut,
    forSale,
    description: excerpt(product.description, 300),
    image: product.images[0]?.url,
  });

  return (
    <div className="container-page py-6 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            BreadcrumbJsonLd([
              { name: "Home", url: absoluteUrl("/") },
              { name: "Categories", url: absoluteUrl("/categories") },
              { name: product.category.name, url: absoluteUrl(`/category/${product.category.slug}`) },
              { name: product.name, url: absoluteUrl(`/product/${product.slug}`) },
            ]),
          ).replace(/</g, "\\u003c"),
        }}
      />

      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-ink-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-ink-800 hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={`/category/${product.category.slug}`}
              className="hover:text-ink-800 hover:underline"
            >
              {product.category.name}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span className="font-medium text-ink-700" aria-current="page">
              {product.name}
            </span>
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery
          images={product.images}
          name={product.name}
          soldOut={soldOut}
        />

        <div>
          <p className="mb-2 flex flex-wrap items-center gap-2">
            <Link
              href={`/category/${product.category.slug}`}
              className="text-xs font-semibold uppercase tracking-wide text-brand-700 hover:underline"
            >
              {product.category.name}
            </Link>
            <span aria-hidden="true" className="text-ink-300">·</span>
            <span className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Item {product.itemId}
            </span>
          </p>

          <h1 className="heading-section text-2xl text-ink-900 sm:text-3xl">{product.name}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="badge badge-accent">PRE-OWNED</span>
            <ConditionBadge condition={product.condition} />
            {/* The functional claim, kept visibly separate from the cosmetic grade. */}
            <TestingBadge status={product.testingStatus} showExplanation={false} />
            {product.stockQty === 1 && !soldOut ? (
              <span className="badge badge-accent">Only 1 available</span>
            ) : null}
            {soldOut ? (
              <span className="badge badge-danger">
                {product.status === "ARCHIVED" ? "No longer listed" : "Sold out"}
              </span>
            ) : null}
          </div>

          {soldOut ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">This item is no longer available.</p>
              <p className="mt-1 text-amber-800">
                We source new stock regularly, so it is worth checking back — or browse similar items
                below.
              </p>
            </div>
          ) : null}

          <p className="mt-2 text-sm text-ink-600">
            {conditionDescription(product.condition, product.conditionNote)}
          </p>
          <div className="mt-3">
            <TestingBadge status={product.testingStatus} />
          </div>

          <p className="mt-5 text-3xl font-bold tracking-tight text-ink-900 tabular-nums">
            {priceLabel ?? "Price to be confirmed"}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Delivery is calculated separately and shown before you pay.
          </p>

          {product.brand || product.model ? <p className="mt-3 text-sm text-ink-600">{[product.brand, product.model].filter(Boolean).join(" / ")}</p> : null}
          {product.specifications ? <section className="mt-4"><h2 className="font-bold">Specifications</h2><p className="mt-1 whitespace-pre-line text-sm">{product.specifications}</p></section> : null}
          {product.includedItems ? <section className="mt-4"><h2 className="font-bold">What&apos;s included</h2><p className="mt-1 whitespace-pre-line text-sm">{product.includedItems}</p></section> : null}
          <div className="mt-6">
            {forSale ? (
              <AddToCartPanel
                slug={product.slug}
                stockQty={product.stockQty}
                status={product.status}
              />
            ) : (
              <Link href="/shop" className="btn btn-accent btn-lg w-full">
                Shop now
              </Link>
            )}
          </div>

          {/* ------------------------------------------------- DELERY ESTIMATE */}
          <section className="card mt-6 p-4">
            <h2 className="mb-3 text-sm font-bold text-ink-900">Delivery for this item</h2>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Parcel weight</dt>
                <dd className="font-medium text-ink-900">
                  {formatWeight(parcel.weightGrams)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Parcel size</dt>
                <dd className="font-medium text-ink-900">
                  {formatDimensions(parcel.lengthCm, parcel.widthCm, parcel.heightCm)}
                </dd>
              </div>
            </dl>

            <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
              {quote.methods.filter((entry) => entry.available).map((entry) => (
                <div key={entry.method} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">
                      {SHIPPING_METHOD_LABELS[entry.method]}{" "}
                      <span className="font-normal text-ink-500">
                        (est. {entry.etaMinDays}–{entry.etaMaxDays} working days)
                      </span>
                    </p>
                    <p className="text-xs text-ink-500">
                      {entry.method === "LOCKER_TO_LOCKER"
                        ? "Collect from a locker near you"
                        : entry.method === "LOCKER_TO_KIOSK"
                          ? "Collect from a kiosk near you"
                          : "Delivered to your street address"}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-ink-900 tabular-nums">
                    {formatZAR(entry.priceCents)}
                  </span>
                </div>
              ))}

              {!anyAvailable ? (
                <p className="text-sm text-ink-600">
                  {quote.error ?? "Delivery options for this item are not set up yet."}{" "}
                  <Link href="/contact" className="font-semibold text-brand-700 hover:underline">
                    Contact us
                  </Link>{" "}
                  for a quote.
                </p>
              ) : null}

              {anyAvailable && doorMethod && !doorMethod.available ? (
                <p className="text-xs text-ink-500">{doorMethod.unavailableReason}</p>
              ) : null}
            </div>

            <Link
              href="/shipping"
              className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline"
            >
              How delivery pricing works →
            </Link>
          </section>

          {hasWhatsapp() ? (
            <a
              href={whatsappLink(
                `Hi ${brand.name}, I have a question about item ${product.itemId} (${product.name}).`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm mt-4 w-full"
            >
              Ask about this item on WhatsApp
            </a>
          ) : null}
        </div>
      </div>

      {/* --------------------------------------------------------- DESCRIPTION */}
      <div className="mt-12 grid gap-8 border-t border-ink-200 pt-8 lg:grid-cols-[1fr_20rem]">
        <section>
          <h2 className="heading-section text-xl text-ink-900">About this item</h2>
          <div className="prose-store mt-3 text-ink-700">
            {product.description.split("\n\n").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          <h3 className="heading-section mt-8 text-base text-ink-900">Condition grading</h3>
          <p className="mt-1 text-sm text-ink-600">
            The grade describes how the item looks. Whether it works is stated
            separately above, and no grade here means refurbished or new.
          </p>
          <dl className="mt-3 space-y-2.5">
            {PRODUCT_CONDITIONS.map((grade) => (
              <div key={grade} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="w-24 shrink-0">
                  <ConditionBadge condition={grade} />
                </dt>
                <dd
                  className={cn(
                    "text-sm text-ink-600",
                    product.condition === grade && "font-semibold text-ink-900",
                  )}
                >
                  {PRODUCT_CONDITION_BLURB[grade]}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <aside>
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-ink-900">Item details</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                { label: "Item number", value: product.itemId },
                { label: "Condition", value: PRODUCT_CONDITION_LABELS[product.condition as ProductCondition] ?? product.condition },
                { label: "Category", value: product.category.name },
                { label: "Item weight", value: formatWeight(product.productWeightGrams) },
                { label: "Parcel weight", value: formatWeight(parcel.weightGrams) },
                {
                  label: "Parcel size",
                  value: formatDimensions(
                    product.packageLengthCm,
                    product.packageWidthCm,
                    product.packageHeightCm,
                  ),
                },
                { label: "Availability", value: soldOut ? "Sold out" : "In stock" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between gap-3">
                  <dt className="text-ink-500">{row.label}</dt>
                  <dd className="text-right font-medium text-ink-900">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
              Weight and dimensions are the packed measurements used to work out delivery cost.
            </p>
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="mt-14 border-t border-ink-200 pt-8">
          <SectionHeading
            eyebrow="More in this category"
            title={`Also look at`}
            description="Other second-hand items in the same category."
            action={
              <Link
                href={`/category/${product.category.slug}`}
                className="btn btn-secondary btn-sm shrink-0"
              >
                View all {categories.find((c) => c.slug === product.category.slug)?.name ?? ""}
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * schema.org Product markup. `aggregateRating` and `review` are intentionally
 * omitted — we must not fabricate review data.
 */
function buildProductJsonLd(
  product: {
    brand: string;
    model: string;
    name: string;
    slug: string;
    description: string;
    itemId: string;
    priceCents: number;
    stockQty: number;
    condition: string;
    images: Array<{ url: string }>;
    category: { name: string; slug: string };
  },
  options: { soldOut: boolean; forSale: boolean; description: string; image?: string },
): Record<string, unknown> {
  /**
   * schema.org itemCondition.
   *
   * Nothing here may map to NewCondition. "Very good" is the best of our
   * SECOND-HAND grades, not a new item, and the old table advertised it as
   * NewCondition to Google — which is both wrong and a legal problem. Very good
   * is used condition with light wear. Only AS_IS drops to DamagedCondition.
   */
  const conditionMap: Record<string, string> = {
    VERY_GOOD: "https://schema.org/UsedCondition",
    GOOD: "https://schema.org/UsedCondition",
    USED: "https://schema.org/UsedCondition",
    AS_IS: "https://schema.org/DamagedCondition",
  };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: options.description,
    sku: product.itemId,
    category: product.category.name,
    image: product.images.map((img) => absoluteUrl(img.url)),
    ...(options.image ? { thumbnailUrl: absoluteUrl(options.image) } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(product.model ? { model: product.model } : {}),
    itemCondition: conditionMap[product.condition] ?? "https://schema.org/UsedCondition",
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: brand.currency,
      ...(product.priceCents > 0 ? { price: (product.priceCents / 100).toFixed(2) } : {}),
      availability: options.forSale
        ? "https://schema.org/InStock"
        : options.soldOut
          ? "https://schema.org/SoldOut"
          : "https://schema.org/PreOrder",
      itemCondition: conditionMap[product.condition] ?? "https://schema.org/UsedCondition",
      seller: { "@type": "Organization", name: brand.name },

    },
  };
}
