/**
 * Market-value safety for a listing.
 *
 * The pricing engine answers "what does this have to sell for to be worth
 * buying". This answers the other question: "is that number plausible for this
 * item". A source cost that cannot be marked up to the required profit must
 * stop the listing, and an unusually high price must get a second look rather
 * than going straight out.
 *
 * Pure: it takes the pricing settings it is given and returns a verdict. No
 * database, no guessing about the item itself.
 */

import { pricingBreakdown, sellingPriceFromCost, type PricingSettings } from "@/lib/pricing";
import { MARKET_CHECK_ABOVE_CENTS, type MarketFlag } from "./constants";

export interface MarketInput {
  /** What the tag says we paid, in cents. Null means we cannot judge yet. */
  sourceCostCents: number | null;
  /** Lee's chosen selling price. Null falls back to the engine's recommendation. */
  sellingPriceCents?: number | null;
  settings: PricingSettings;
  /**
   * The price this kind of item usually goes for, when Lee has researched it.
   * Null means no ceiling is configured.
   */
  marketCeilingCents?: number | null;
  /** Whether comparable listings were actually checked for this item. */
  hasComparableResearch?: boolean;
}

export interface MarketVerdict {
  flag: MarketFlag | null;
  /** Badge label, matching the wording the store asked for. */
  label: string;
  /** Blocking-ish warning shown above the publish button, or null. */
  warning: string | null;
  recommendedPriceCents: number | null;
  priceCents: number | null;
  estimatedProfitCents: number | null;
  marginPercent: number | null;
}

export const MARKET_LABELS: Record<MarketFlag, string> = {
  LOW_MARGIN: "LOW MARGIN",
  GOOD_MARGIN: "GOOD MARGIN",
  HIGH_PRICE_REVIEW: "HIGH PRICE / REVIEW",
  MARKET_CHECK_NEEDED: "MARKET CHECK NEEDED",
};

export const LOW_MARGIN_WARNING = "LOW MARGIN — DO NOT BUY / REVIEW";

/** Compute the verdict. Never throws; incomplete input yields a partial verdict. */
export function classifyMarket(input: MarketInput): MarketVerdict {
  const { sourceCostCents, settings } = input;
  const recommendedPriceCents = sellingPriceFromCost(sourceCostCents, settings);
  const priceCents = input.sellingPriceCents ?? recommendedPriceCents;

  const base: MarketVerdict = {
    flag: null,
    label: sourceCostCents == null ? "SOURCE COST NEEDED" : "AWAITING PRICE",
    warning: null,
    recommendedPriceCents,
    priceCents,
    estimatedProfitCents: null,
    marginPercent: null,
  };

  if (sourceCostCents == null || priceCents == null) return base;

  const breakdown = pricingBreakdown(sourceCostCents, priceCents, settings);
  base.estimatedProfitCents = breakdown.grossProfitCents;
  base.marginPercent = breakdown.marginPercent;

  const minimumProfitCents = settings.minimumProfitCents ?? 0;
  const profit = breakdown.grossProfitCents ?? 0;

  // Cheapest first: a price that cannot even clear the minimum profit is a
  // buy-not-buy decision, more urgent than how high the price looks.
  if (profit < minimumProfitCents) {
    return {
      ...base,
      flag: "LOW_MARGIN",
      label: MARKET_LABELS.LOW_MARGIN,
      warning: LOW_MARGIN_WARNING,
    };
  }

  const ceiling = input.marketCeilingCents ?? null;
  if (ceiling != null && ceiling > 0 && priceCents > ceiling) {
    return {
      ...base,
      flag: "HIGH_PRICE_REVIEW",
      label: MARKET_LABELS.HIGH_PRICE_REVIEW,
      warning: `Asking R${(priceCents / 100).toFixed(2)} is above the usual resale price of R${(ceiling / 100).toFixed(2)} for this kind of item. Check comparable listings before publishing.`,
    };
  }

  if (!input.hasComparableResearch && sourceCostCents >= MARKET_CHECK_ABOVE_CENTS) {
    return {
      ...base,
      flag: "MARKET_CHECK_NEEDED",
      label: MARKET_LABELS.MARKET_CHECK_NEEDED,
      warning: `Source cost of R${(sourceCostCents / 100).toFixed(2)} is high enough that the resale price should be checked against real comparable listings first.`,
    };
  }

  return {
    ...base,
    flag: "GOOD_MARGIN",
    label: MARKET_LABELS.GOOD_MARGIN,
    warning: null,
  };
}
