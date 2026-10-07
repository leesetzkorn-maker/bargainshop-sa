import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PRICING_SETTINGS,
  sellingPriceFromCost,
  tierForCost,
  pricingBreakdown,
} from "../src/lib/pricing";

describe("tiered markup", () => {
  const settings = { ...DEFAULT_PRICING_SETTINGS, handlingAllowanceCents: 0, packagingAllowanceCents: 0, minimumProfitCents: 0, paymentFeePercent: 0, targetMarginPercent: 0, roundingMode: "NEAREST" as const };

  it("picks the band from the acquisition cost", () => {
    assert.equal(tierForCost(19_900, settings.tiers)?.markupPercent, 60);
    assert.equal(tierForCost(20_000, settings.tiers)?.markupPercent, 50);
    assert.equal(tierForCost(49_900, settings.tiers)?.markupPercent, 50);
    assert.equal(tierForCost(99_500, settings.tiers)?.markupPercent, 40);
    assert.equal(tierForCost(150_000, settings.tiers)?.markupPercent, 35);
    assert.equal(tierForCost(289_500, settings.tiers)?.markupPercent, 30);
    assert.equal(tierForCost(325_000, settings.tiers)?.markupPercent, 25);
  });

  it("adds the tier percent and rounds to the nearest R10", () => {
    assert.equal(sellingPriceFromCost(10_000, settings), 16_000);
    assert.equal(sellingPriceFromCost(45_000, settings), 68_000);
    assert.equal(sellingPriceFromCost(99_500, settings), 139_000);
    assert.equal(sellingPriceFromCost(289_500, settings), 376_000);
    assert.equal(sellingPriceFromCost(325_000, settings), 406_000);
  });

  it("does not invent a price when the cost is missing or the rule is off", () => {
    assert.equal(sellingPriceFromCost(null, settings), null);
    assert.equal(sellingPriceFromCost(10_000, { ...settings, isActive: false }), null);
  });
});

describe("allowance-aware recommendations", () => {
  it("protects a useful Rand profit on cheap items after payment fees", () => {
    const price = sellingPriceFromCost(1000, DEFAULT_PRICING_SETTINGS);
    assert.equal(price, 13000);
    const result = pricingBreakdown(1000, price, DEFAULT_PRICING_SETTINGS);
    assert.ok((result.grossProfitCents ?? 0) >= 7500);
    assert.equal(result.allowanceCents, 4000);
  });
  it("shows the actual override margin without silently changing the price", () => {
    const result = pricingBreakdown(10000, 12000, DEFAULT_PRICING_SETTINGS);
    assert.equal(result.grossProfitCents, -2360);
    assert.ok((result.marginPercent ?? 0) < 0);
    assert.ok((result.recommendedCents ?? 0) > 12000);
  });
  it("covers the configured margin target on higher-cost goods", () => {
    const price = sellingPriceFromCost(325000, DEFAULT_PRICING_SETTINGS);
    const result = pricingBreakdown(325000, price, DEFAULT_PRICING_SETTINGS);
    assert.ok((result.marginPercent ?? 0) >= 25);
  });
  it("never subtracts courier charges from the product recommendation", () => {
    assert.equal(sellingPriceFromCost(0, DEFAULT_PRICING_SETTINGS), 12000);
    assert.equal(sellingPriceFromCost(undefined, DEFAULT_PRICING_SETTINGS), null);
  });
});
