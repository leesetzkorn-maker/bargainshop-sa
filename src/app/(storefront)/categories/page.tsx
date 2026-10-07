import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getActiveCategories } from "@/lib/dal/catalog";
import { SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Categories",
  description:
    "Browse second-hand goods by category — power tools, battery drills, grinders, jacks, spanners, toolboxes, air fryers, small electronics, car accessories, household and pet products.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const categories = await getActiveCategories();

  return (
    <div className="container-page py-10 sm:py-14">
      <SectionHeading
        eyebrow="Browse"
        title="All categories"
        description="Everything we stock, grouped so you can find what you need quickly."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/category/${category.slug}`}
            className="card group flex items-center gap-4 p-4 transition-shadow hover:shadow-[var(--shadow-card-hover)]"
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-100">
              {category.imageUrl ? (
                <Image
                  src={category.imageUrl}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-ink-900 group-hover:text-brand-800">
                {category.name}
              </h2>
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">
                {category.description ?? `${category.productCount} items in stock`}
              </p>
              <p className="mt-1.5 text-xs font-semibold text-brand-700">
                {category.productCount} {category.productCount === 1 ? "item" : "items"} →
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
