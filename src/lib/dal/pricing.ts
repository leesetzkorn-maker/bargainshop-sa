import "server-only";

import { prisma } from "@/lib/db";
import {
  DEFAULT_PRICING_SETTINGS,
  HOUSE_PRICING_TIERS,
  parsePricingTiers,
  type PricingSettings,
} from "@/lib/pricing";

/**
 * Load the markup rule, creating the singleton with defaults on first run.
 *
 * The defaults are NOT a recommendation about your business — they only exist so
 * the screen has something to show before an admin sets a real figure. Change
 * the markup in the admin before listing anything bought at a real price.
 */
export async function getPricingSettings(): Promise<PricingSettings> {
  let row = await prisma.pricingSetting.findUnique({ where: { id: 1 } });
  if (!row) {
    // Explicit values. The database default is an old 60% placeholder and must
    // not become the live rule just because someone opened the page.
    row = await prisma.pricingSetting.create({
      data: {
        id: 1,
        isActive: true,
        markupPercent: HOUSE_PRICING_TIERS[0].markupPercent,
        tiersJson: JSON.stringify(HOUSE_PRICING_TIERS),
        roundingIncrementCents: 1000,
        minPriceCents: 0,
        autoApplyToDrafts: false,
      },
    });
  }
  const tiers = parsePricingTiers(JSON.parse(row.tiersJson || "[]"));
  return {
    isActive: row.isActive,
    tiers: tiers.length > 0 ? tiers : HOUSE_PRICING_TIERS,
    roundingIncrementCents: row.roundingIncrementCents,
    minPriceCents: row.minPriceCents,
    handlingAllowanceCents: row.handlingAllowanceCents,
    packagingAllowanceCents: row.packagingAllowanceCents,
    minimumProfitCents: row.minimumProfitCents,
    paymentFeePercent: row.paymentFeePercent,
    targetMarginPercent: row.targetMarginPercent,
    paymentFeeFixedCents: row.paymentFeeFixedCents,
    roundingMode: row.roundingMode === "NEAREST" ? "NEAREST" : "UP",
  };
}

export async function updatePricingSettings(settings: PricingSettings): Promise<void> {
  const data = {
    isActive: settings.isActive,
    markupPercent: settings.tiers[0]?.markupPercent ?? 0,
    tiersJson: JSON.stringify(settings.tiers),
    roundingIncrementCents: settings.roundingIncrementCents,
    minPriceCents: settings.minPriceCents,
    handlingAllowanceCents: settings.handlingAllowanceCents,
    packagingAllowanceCents: settings.packagingAllowanceCents,
    minimumProfitCents: settings.minimumProfitCents,
    paymentFeePercent: settings.paymentFeePercent,
    targetMarginPercent: settings.targetMarginPercent,
    paymentFeeFixedCents: settings.paymentFeeFixedCents,
    roundingMode: settings.roundingMode,
  };
  await prisma.pricingSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
}

export { DEFAULT_PRICING_SETTINGS };
