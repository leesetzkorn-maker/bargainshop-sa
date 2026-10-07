import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRICING_SETTINGS } from "../src/lib/pricing";
import { buildDraftDescription, decidePrice } from "../src/lib/intake/draft";

/**
 * Lee's manual override has to beat the engine, every time — the helmets at
 * R799 are exactly this case — and a draft description may only contain what
 * was actually entered.
 */

describe("decidePrice", () => {
  it("uses the engine recommendation when no price was typed", () => {
    const decision = decidePrice({ sourceCostCents: 49500, settings: DEFAULT_PRICING_SETTINGS });
    assert.equal(decision.priceManualOverride, false);
    assert.equal(decision.priceCents, decision.recommendedPriceCents);
    assert.ok(decision.priceCents > 0);
  });

  it("lets the admin override the recommended price", () => {
    const decision = decidePrice({
      sourceCostCents: 49500,
      manualPriceCents: 79900,
      settings: DEFAULT_PRICING_SETTINGS,
    });
    assert.equal(decision.priceManualOverride, true);
    assert.equal(decision.priceCents, 79900);
    // The recommendation is still reported so the override is visible.
    assert.notEqual(decision.recommendedPriceCents, 79900);
  });

  it("still reports the recommendation for reference when there is no cost", () => {
    const decision = decidePrice({ sourceCostCents: null, settings: DEFAULT_PRICING_SETTINGS });
    assert.equal(decision.recommendedPriceCents, null);
    assert.equal(decision.priceCents, 0);
    assert.equal(decision.priceManualOverride, false);
  });
});

describe("buildDraftDescription", () => {
  it("composes only what was confirmed", () => {
    const description = buildDraftDescription({
      name: "Bosch GSB 13 RE",
      brand: "Bosch",
      model: "GSB 13 RE",
      condition: "GOOD",
      conditionNote: "Light scuffing on the casing.",
      specifications: "720W, 13mm chuck.",
    });
    assert.match(description, /Bosch GSB 13 RE/);
    assert.match(description, /Pre-owned condition: GOOD/);
    assert.match(description, /Light scuffing on the casing/);
    assert.match(description, /720W, 13mm chuck/);
  });

  it("never invents included items or specifications", () => {
    const description = buildDraftDescription({ name: "Yohe helmet", condition: "USED" });
    assert.doesNotMatch(description, /What's included/);
    assert.doesNotMatch(description, /Specifications/);
    assert.match(description, /Yohe helmet/);
  });

  it("skips empty identity rather than printing blanks", () => {
    const description = buildDraftDescription({ name: "Kettle", condition: "USED" });
    assert.doesNotMatch(description, / \/ /);
  });
});
