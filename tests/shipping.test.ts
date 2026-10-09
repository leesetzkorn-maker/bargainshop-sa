import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateShipping,
  orderTotals,
  type ParcelLine,
  type ShippingSettings,
  type ShippingTier,
} from "../src/lib/shipping/engine";

const settings: ShippingSettings = {
  isActive: true,
  doorFuelSurchargePercent: 0,
  etaMinDays: 1,
  etaMaxDays: 3,
};

/** The Courier Guy locker tariff card, incl. VAT. */
const tiers: ShippingTier[] = [
  { id: "xs", code: "XS", name: "Extra small", sortOrder: 10, isActive: true, maxLengthCm: 60, maxWidthCm: 17, maxHeightCm: 8, maxWeightGrams: 2000, lockerToLockerCents: 5900, lockerToDoorCents: 7900, lockerToKioskCents: 6900, kioskToDoorCents: 9300 },
  { id: "s", code: "S", name: "Small", sortOrder: 20, isActive: true, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 8, maxWeightGrams: 5000, lockerToLockerCents: 6900, lockerToDoorCents: 8900, lockerToKioskCents: 7900, kioskToDoorCents: 10500 },
  { id: "m", code: "M", name: "Medium", sortOrder: 30, isActive: true, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 19, maxWeightGrams: 10000, lockerToLockerCents: 7900, lockerToDoorCents: 11900, lockerToKioskCents: 8900, kioskToDoorCents: 13500 },
  { id: "l", code: "L", name: "Large", sortOrder: 40, isActive: true, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 41, maxWeightGrams: 15000, lockerToLockerCents: 10900, lockerToDoorCents: 17600, lockerToKioskCents: 12900, kioskToDoorCents: 21000 },
  { id: "xl", code: "XL", name: "Extra large", sortOrder: 50, isActive: true, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 69, maxWeightGrams: 20000, lockerToLockerCents: 14900, lockerToDoorCents: 23900, lockerToKioskCents: 16900, kioskToDoorCents: 28000 },
];

function line(overrides: Partial<ParcelLine> = {}): ParcelLine {
  return {
    productId: "p1",
    itemId: "2DE-1",
    name: "Helmet",
    quantity: 1,
    productWeightGrams: 2100,
    packageWeightGrams: 500,
    packageLengthCm: 34,
    packageWidthCm: 30,
    packageHeightCm: 28,
    ...overrides,
  };
}

describe("shipping engine", () => {
  it("prices the acceptance example: 34x30x28cm 2.6kg helmet as size L", () => {
    const quote = calculateShipping([line()], settings, tiers, {
      subtotalCents: 79900,
      preferredMethod: "LOCKER_TO_LOCKER",
    });
    assert.equal(quote.error, undefined);
    assert.equal(quote.matchedTierCode, "L");
    assert.equal(quote.method, "LOCKER_TO_LOCKER");
    assert.equal(quote.shippingCents, 10900);
    assert.equal(orderTotals(quote).totalCents, 79900 + 10900);
  });

  it("allows rotation into the smallest fitting box", () => {
    const quote = calculateShipping([line({ packageLengthCm: 41, packageWidthCm: 60, packageHeightCm: 8 })], settings, tiers, {
      subtotalCents: 1000,
    });
    assert.equal(quote.matchedTierCode, "S");
  });

  it("prices each service from the matched tier", () => {
    const base = calculateShipping([line()], { ...settings, doorFuelSurchargePercent: 12 }, tiers, { subtotalCents: 1000, preferredMethod: "LOCKER_TO_DOOR" });
    assert.equal(base.matchedTierCode, "L");
    assert.equal(base.shippingCents, 19712); // 17600 + 12%
    const kiosk = calculateShipping([line()], { ...settings, doorFuelSurchargePercent: 12 }, tiers, { subtotalCents: 1000, preferredMethod: "LOCKER_TO_KIOSK" });
    assert.equal(kiosk.shippingCents, 12900);
  });

  it("treats the whole cart as one parcel", () => {
    const quote = calculateShipping([line({ productWeightGrams: 1600, packageWeightGrams: 400, packageLengthCm: 30, packageWidthCm: 15, packageHeightCm: 10 }), line({ productId: "p2", itemId: "2DE-2", productWeightGrams: 1600, packageWeightGrams: 400, packageLengthCm: 30, packageWidthCm: 15, packageHeightCm: 10 })], settings, tiers, { subtotalCents: 1000 });
    assert.equal(quote.parcel.weightGrams, 4000);
    assert.equal(quote.parcel.lengthCm, 60);
    assert.equal(quote.parcel.widthCm, 30);
    assert.equal(quote.parcel.heightCm, 20);
    assert.equal(quote.matchedTierCode, "L");
  });

  it("keeps to-door delivery closed until the fuel surcharge is confirmed", () => {
    const quote = calculateShipping([line()], settings, tiers, { subtotalCents: 1000 });
    const door = quote.methods.find((m) => m.method === "LOCKER_TO_DOOR");
    assert.equal(door?.available, false);
    assert.match(door?.unavailableReason ?? "", /fuel surcharge/i);
    // A stale selection falls back to an available collection method.
    const fallback = calculateShipping([line()], settings, tiers, { subtotalCents: 1000, preferredMethod: "LOCKER_TO_DOOR" });
    assert.equal(fallback.method, "LOCKER_TO_LOCKER");
    assert.equal(fallback.shippingCents, 10900);
  });

  it("refuses the entire parcel when one line has missing dimensions", () => {
    const quote = calculateShipping([line(), line({ packageLengthCm: 0 })], settings, tiers);
    assert.match(quote.error ?? "", /missing valid/);
    assert.equal(quote.methods.length, 0);
  });

  it("refuses a parcel heavier than the largest tier", () => {
    const quote = calculateShipping([line({ productWeightGrams: 25000, packageWeightGrams: 0 })], settings, tiers);
    assert.match(quote.error ?? "", /larger than our biggest locker/i);
  });

  it("refuses a parcel bigger than the largest tier", () => {
    const quote = calculateShipping([line({ packageLengthCm: 130, packageWidthCm: 60, packageHeightCm: 60 })], settings, tiers);
    assert.match(quote.error ?? "", /larger than our biggest locker/i);
  });

  it("skips a size whose weight ceiling the parcel exceeds", () => {
    const quote = calculateShipping([line({ productWeightGrams: 9000, packageWeightGrams: 0, packageLengthCm: 30, packageWidthCm: 15, packageHeightCm: 10 })], settings, tiers);
    assert.equal(quote.matchedTierCode, "M");
  });

  it("respects item-specific collection exclusions", () => {
    const quote = calculateShipping([line({ lockerAllowed: false })], { ...settings, doorFuelSurchargePercent: 10 }, tiers, { subtotalCents: 20000, preferredMethod: "LOCKER_TO_LOCKER" });
    const collection = quote.methods.find((m) => m.method === "LOCKER_TO_LOCKER");
    assert.equal(collection?.available, false);
    assert.equal(quote.method, "LOCKER_TO_DOOR");
  });

  it("does not quote when shipping is switched off", () => {
    const quote = calculateShipping([line()], { ...settings, isActive: false }, tiers);
    assert.match(quote.error ?? "", /unavailable/i);
  });

  it("does not invent a price when no size is configured", () => {
    const quote = calculateShipping([line()], settings, []);
    assert.ok(quote.error);
    assert.equal(quote.methods.some((m) => m.available), false);
  });

  it("does not invent a price for an unpriced size", () => {
    const unpriced: ShippingTier[] = [{ ...tiers[3], lockerToLockerCents: 0, lockerToDoorCents: 0, lockerToKioskCents: 0, kioskToDoorCents: 0 }];
    const quote = calculateShipping([line()], settings, unpriced);
    const locker = quote.methods.find((m) => m.method === "LOCKER_TO_LOCKER");
    assert.equal(locker?.available, false);
    assert.ok(quote.error);
  });
});
