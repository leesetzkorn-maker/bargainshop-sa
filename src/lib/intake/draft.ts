/**
 * Turning an intake read into the numbers and text a listing starts with.
 *
 * Pure functions, because this is where a wrong number would quietly become a
 * public price. The rules:
 *
 *   - the engine's recommendation is only ever a suggestion,
 *   - a price Lee typed in always wins and is flagged as a manual override,
 *   - the description is assembled only from fields that were actually
 *     confirmed — nothing here invents a spec, a weight or a feature.
 */

import { sellingPriceFromCost, type PricingSettings } from "@/lib/pricing";

export interface PriceDecision {
  sourceCostCents: number | null;
  recommendedPriceCents: number | null;
  priceCents: number;
  /** True when Lee typed a price instead of taking the recommendation. */
  priceManualOverride: boolean;
}

export interface PriceDecisionInput {
  sourceCostCents: number | null;
  /** What Lee typed. null/0 means "use the recommendation". */
  manualPriceCents?: number | null;
  settings: PricingSettings;
}

/** Source cost in, price out — with a manual price always beating the engine. */
export function decidePrice(input: PriceDecisionInput): PriceDecision {
  const recommendedPriceCents = sellingPriceFromCost(input.sourceCostCents, input.settings);
  const manual = input.manualPriceCents ?? null;

  if (manual != null && manual > 0) {
    return {
      sourceCostCents: input.sourceCostCents,
      recommendedPriceCents,
      priceCents: manual,
      priceManualOverride: true,
    };
  }

  return {
    sourceCostCents: input.sourceCostCents,
    recommendedPriceCents,
    priceCents: recommendedPriceCents ?? 0,
    priceManualOverride: false,
  };
}

export interface DescriptionFields {
  name: string;
  brand?: string;
  model?: string;
  condition: string;
  conditionNote?: string;
  specifications?: string;
  includedItems?: string;
}

/**
 * The opening description for a draft listing.
 *
 * Every line is something that was entered or confirmed, in the order the
 * product form already uses, so an intake draft is indistinguishable from one
 * typed by hand. Empty fields are skipped rather than filled with filler.
 */
export function buildDraftDescription(fields: DescriptionFields): string {
  const identity = [fields.brand, fields.model].filter(Boolean).join(" / ");
  const conditionLine = [
    `Pre-owned condition: ${fields.condition}.`,
    fields.conditionNote?.trim() ?? "",
  ]
    .join(" ")
    .trim();

  return [
    fields.name.trim(),
    identity,
    conditionLine,
    fields.specifications?.trim() ?? "",
    fields.includedItems?.trim() ? `What's included: ${fields.includedItems.trim()}` : "",
    "Pre-owned item — please view the actual photos for condition.",
  ]
    .filter((part) => part && part.length > 0)
    .join("\n\n");
}
