import type { Metadata } from "next";
import { PricingForm } from "@/components/admin/pricing-form";
import { PageHeader } from "@/components/admin/ui";
import { getPricingSettings } from "@/lib/dal/pricing";
import { IncludedDeliveryCalculator } from "@/components/admin/included-delivery-calculator";

export const metadata: Metadata = { title: "Pricing" };

export default async function AdminPricingPage() {
  const settings = await getPricingSettings();

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Existing prices are unchanged. Check sourcing, packaging, courier and payment costs in the calculator before updating product prices and activating delivery-inclusive checkout."
      />
      <PricingForm settings={settings} />
      <IncludedDeliveryCalculator />
    </>
  );
}
