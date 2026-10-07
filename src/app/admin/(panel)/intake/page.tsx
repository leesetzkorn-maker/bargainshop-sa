import { getPricingSettings } from "@/lib/dal/pricing";
import Link from "next/link";
import { listAdminCategories } from "@/lib/dal/admin";
import { PageHeader } from "@/components/admin/ui";
import { IntakeWizard } from "@/components/admin/intake-wizard";

export default async function IntakePage() {
  const categories = await listAdminCategories();
  const pricingSettings = await getPricingSettings();

  return (
    <>
      <PageHeader
        title="Photo intake"
        description="Upload the photos, read the price tag, check the numbers, then save a draft."
      >
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
        <IntakeWizard
          categories={categories.map((category) => ({ id: category.id, name: category.name }))}
          pricingSettings={pricingSettings}
        />
      )}
    </>
  );
}
