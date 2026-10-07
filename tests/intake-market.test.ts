import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRICING_SETTINGS, sellingPriceFromCost, type PricingSettings } from "../src/lib/pricing";
import { classifyMarket, LOW_MARGIN_WARNING } from "../src/lib/intake/market";

/**
 * The market-value safety net, exercised with real house settings.
 *
 * Two things must hold or the store loses money quietly: an item whose resale
 * price cannot clear the required profit has to be flagged DO NOT BUY, and a
 * price that has not been checked against comparable listings must not sail
 * through just because the markup maths worked.
 */

const settings: PricingSettings = DEFAULT_PRICING_SETTINGS;

describe("pricing calculation", () => {
  it("recommends a selling price that covers cost, allowances, fees and profit", () => {
    const recommended = sellingPriceFromCost(49500, settings);
    assert.ok(recommended != null && recommended > 49500);

    const allowance = (settings.handlingAllowanceCents ?? 0) + (settings.packagingAllowanceCents ?? 0);
    const fee = Math.ceil((recommended as number) * (settings.paymentFeePercent ?? 0) / 100);
    const profit = (recommended as number) - 49500 - allowance - fee;
    assert.ok(profit >= (settings.minimumProfitCents ?? 0));
  });

  it("returns null when there is no cost to price from", () => {
    assert.equal(sellingPriceFromCost(null, settings), null);
  });
});

describe("classifyMarket", () => {
  it("returns GOOD MARGIN for a normal house-priced item", () => {
    const verdict = classifyMarket({ sourceCostCents: 49500, settings });
    assert.equal(verdict.flag, "GOOD_MARGIN");
    assert.equal(verdict.label, "GOOD MARGIN");
    assert.equal(verdict.warning, null);
    assert.ok(verdict.recommendedPriceCents != null && verdict.recommendedPriceCents > 49500);
  });

  it("flags LOW MARGIN — DO NOT BUY / REVIEW when the resale value cannot carry the profit", () => {
    // The Xbox-game case: R95 paid, only R100 achievable.
    const verdict = classifyMarket({
      sourceCostCents: 9500,
      sellingPriceCents: 10000,
      settings,
    });
    assert.equal(verdict.flag, "LOW_MARGIN");
    assert.equal(verdict.label, "LOW MARGIN");
    assert.equal(verdict.warning, LOW_MARGIN_WARNING);
    assert.ok((verdict.estimatedProfitCents ?? 0) < (settings.minimumProfitCents ?? 0));
  });

  it("flags HIGH PRICE / REVIEW above the researched ceiling", () => {
    const verdict = classifyMarket({
      sourceCostCents: 49500,
      marketCeilingCents: 60000,
      settings,
    });
    assert.equal(verdict.flag, "HIGH_PRICE_REVIEW");
    assert.equal(verdict.label, "HIGH PRICE / REVIEW");
    assert.match(verdict.warning ?? "", /above the usual resale price/i);
  });

  it("flags MARKET CHECK NEEDED for an expensive un-researched buy", () => {
    const verdict = classifyMarket({ sourceCostCents: 80000, settings });
    assert.equal(verdict.flag, "MARKET_CHECK_NEEDED");
    assert.equal(verdict.label, "MARKET CHECK NEEDED");
  });

  it("does not demand a market check once the comparables were checked", () => {
    const verdict = classifyMarket({
      sourceCostCents: 80000,
      hasComparableResearch: true,
      settings,
    });
    assert.equal(verdict.flag, "GOOD_MARGIN");
  });

  it("cannot judge anything without a source cost", () => {
    const verdict = classifyMarket({ sourceCostCents: null, settings });
    assert.equal(verdict.flag, null);
    assert.equal(verdict.recommendedPriceCents, null);
  });

  it("reports the profit and margin of Lee's own price", () => {
    const verdict = classifyMarket({
      sourceCostCents: 49500,
      sellingPriceCents: 129900,
      settings,
      hasComparableResearch: true,
    });
    assert.equal(verdict.priceCents, 129900);
    assert.ok((verdict.estimatedProfitCents ?? 0) > 0);
    assert.ok((verdict.marginPercent ?? 0) > 0);
  });
});
