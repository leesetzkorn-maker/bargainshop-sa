import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { profitAfterIncludedDelivery, recommendIncludedDeliveryPrice } from "../src/lib/pricing-free-delivery";

describe("delivery-included price maths", () => {
  const costs = {
    purchaseCents: 150000, petrolCents: 10000, packagingCents: 3000,
    courierCents: 10000, targetProfitCents: 50000, paymentFeePercent: 3, paymentFeeFixedCents: 0,
  };
  it("covers every known cost and protects the net profit", () => {
    const price = recommendIncludedDeliveryPrice(costs);
    assert.equal(price, 229900);
    assert.ok((profitAfterIncludedDelivery(price!, costs) ?? 0) >= 50000);
  });
  it("rejects an unknown courier cost", () => {
    assert.equal(recommendIncludedDeliveryPrice({ ...costs, courierCents: Number.NaN }), null);
  });
  it("rejects negative money and unsafe fee rates", () => {
    assert.equal(recommendIncludedDeliveryPrice({ ...costs, petrolCents: -100 }), null);
    assert.equal(recommendIncludedDeliveryPrice({ ...costs, paymentFeePercent: 100 }), null);
  });
});
