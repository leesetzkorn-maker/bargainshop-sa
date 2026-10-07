import type { Metadata } from "next";
import { PricingForm } from "@/components/admin/pricing-form";
import { PageHeader } from "@/components/admin/ui";
import { getPricingSettings } from "@/lib/dal/pricing";

export const metadata: Metadata = { title: "Pricing" };

export default async function AdminPricingPage() {
  const settings = await getPricingSettings();

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Recommendations cover source cost, handling, packaging, minimum profit and estimated payment fees. Final prices remain editable. Shipping is paid separately by customers."
      />
      <PricingForm settings={settings} />
    </>
  );
}
