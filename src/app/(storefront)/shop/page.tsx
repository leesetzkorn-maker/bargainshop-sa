import Link from "next/link";
import type { Metadata } from "next";
import { getActiveCategories, listProducts, getPriceRange, DEFAULT_PER_PAGE } from "@/lib/dal/catalog";
import { ProductCard } from "@/components/product-card";
import { EmptyState, SectionHeading } from "@/components/ui";
import { PRODUCT_CONDITIONS, PRODUCT_CONDITION_LABELS } from "@/lib/enums";
import { formatZAR } from "@/lib/money";
import { parseZARToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Shop all second-hand bargains",
  description:
    "Browse every second-hand item we have in stock — power tools, air fryers, small electronics, car accessories and more. Filter by category, condition and price.",
  alternates: { canonical: "/shop" },
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name: A to Z" },
] as const;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = await searchParams;

  const categorySlug = single(params.category);
  const search = single(params.q)?.trim().slice(0, 80);
  const condition = single(params.condition);
  const sortRaw = single(params.sort) ?? "newest";
  const minRaw = single(params.min);
  const maxRaw = single(params.max);
  const page = Math.max(1, Number.parseInt(single(params.page) ?? "1", 10) || 1);
  const featured = single(params.featured) === "1";

  const sort = (SORT_OPTIONS.find((o) => o.value === sortRaw)?.value ?? "newest") as
    | "newest"
    | "price-asc"
    | "price-desc"
    | "name";

  const [categories, priceRange, result] = await Promise.all([
    getActiveCategories(),
    getPriceRange(),
    listProducts({
      categorySlug,
      search,
      condition: PRODUCT_CONDITIONS.includes(condition as never) ? condition : undefined,
      minPriceCents: minRaw ? (parseZARToCents(minRaw) ?? undefined) : undefined,
      maxPriceCents: maxRaw ? (parseZARToCents(maxRaw) ?? undefined) : undefined,
      featuredOnly: featured,
      sort,
      page,
      perPage: DEFAULT_PER_PAGE,
    }),
  ]);

  const activeCategory = categories.find((c) => c.slug === categorySlug);
  const hasFilters = Boolean(search || condition || minRaw || maxRaw || categorySlug || featured);

  /** Build a URL preserving the other active filters. */
  function hrefWith(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      category: categorySlug,
      q: search,
      condition,
      sort: sortRaw === "newest" ? undefined : sortRaw,
      min: minRaw,
      max: maxRaw,
      featured: featured ? "1" : undefined,
      page: undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/shop?${query}` : "/shop";
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-500">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-ink-800 hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span className="font-medium text-ink-700" aria-current="page">
              {activeCategory ? activeCategory.name : "Shop"}
            </span>
          </li>
        </ol>
      </nav>

      <div className="mb-6">
        <h1 className="heading-section text-2xl text-ink-900 sm:text-3xl">
          {activeCategory ? activeCategory.name : "All second-hand goods"}
        </h1>
        <p className="mt-1.5 text-ink-600">
          {activeCategory?.description ??
            "Everything currently in stock, tested and ready to go. Most items are one-off — when it is gone, it is gone."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr] lg:gap-8">
        {/* ------------------------------------------------------- FILTER SIDEBAR */}
        <aside>
          <form action="/shop" method="get" className="card p-4 lg:sticky lg:top-24">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink-900">Filters</h2>
              {hasFilters ? (
                <Link href="/shop" className="text-xs font-semibold text-brand-700 hover:underline">
                  Clear all
                </Link>
              ) : null}
            </div>

            <div className="space-y-5">
              {/* Search */}
              <div>
                <label htmlFor="q" className="label">
                  Search
                </label>
                <input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={search ?? ""}
                  placeholder="e.g. air fryer"
                  className="input"
                />
              </div>

              {/* Category */}
              <div>
                <label htmlFor="category" className="label">
                  Category
                </label>
                <select id="category" name="category" defaultValue={categorySlug ?? ""} className="input">
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name} ({category.productCount})
                    </option>
                  ))}
                </select>
              </div>

              {/* Condition */}
              <fieldset>
                <legend className="label">Condition</legend>
                <div className="space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                    <input
                      type="radio"
                      name="condition"
                      value=""
                      defaultChecked={!condition}
                      className="accent-brand-700"
                    />
                    Any condition
                  </label>
                  {PRODUCT_CONDITIONS.map((value) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-ink-700"
                    >
                      <input
                        type="radio"
                        name="condition"
                        value={value}
                        defaultChecked={condition === value}
                        className="accent-brand-700"
                      />
                      {PRODUCT_CONDITION_LABELS[value]}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Price */}
              <fieldset>
                <legend className="label">Price (R)</legend>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    name="min"
                    min={0}
                    step="1"
                    inputMode="numeric"
                    defaultValue={minRaw ?? ""}
                    placeholder={String(Math.floor(priceRange.minCents / 100))}
                    aria-label="Minimum price"
                    className="input"
                  />
                  <span className="text-ink-400">to</span>
                  <input
                    type="number"
                    name="max"
                    min={0}
                    step="1"
                    inputMode="numeric"
                    defaultValue={maxRaw ?? ""}
                    placeholder={String(Math.ceil(priceRange.maxCents / 100))}
                    aria-label="Maximum price"
                    className="input"
                  />
                </div>
                <p className="hint">
                  In stock from {formatZAR(priceRange.minCents)} to {formatZAR(priceRange.maxCents)}
                </p>
              </fieldset>

              {sortRaw !== "newest" ? <input type="hidden" name="sort" value={sortRaw} /> : null}
              {featured ? <input type="hidden" name="featured" value="1" /> : null}

              <button type="submit" className="btn btn-primary w-full">
                Apply filters
              </button>
            </div>
          </form>
        </aside>

        {/* ----------------------------------------------------------- RESULTS */}
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600" aria-live="polite">
              <span className="font-semibold text-ink-900">{result.total}</span>{" "}
              {result.total === 1 ? "item" : "items"}
              {search ? ` for “${search}”` : ""}
            </p>

            <div className="flex items-center gap-2">
              <form action="/shop" method="get" className="flex items-center gap-2">
                {categorySlug ? <input type="hidden" name="category" value={categorySlug} /> : null}
                {search ? <input type="hidden" name="q" value={search} /> : null}
                {condition ? <input type="hidden" name="condition" value={condition} /> : null}
                {minRaw ? <input type="hidden" name="min" value={minRaw} /> : null}
                {maxRaw ? <input type="hidden" name="max" value={maxRaw} /> : null}
                {featured ? <input type="hidden" name="featured" value="1" /> : null}
                <label htmlFor="sort" className="text-sm text-ink-600">
                  Sort
                </label>
                <select id="sort" name="sort" defaultValue={sort} className="input w-auto py-1.5 text-sm">
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-secondary btn-sm">
                  Apply
                </button>
              </form>
            </div>
          </div>

          {hasFilters ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {search ? <FilterChip label={`“${search}”`} href={hrefWith({ q: undefined })} /> : null}
              {activeCategory ? (
                <FilterChip
                  label={activeCategory.name}
                  href={hrefWith({ category: undefined })}
                />
              ) : null}
              {condition ? (
                <FilterChip
                  label={PRODUCT_CONDITION_LABELS[condition as keyof typeof PRODUCT_CONDITION_LABELS]}
                  href={hrefWith({ condition: undefined })}
                />
              ) : null}
              {minRaw || maxRaw ? (
                <FilterChip
                  label={`${minRaw ? formatZAR(parseZARToCents(minRaw) ?? 0) : formatZAR(0)} – ${
                    maxRaw ? formatZAR(parseZARToCents(maxRaw) ?? 0) : "any"
                  }`}
                  href={hrefWith({ min: undefined, max: undefined })}
                />
              ) : null}
              {featured ? <FilterChip label="Featured" href={hrefWith({ featured: undefined })} /> : null}
            </div>
          ) : null}

          {result.products.length === 0 ? (
            <EmptyState
              title="No items match those filters"
              description="Try widening the price range, choosing a different condition, or browsing a different category. New stock arrives regularly."
              action={
                hasFilters ? (
                  <Link href="/shop" className="btn btn-primary">
                    Clear all filters
                  </Link>
                ) : (
                  <Link href="/contact" className="btn btn-primary">
                    Tell us what you are looking for
                  </Link>
                )
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                {result.products.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
              </div>

              {result.totalPages > 1 ? (
                <Pagination page={result.page} totalPages={result.totalPages} hrefWith={hrefWith} />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="badge badge-outline gap-1 py-1 pr-1.5 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
    >
      {label}
      <span aria-hidden="true" className="text-ink-400">
        ×
      </span>
      <span className="sr-only">Remove filter</span>
    </Link>
  );
}

function Pagination({
  page,
  totalPages,
  hrefWith,
}: {
  page: number;
  totalPages: number;
  hrefWith: (overrides: Record<string, string | undefined>) => string;
}) {
  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, page + 2);
  const pages = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      <Link
        href={page > 1 ? hrefWith({ page: String(page - 1) }) : "#"}
        aria-disabled={page === 1}
        className={cn("btn btn-secondary btn-sm", page === 1 && "pointer-events-none opacity-50")}
      >
        Previous
      </Link>

      {pages.map((p) => (
        <Link
          key={p}
          href={hrefWith({ page: p === 1 ? undefined : String(p) })}
          aria-current={p === page ? "page" : undefined}
          className={cn(
            "btn btn-sm min-w-9",
            p === page ? "btn-primary" : "btn-secondary",
          )}
        >
          {p}
        </Link>
      ))}

      <Link
        href={page < totalPages ? hrefWith({ page: String(page + 1) }) : "#"}
        aria-disabled={page === totalPages}
        className={cn("btn btn-secondary btn-sm", page === totalPages && "pointer-events-none opacity-50")}
      >
        Next
      </Link>
    </nav>
  );
}

export { SectionHeading };
