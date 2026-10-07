import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateShipping,
  orderTotals,
  type ParcelLine,
  type ShippingRule,
  type ShippingSettings,
} from "../src/lib/shipping/engine";

const settings: ShippingSettings = {
  isActive: true,
  lockerEnabled: true,
  lockerMaxWeightGrams: 2000,
  lockerMaxLengthCm: 35,
  lockerMaxWidthCm: 30,
  lockerMaxHeightCm: 20,
  lockerMaxSumCm: 80,
  courierEnabled: true,
  deliverySurchargeCents: 0,
  freeShippingAboveCents: 0,
  handlingFeeCents: 0,
  lockerEtaMinDays: 1,
  lockerEtaMaxDays: 3,
  courierEtaMinDays: 2,
  courierEtaMaxDays: 5,
};

const rules: ShippingRule[] = [
  {
    id: "locker",
    name: "Locker",
    method: "LOCKER",
    minWeightGrams: 0,
    maxWeightGrams: 2000,
    priceCents: 5900,
    sortOrder: 0,
    isActive: true,
  },
  {
    id: "courier",
    name: "Courier",
    method: "COURIER",
    minWeightGrams: 0,
    maxWeightGrams: 0,
    priceCents: 9900,
    sortOrder: 0,
    isActive: true,
  },
];

function line(overrides: Partial<ParcelLine> = {}): ParcelLine {
  return {
    productId: "p1",
    itemId: "2DE-1",
    name: "Drill",
    quantity: 1,
    productWeightGrams: 800,
    packageWeightGrams: 200,
    packageLengthCm: 30,
    packageWidthCm: 15,
    packageHeightCm: 10,
    ...overrides,
  };
}

describe("shipping engine", () => {
  it("selects destination-specific tariffs and refuses uncovered destinations", () => {
    const zones: ShippingRule[] = [{ ...rules[1], provinceCodes: ["GP"], postalCodePrefixes: ["20"], priceCents: 9900 }, { ...rules[1], id: "cape", provinceCodes: ["WC"], priceCents: 14900 }];
    const options = { subtotalCents: 10000, preferredMethod: "COURIER" as const };
    assert.equal(calculateShipping([line()], { ...settings, lockerEnabled: false }, zones, { ...options, destination: { province: "GP", postalCode: "2000" } }).shippingCents, 9900);
    assert.equal(calculateShipping([line()], { ...settings, lockerEnabled: false }, zones, { ...options, destination: { province: "WC", postalCode: "8000" } }).shippingCents, 14900);
    assert.ok(calculateShipping([line()], { ...settings, lockerEnabled: false }, zones, { ...options, destination: { province: "GP", postalCode: "2196" } }).error);
  });
  it("uses the configured service volumetric factor", () => {
    const quote = calculateShipping([line({ packageLengthCm: 60, packageWidthCm: 40, packageHeightCm: 30 })], { ...settings, volumetricDivisor: 4000 }, rules);
    assert.equal(quote.parcel.volumetricWeightGrams, 18000);
  });
  it("refuses the entire parcel when one line has missing dimensions", () => {
    const quote = calculateShipping([line(), line({ packageLengthCm: 0 })], settings, rules);
    assert.match(quote.error ?? "", /missing valid/);
    assert.equal(quote.methods.length, 0);
  });
  it("respects item-specific delivery exclusions", () => {
    const quote = calculateShipping([line({ lockerAllowed: false })], settings, rules, { subtotalCents: 20000 });
    assert.equal(quote.lockerEligible, false);
    assert.equal(quote.method, "COURIER");
    const none = calculateShipping([line({ lockerAllowed: false, courierAllowed: false })], settings, rules);
    assert.ok(none.error);
  });
  it("charges volumetric weight using the saved tariff rather than a flat courier constant", () => {
    const brackets = [
      { ...rules[1], id: "small", maxWeightGrams: 5000, priceCents: 12000 },
      { ...rules[1], id: "large", minWeightGrams: 5001, priceCents: 35000 },
    ];
    const quote = calculateShipping([line({ packageLengthCm: 60, packageWidthCm: 40, packageHeightCm: 30 })], settings, brackets);
    assert.equal(quote.parcel.volumetricWeightGrams, 14400);
    assert.equal(quote.shippingCents, 35000);
    assert.equal(orderTotals(quote).totalCents, 35000);
  });
  it("uses courier delivery when lockers are disabled, even for a small parcel", () => {
    const quote = calculateShipping([line()], {
      ...settings,
      lockerEnabled: false,
      courierEtaMinDays: 3,
      courierEtaMaxDays: 3,
    }, rules, { subtotalCents: 20000, preferredMethod: "LOCKER" });
    assert.equal(quote.method, "COURIER");
    assert.equal(quote.methods.find(method => method.method === "LOCKER")?.available, false);
    assert.equal(quote.methods.find(method => method.method === "COURIER")?.etaMinDays, 3);
  });
  it("offers locker delivery only when the parcel fits every limit", () => {
    const quote = calculateShipping([line()], settings, rules, {
      subtotalCents: 20000,
      preferredMethod: "LOCKER",
    });

    assert.equal(quote.lockerEligible, true);
    assert.equal(quote.method, "LOCKER");
    assert.equal(quote.shippingCents, 5900);
    assert.equal(quote.error, undefined);
  });

  it("refuses a locker for a heavy parcel and falls back to courier", () => {
    const quote = calculateShipping(
      [line({ productWeightGrams: 4000, packageWeightGrams: 0 })],
      settings,
      rules,
      { subtotalCents: 20000, preferredMethod: "LOCKER" },
    );

    assert.equal(quote.lockerEligible, false);
    assert.ok(quote.lockerBlockers.length > 0);
    assert.equal(quote.method, "COURIER");
    assert.equal(quote.shippingCents, 9900);
  });

  it("uses editable courier tariffs plus configured fees", () => {
    const quote = calculateShipping(
      [line(), line({ productId: "p2", itemId: "2DE-2" })],
      { ...settings, lockerEnabled: false, deliverySurchargeCents: 500, handlingFeeCents: 1500 },
      rules,
      { subtotalCents: 20000, preferredMethod: "COURIER" },
    );

    assert.equal(quote.baseShippingCents, 9900);
    assert.equal(quote.deliverySurchargeCents, 500);
    assert.equal(quote.handlingFeeCents, 1500);
    assert.equal(quote.shippingCents, 11900);
  });

  it("keeps the handling fee when free shipping waives delivery", () => {
    const quote = calculateShipping([line()], { ...settings, freeShippingAboveCents: 50000, handlingFeeCents: 1500, deliverySurchargeCents: 500 }, rules, {
      subtotalCents: 60000,
      preferredMethod: "LOCKER",
    });

    assert.equal(quote.freeShippingApplied, true);
    assert.equal(quote.shippingCents, 1500);
    assert.equal(orderTotals(quote).totalCents, 61500);
  });

  it("does not quote when shipping is switched off", () => {
    const quote = calculateShipping([line()], { ...settings, isActive: false }, rules, {
      subtotalCents: 1000,
    });
    assert.match(quote.error ?? "", /unavailable/i);
  });

  it("does not invent a price when no bracket matches", () => {
    const quote = calculateShipping([line()], settings, [], { subtotalCents: 1000 });
    assert.ok(quote.error);
    assert.equal(quote.methods.some((method) => method.available), false);
  });
});
