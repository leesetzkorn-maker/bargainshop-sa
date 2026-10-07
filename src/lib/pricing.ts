/**
 * Recommendations cover cost, allowances, fees, minimum profit and margin targets.
 *
 * A missing cost, or a switched-off rule, returns null. Nothing here invents
 * a cost. Shipping is not part of this figure.
 */

export interface PricingTier {
  /** Inclusive lower bound, in cents. */
  minCostCents: number;
  /** Exclusive upper bound, in cents. Null means no ceiling. */
  belowCostCents: number | null;
  markupPercent: number;
}

export interface PricingSettings {
  isActive: boolean;
  tiers: PricingTier[];
  /** Nearest multiple. 1000 = nearest R10. 0 = no rounding. */
  roundingIncrementCents: number;
  minPriceCents: number;
  handlingAllowanceCents?: number;
  packagingAllowanceCents?: number;
  minimumProfitCents?: number;
  paymentFeePercent?: number;
  paymentFeeFixedCents?: number;
  roundingMode?: "NEAREST" | "UP";
  targetMarginPercent?: number;
}

/**
 * The bands set for 2DE-STORE. Editable later in Admin → Pricing.
 * R0–R199 → 60%, R200–R499 → 50%, R500–R999 → 40%,
 * R1,000–R1,999 → 35%, R2,000–R2,999 → 30%, R3,000+ → 25%.
 */
export const HOUSE_PRICING_TIERS: PricingTier[] = [
  { minCostCents: 0, belowCostCents: 20_000, markupPercent: 60 },
  { minCostCents: 20_000, belowCostCents: 50_000, markupPercent: 50 },
  { minCostCents: 50_000, belowCostCents: 100_000, markupPercent: 40 },
  { minCostCents: 100_000, belowCostCents: 200_000, markupPercent: 35 },
  { minCostCents: 200_000, belowCostCents: 300_000, markupPercent: 30 },
  { minCostCents: 300_000, belowCostCents: null, markupPercent: 25 },
];

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  isActive: true,
  tiers: HOUSE_PRICING_TIERS,
  roundingIncrementCents: 1000,
  minPriceCents: 0,
  handlingAllowanceCents: 2500,
  packagingAllowanceCents: 1500,
  minimumProfitCents: 7500,
  paymentFeePercent: 3,
  paymentFeeFixedCents: 0,
  roundingMode: "UP",
  targetMarginPercent: 25,
};

export function tierForCost(sourceCostCents: number, tiers: PricingTier[]): PricingTier | null {
  const ordered = [...tiers].sort((a, b) => a.minCostCents - b.minCostCents);
  return (
    ordered.find(
      (tier) =>
        sourceCostCents >= tier.minCostCents &&
        (tier.belowCostCents == null || sourceCostCents < tier.belowCostCents),
    ) ?? null
  );
}

export function sellingPriceFromCost(
  sourceCostCents: number | null | undefined,
  settings: PricingSettings,
): number | null {
  if (!settings.isActive) return null;
  if (sourceCostCents == null || !Number.isInteger(sourceCostCents) || sourceCostCents < 0) return null;
  const tier = tierForCost(sourceCostCents, settings.tiers);
  if (!tier) return null;
  const allowance = (settings.handlingAllowanceCents ?? 0) + (settings.packagingAllowanceCents ?? 0);
  const feeRate = (settings.paymentFeePercent ?? 0) / 100;
  const marginRate = (settings.targetMarginPercent ?? 0) / 100;
  if (feeRate < 0 || marginRate < 0 || feeRate + marginRate >= 1) return null;
  const profitTarget = Math.max(Math.ceil(sourceCostCents * tier.markupPercent / 100), settings.minimumProfitCents ?? 0);
  const coveredCost = sourceCostCents + allowance + (settings.paymentFeeFixedCents ?? 0);
  const raw = Math.ceil(Math.max((coveredCost + profitTarget) / (1 - feeRate), coveredCost / (1 - feeRate - marginRate)));
  const step = settings.roundingIncrementCents;
  const floor = Math.max(raw, settings.minPriceCents);
  const rounded = step > 0 ? (settings.roundingMode === "UP" ? Math.ceil(floor / step) : Math.round(floor / step)) * step : floor;
  // Even nearest rounding must not eat the minimum profit target.
  const protectedFloor = Math.max(Math.ceil((coveredCost + (settings.minimumProfitCents ?? 0)) / (1 - feeRate)), Math.ceil(coveredCost / (1 - feeRate - marginRate)), settings.minPriceCents);
  return rounded >= protectedFloor ? rounded : step > 0 ? Math.ceil(protectedFloor / step) * step : protectedFloor;
}

export function pricingBreakdown(cost: number | null, sellingPrice: number | null, settings: PricingSettings) {
  const allowanceCents = (settings.handlingAllowanceCents ?? 0) + (settings.packagingAllowanceCents ?? 0);
  const recommendedCents = sellingPriceFromCost(cost, settings);
  const processingCents = sellingPrice == null ? null : Math.ceil(sellingPrice * (settings.paymentFeePercent ?? 0) / 100) + (settings.paymentFeeFixedCents ?? 0);
  const grossProfitCents = cost == null || sellingPrice == null || processingCents == null ? null : sellingPrice - cost - allowanceCents - processingCents;
  return { allowanceCents, recommendedCents, processingCents, grossProfitCents, marginPercent: sellingPrice && grossProfitCents != null ? grossProfitCents / sellingPrice * 100 : null };
}

export function parsePricingTiers(value: unknown): PricingTier[] {
  if (!Array.isArray(value)) return [];
  const tiers: PricingTier[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const minCostCents = Number(row.minCostCents);
    const markupPercent = Number(row.markupPercent);
    const belowRaw = row.belowCostCents;
    const belowCostCents = belowRaw == null || belowRaw === "" ? null : Number(belowRaw);
    if (!Number.isInteger(minCostCents) || minCostCents < 0) continue;
    if (!Number.isInteger(markupPercent) || markupPercent < 0 || markupPercent > 500) continue;
    if (belowCostCents != null && (!Number.isInteger(belowCostCents) || belowCostCents <= minCostCents)) continue;
    tiers.push({ minCostCents, belowCostCents, markupPercent });
  }
  return tiers.sort((a, b) => a.minCostCents - b.minCostCents);
}
