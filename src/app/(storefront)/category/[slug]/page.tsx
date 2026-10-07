import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCategoryBySlug, listProducts, DEFAULT_PER_PAGE } from "@/lib/dal/catalog";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/ui";
import { getActiveCategories } from "@/lib/dal/catalog";
import { brand } from "@/lib/brand";

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: `${category.name} — second-hand`,
    description:
      category.description ??
      `Browse our ${category.name.toLowerCase()} selection of tested second-hand goods.`,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: `${category.name} — second-hand | ${brand.name}`,
      description: category.description ?? undefined,
      url: `/category/${category.slug}`,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;

  const page = Math.max(
    1,
    Number.parseInt((Array.isArray(query.page) ? query.page[0] : query.page) ?? "1", 10) || 1,
  );

  const [category, categories, result] = await Promise.all([
    getCategoryBySlug(slug),
    getActiveCategories(),
    listProducts({ categorySlug: slug, page, perPage: DEFAULT_PER_PAGE }),
  ]);

  if (!category) notFound();

  const others = categories.filter((c) => c.slug !== category.slug);

  return (
    <div className="container-page py-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-ink-800 hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/categories" className="hover:text-ink-800 hover:underline">
              Categories
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span className="font-medium text-ink-700" aria-current="page">
              {category.name}
            </span>
          </li>
        </ol>
      </nav>

      <div className="mb-8">
        <h1 className="heading-section text-2xl text-ink-900 sm:text-3xl">{category.name}</h1>
        {category.description ? (
          <p className="mt-1.5 max-w-2xl text-ink-600">{category.description}</p>
        ) : null}
        <p className="mt-2 text-sm text-ink-500">
          {result.total} {result.total === 1 ? "item" : "items"} in stock
        </p>
      </div>

      {result.products.length === 0 ? (
        <EmptyState
          title="Nothing in this category right now"
          description="This section is empty at the moment. New stock arrives regularly — check back soon, or tell us what you are looking for."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/shop" className="btn btn-primary">
                Browse all items
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                Ask us to look for it
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {result.products.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>

          {result.totalPages > 1 ? (
            <nav aria-label="Pagination" className="mt-10 flex justify-center gap-1.5">
              {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={p === 1 ? `/category/${slug}` : `/category/${slug}?page=${p}`}
                  aria-current={p === page ? "page" : undefined}
                  className={`btn btn-sm min-w-9 ${p === page ? "btn-primary" : "btn-secondary"}`}
                >
                  {p}
                </Link>
              ))}
            </nav>
          ) : null}
        </>
      )}

      {others.length > 0 ? (
        <section className="mt-14 border-t border-ink-200 pt-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-500">
            Other categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/category/${other.slug}`}
                className="badge badge-outline py-1.5 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
              >
                {other.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
