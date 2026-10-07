import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ConditionBadge, StockBadge } from "@/components/ui";
import { TestingBadge } from "@/components/testing-badge";
import { formatCustomerPrice } from "@/lib/money";
import type { CatalogProduct } from "@/lib/dal/catalog";

/**
 * Product card. `preload` rather than the removed `priority` prop — see
 * node_modules/next/dist/docs for the Next 16 image API.
 */
export function ProductCard({
  product,
  className,
  priority = false,
}: {
  product: CatalogProduct;
  className?: string;
  priority?: boolean;
}) {
  const soldOut = product.status === "SOLD_OUT" || (product.status === "ACTIVE" && product.stockQty <= 0);
  const image = product.images[0];
  const photo = image?.url.startsWith("/uploads/") ?? false;
  const priceLabel = formatCustomerPrice(product.priceCents);

  return (
    <article
      className={cn(
        "group card flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-card-hover)]",
        className,
      )}
    >
      <Link
        href={`/product/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-white"
        tabIndex={soldOut ? -1 : undefined}
        aria-disabled={soldOut}
      >
        {image ? (
          <Image
            src={image.url}
            alt={image.alt ?? product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={cn(
              photo ? "object-contain p-2" : "object-cover",
              "transition-transform duration-300",
              soldOut ? "opacity-50 grayscale" : "group-hover:scale-[1.03]",
            )}
            preload={priority}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-400">
            No photo
          </div>
        )}

        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {product.testingStatus === "TESTED_AND_WORKING" ? (
            <TestingBadge status={product.testingStatus} showExplanation={false} />
          ) : null}
          {soldOut ? (
            <span className="badge badge-danger shadow-sm">Sold out</span>
          ) : product.stockQty === 1 && product.status === "ACTIVE" ? (
            <span className="badge badge-accent shadow-sm">Only 1</span>
          ) : null}
        </div>

        <div className="absolute bottom-2.5 left-2.5">
          <ConditionBadge condition={product.condition} />
        </div>

        <div className="absolute bottom-2.5 right-2.5">
          <span className={cn("badge shadow-md", priceLabel ? "badge-brand" : "badge-neutral")}>
            {priceLabel ?? "Price TBC"}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          {product.category.name}
        </p>

        <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-snug text-ink-900">
          <Link
            href={`/product/${product.slug}`}
            className={cn("hover:underline", soldOut && "text-ink-500")}
          >
            {product.name}
          </Link>
        </h3>

        {product.status === "ACTIVE" ? (
          <div className="mt-auto flex justify-end">
            <StockBadge stockQty={product.stockQty} status={product.status} />
          </div>
        ) : null}
        <Link
          href={`/product/${product.slug}`}
          className={cn("btn btn-accent btn-sm mt-3 w-full", product.status !== "ACTIVE" && "mt-auto")}
        >
          Shop now
        </Link>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-square animate-pulse bg-ink-100">
        <div className="absolute bottom-2.5 right-2.5 h-7 w-20 rounded-md bg-white/80" />
      </div>
      <div className="space-y-2 p-4">
        <div className="h-2.5 w-16 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  );
}
