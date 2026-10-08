import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { getActiveCategories } from "@/lib/dal/catalog";
import { absoluteUrl } from "@/lib/brand";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/shop"), changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/categories"), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/how-it-works"), changeFrequency: "yearly", priority: 0.5 },
    { url: absoluteUrl("/shipping"), changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/contact"), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/returns"), changeFrequency: "yearly", priority: 0.4 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.3 },
  ];

  // A production database is not guaranteed to exist while the deployment
  // image is being built. Keep sitemap generation build-safe: static routes
  // remain available, and catalogue routes are added whenever the DB is ready.
  try {
    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: { status: "ACTIVE", images: { some: { url: { startsWith: "/uploads/" } } } },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      getActiveCategories(),
    ]);

    return [
      ...staticRoutes,
      ...categories.map((category) => ({
        url: absoluteUrl(`/category/${category.slug}`),
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
      ...products.map((product) => ({
        url: absoluteUrl(`/product/${product.slug}`),
        lastModified: product.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch (error) {
    console.warn("Sitemap catalogue routes skipped because the database is unavailable.", error);
    return staticRoutes;
  }
}
