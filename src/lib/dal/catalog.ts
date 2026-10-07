import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/db";
import { PUBLICLY_REACHABLE_PRODUCT_STATUSES } from "@/lib/enums";

/**
 * CUSTOMER-FACING reads.
 *
 * Every query in this file uses an explicit `select` allow-list rather than
 * `include` or a bare `findMany`. That is deliberate: `sourceCostCents`,
 * `supplierNotes` and `adminNotes` exist on the Product row, so any future
 * `select *` refactor would silently publish private margin data. Adding a
 * field to the storefront means adding it here on purpose.
 */

export interface CatalogProduct {
  brand: string;
  model: string;
  specifications: string;
  includedItems: string;
  lockerAllowed: boolean;
  courierAllowed: boolean;
  id: string;
  itemId: string;
  name: string;
  slug: string;
  description: string;
  condition: string;
  conditionNote: string | null;
  testingStatus: string;
  testedAt: Date | null;
  measurementSource: string;
  priceCents: number;
  stockQty: number;
  status: string;
  isFeatured: boolean;
  createdAt: Date;
  productWeightGrams: number;
  packageWeightGrams: number;
  packageLengthCm: number;
  packageWidthCm: number;
  packageHeightCm: number;
  category: { name: string; slug: string };
  images: { id: string; url: string; alt: string | null; sortOrder: number }[];
}

/** The complete set of fields safe to send to a customer-facing page. */
const publicProductSelect = {
  brand: true, model: true, specifications: true, includedItems: true,
  lockerAllowed: true,
  courierAllowed: true,
  id: true,
  itemId: true,
  name: true,
  slug: true,
  description: true,
  condition: true,
  conditionNote: true,
  testingStatus: true,
  testedAt: true,
  /**
   * Whether the packed weight and box size were measured or calculated. Safe to
   * publish: it is provenance, not a secret, and the product page has to be able
   * to tell the customer which kind of number produced the delivery price.
   */
  measurementSource: true,
  priceCents: true,
  stockQty: true,
  status: true,
  isFeatured: true,
  createdAt: true,
  productWeightGrams: true,
  packageWeightGrams: true,
  packageLengthCm: true,
  packageWidthCm: true,
  packageHeightCm: true,
  category: { select: { name: true, slug: true } },
  images: {
    select: { id: true, url: true, alt: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  },
} as const;

/** Only live, in-stock products are ever visible to customers. */
const visibleStatus = "ACTIVE" as const;

/** Prepared photo drafts. Shown on the development preview, never as production stock. */
const PHOTO_DRAFT_FROM = "2DS-0045";
const PHOTO_DRAFT_TO = "2DS-0097";

export function storefrontShowsPhotoDrafts(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * What the customer catalogue may list.
 *
 * Production lists live products only. The development preview also lists the
 * prepared photo drafts, and it hides seed rows that only have placeholder art,
 * so the preview is the real photographs. Purchase checks stay on `ACTIVE`.
 */
function customerCatalogueWhere() {
  if (!storefrontShowsPhotoDrafts()) {
    return { status: visibleStatus, images: { some: { url: { startsWith: "/uploads/" } } } };
  }
  return {
    OR: [
      {
        status: visibleStatus,
        images: { some: { url: { startsWith: "/uploads/" } } },
      },
      {
        status: "DRAFT" as const,
        itemId: { gte: PHOTO_DRAFT_FROM, lte: PHOTO_DRAFT_TO },
        images: { some: { url: { startsWith: "/uploads/products/" } } },
      },
    ],
  };
}

/**
 * Any product a customer could plausibly have a link to, including sold-out,
 * reserved and archived ones. A one-off disappearing from sale must not become
 * a 404: shared links, search results and a customer's own history should land
 * on a page that explains what happened. DRAFT is deliberately excluded so
 * unpublished products are never reachable.
 */
const reachableStatuses = [...PUBLICLY_REACHABLE_PRODUCT_STATUSES];

function shape<T extends { images: { sortOrder: number }[] }>(rows: T[]): T[] {
  return rows;
}

export interface ShopFilters {
  categorySlug?: string;
  search?: string;
  condition?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStockOnly?: boolean;
  featuredOnly?: boolean;
  sort?: "newest" | "price-asc" | "price-desc" | "name";
  page?: number;
  perPage?: number;
}

export const DEFAULT_PER_PAGE = 12;
export const MAX_PER_PAGE = 48;

/** A live product, fully hydrated for the storefront. */
export const getProductBySlug = cache(async (slug: string): Promise<CatalogProduct | null> => {
  return prisma.product.findFirst({
    where: { slug, status: visibleStatus, images: { some: { url: { startsWith: "/uploads/" } } } },
    select: publicProductSelect,
  });
});

/**
 * Any product a customer could plausibly have a link to, including sold-out and
 * archived ones. A one-off disappearing from sale must not become a 404: shared
 * links, search results and a customer's own history should land on a page that
 * explains it is gone. DRAFT is deliberately excluded so unpublished products
 * are never reachable.
 */
export const getProductBySlugIncludingUnavailable = cache(
  async (slug: string): Promise<CatalogProduct | null> => {
    return prisma.product.findFirst({
      where: storefrontShowsPhotoDrafts()
        ? {
            slug,
            OR: [
              { status: { in: reachableStatuses } },
              {
                status: "DRAFT",
                itemId: { gte: PHOTO_DRAFT_FROM, lte: PHOTO_DRAFT_TO },
              },
            ],
          }
        : { slug, status: { in: reachableStatuses }, images: { some: { url: { startsWith: "/uploads/" } } } },
      select: publicProductSelect,
    });
  },
);

/** Products that a customer may still buy: live and with stock on hand. */
export const getPurchasableProductBySlug = cache(
  async (slug: string): Promise<CatalogProduct | null> => {
    const product = await getProductBySlug(slug);
    if (!product) return null;
    return product.stockQty > 0 ? product : null;
  },
);

export interface ProductListResult {
  products: CatalogProduct[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export async function listProducts(filters: ShopFilters = {}): Promise<ProductListResult> {
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, filters.perPage ?? DEFAULT_PER_PAGE));
  const page = Math.max(1, filters.page ?? 1);

  const where = {
    AND: [
      customerCatalogueWhere(),
      ...(filters.categorySlug ? [{ category: { slug: filters.categorySlug } }] : []),
      ...(filters.condition ? [{ condition: filters.condition }] : []),
      ...(filters.featuredOnly ? [{ isFeatured: true }] : []),
      ...(filters.inStockOnly ? [{ stockQty: { gt: 0 } }] : []),
      ...(filters.search
        ? [
            {
              OR: [
                { name: { contains: filters.search } },
                { description: { contains: filters.search } },
                { itemId: { contains: filters.search.toUpperCase() } },
                { sku: { contains: filters.search.toUpperCase() } },
              ],
            },
          ]
        : []),
      // A missing selling price is not R0, so it must not match a price filter.
      ...(filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined
        ? [
            {
              priceCents: {
                gt: 0,
                ...(filters.minPriceCents !== undefined ? { gte: filters.minPriceCents } : {}),
                ...(filters.maxPriceCents !== undefined ? { lte: filters.maxPriceCents } : {}),
              },
            },
          ]
        : []),
    ],
  };

  const orderBy =
    filters.sort === "price-asc"
      ? ({ priceCents: "asc" } as const)
      : filters.sort === "price-desc"
        ? ({ priceCents: "desc" } as const)
        : filters.sort === "name"
          ? ({ name: "asc" } as const)
          : ({ createdAt: "desc" } as const);

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: publicProductSelect,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: shape(rows),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export const getFeaturedProducts = cache(async (take = 8): Promise<CatalogProduct[]> => {
  return prisma.product.findMany({
    where: { AND: [customerCatalogueWhere(), { isFeatured: true }] },
    select: publicProductSelect,
    orderBy: { createdAt: "desc" },
    take,
  });
});

/** Falls back to newest arrivals when nothing is flagged as featured. */
export async function getFeaturedOrRecent(take = 8): Promise<CatalogProduct[]> {
  const featured = await getFeaturedProducts(take);
  if (featured.length >= take) return featured;
  const recent = await getRecentProducts(take);
  const seen = new Set(featured.map((p) => p.id));
  return [...featured, ...recent.filter((p) => !seen.has(p.id))].slice(0, take);
}

export const getRecentProducts = cache(async (take = 8): Promise<CatalogProduct[]> => {
  return prisma.product.findMany({
    where: customerCatalogueWhere(),
    select: publicProductSelect,
    orderBy: { createdAt: "desc" },
    take,
  });
});

/** Every product the current storefront may show, for homepage rails. */
export async function listCustomerCatalogue(): Promise<CatalogProduct[]> {
  return prisma.product.findMany({
    where: customerCatalogueWhere(),
    select: publicProductSelect,
    orderBy: { itemId: "asc" },
  });
}

/** "Bargains" = cheapest live items with stock, ordered by price. */
export async function getBargainProducts(take = 8): Promise<CatalogProduct[]> {
  return prisma.product.findMany({
    where: { AND: [customerCatalogueWhere(), { stockQty: { gt: 0 }, priceCents: { gt: 0 } }] },
    select: publicProductSelect,
    orderBy: { priceCents: "asc" },
    take,
  });
}

/** Cents. The "Under R500" rail on the homepage. */
export const UNDER_FIVE_HUNDRED_CENTS = 50_000;

/**
 * Everything available below a price ceiling, cheapest first.
 * Drives the homepage "under R500" section and the matching shop filter.
 */
export async function getPriceBucketProducts(
  maxCents: number = UNDER_FIVE_HUNDRED_CENTS,
  take = 8,
): Promise<CatalogProduct[]> {
  return prisma.product.findMany({
    where: {
      AND: [customerCatalogueWhere(), { stockQty: { gt: 0 }, priceCents: { gt: 0, lte: maxCents } }],
    },
    select: publicProductSelect,
    orderBy: { priceCents: "asc" },
    take,
  });
}

/** True when at least one buyable item sits under the ceiling. */
export async function countPriceBucket(maxCents: number = UNDER_FIVE_HUNDRED_CENTS): Promise<number> {
  return prisma.product.count({
    where: {
      AND: [customerCatalogueWhere(), { stockQty: { gt: 0 }, priceCents: { gt: 0, lte: maxCents } }],
    },
  });
}

/**
 * Sibling products from the same category, used for "related products".
 * Falls back to newest same-category stock so the rail is never empty on a
 * category that only has one item.
 */
export const getRelatedProducts = cache(
  async (slug: string, categoryId: string, take = 4): Promise<CatalogProduct[]> => {
    return prisma.product.findMany({
      where: { AND: [customerCatalogueWhere(), { categoryId, slug: { not: slug } }] },
      select: publicProductSelect,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      take,
    });
  },
);

/** Slugs + last-modified times, for the sitemap. Public fields only. */
export async function getProductSlugsForSitemap(): Promise<
  Array<{ slug: string; updatedAt: Date; images: { url: string }[] }>
> {
  return prisma.product.findMany({
    where: { status: visibleStatus },
    select: { slug: true, updatedAt: true, images: { select: { url: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Resolve cart slugs into purchasable products.
 *
 * Returns only what the customer may actually buy, so the cart can never show
 * an archived item, a zero-stock item, or a private field.
 */
export async function resolveCartProducts(
  entries: Array<{ slug: string; quantity: number }>,
): Promise<Array<{ product: CatalogProduct; quantity: number }>> {
  if (entries.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { slug: { in: entries.map((e) => e.slug) }, status: visibleStatus },
    select: publicProductSelect,
  });

  const bySlug = new Map(products.map((p) => [p.slug, p]));

  return entries.flatMap((entry) => {
    const product = bySlug.get(entry.slug);
    if (!product) return [];
    // Clamp to what is actually on hand.
    const quantity = Math.max(0, Math.min(entry.quantity, product.stockQty));
    if (quantity === 0) return [];
    return [{ product, quantity }];
  });
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  productCount: number;
}

export interface PublicCategoryNode extends PublicCategory {
  children: PublicCategory[];
}

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  parentId: true,
  _count: { select: { products: { where: customerCatalogueWhere() } } },
} as const;

function toCategory(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  _count: { products: number };
}): PublicCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    parentId: row.parentId,
    productCount: row._count.products,
  };
}

/**
 * The eight main categories, each with its sub-categories attached.
 *
 * Only main categories (parentId === null) are returned, because they are what
 * the navigation shows. A sub-category is still reachable directly by slug, and
 * a main category's own product count deliberately includes everything in its
 * subtree so a shopper tapping "Hand Tools" sees the spanners and toolboxes too.
 */
export const getCategoryTree = cache(async (): Promise<PublicCategoryNode[]> => {
  const rows = await prisma.category.findMany({
    where: { isActive: true, products: { some: customerCatalogueWhere() } },
    select: categorySelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const all = rows.map(toCategory);
  const byParent = new Map<string | null, PublicCategory[]>();
  for (const category of all) {
    const bucket = byParent.get(category.parentId) ?? [];
    bucket.push(category);
    byParent.set(category.parentId, bucket);
  }

  const subtreeCount = (category: PublicCategory): number => {
    const children = byParent.get(category.id) ?? [];
    return children.reduce((sum, child) => sum + subtreeCount(child), category.productCount);
  };

  return (byParent.get(null) ?? []).map((main) => ({
    ...main,
    productCount: subtreeCount(main),
    children: byParent.get(main.id) ?? [],
  }));
});

/** Main categories only, for the nav and the category index page. */
export const getMainCategories = cache(async (): Promise<PublicCategoryNode[]> => getCategoryTree());

export const getActiveCategories = cache(async (): Promise<PublicCategory[]> => {
  const rows = await prisma.category.findMany({
    where: { isActive: true, products: { some: customerCatalogueWhere() } },
    select: categorySelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return rows.map(toCategory);
});

export const getCategoryBySlug = cache(async (slug: string): Promise<PublicCategory | null> => {
  const row = await prisma.category.findFirst({
    where: { slug, isActive: true },
    select: categorySelect,
  });
  return row ? toCategory(row) : null;
});

/** The main category a sub-category belongs to, for breadcrumbs and SEO. */
export const getCategoryParent = cache(
  async (parentId: string): Promise<PublicCategory | null> => {
    const row = await prisma.category.findFirst({
      where: { id: parentId, isActive: true },
      select: categorySelect,
    });
    return row ? toCategory(row) : null;
  },
);

/** Price envelope, for the shop filter slider. Public data only. */
export async function getPriceRange(): Promise<{ minCents: number; maxCents: number }> {
  const agg = await prisma.product.aggregate({
    where: { AND: [customerCatalogueWhere(), { priceCents: { gt: 0 } }] },
    _min: { priceCents: true },
    _max: { priceCents: true },
  });
  const minCents = agg._min.priceCents ?? 0;
  const maxCents = agg._max.priceCents ?? 0;
  return minCents === maxCents ? { minCents, maxCents: maxCents + 1000 } : { minCents, maxCents };
}
