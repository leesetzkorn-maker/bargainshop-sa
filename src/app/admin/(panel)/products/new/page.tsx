import { getPricingSettings } from "@/lib/dal/pricing";
import Link from "next/link";
import { listAdminCategories } from "@/lib/dal/admin";
import { PageHeader } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";

export default async function NewProductPage() {
  const categories = await listAdminCategories();

  const pricingSettings = await getPricingSettings();

  return (
    <>
      <PageHeader title="Add product" description="Most used items should stay at a quantity of 1.">
        <Link href="/admin/products" className="btn btn-secondary">
          Back to products
        </Link>
      </PageHeader>
      {categories.length === 0 ? (
        <p className="text-sm text-ink-600">
          Add a category first.{" "}
          <Link href="/admin/categories" className="font-semibold text-brand-700">
            Categories
          </Link>
        </p>
      ) : (
        <ProductForm pricingSettings={pricingSettings} categories={categories.map((category) => ({ id: category.id, name: category.name }))} />
      )}
    </>
  );
}
