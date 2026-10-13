import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKOUT_TEST_ITEM_ID, CHECKOUT_TEST_NAME, CHECKOUT_TEST_PRICE_CENTS,
  CHECKOUT_TEST_SLUG, isExactR20TestParcel, containsR20TestItem,
} from "../src/lib/checkout-test";

describe("R20 real store checkout product", () => {
  const item = { itemId: CHECKOUT_TEST_ITEM_ID, name: CHECKOUT_TEST_NAME, quantity: 1 };
  it("permits only one owner payment test, exactly R20", () => {
    assert.equal(isExactR20TestParcel([item], CHECKOUT_TEST_PRICE_CENTS), true);
    assert.equal(isExactR20TestParcel([item], 2_001), false);
    assert.equal(isExactR20TestParcel([{ ...item, quantity: 2 }], 4_000), false);
    assert.equal(isExactR20TestParcel([{ ...item, itemId: "OTHER" }], 2_000), false);
    assert.equal(isExactR20TestParcel([item, { ...item, itemId: "OTHER" }], 2_000), false);
  });
  it("detects mixed carts by server-trusted catalog slug", () => {
    assert.equal(containsR20TestItem([CHECKOUT_TEST_SLUG, "real-product"]), true);
    assert.equal(containsR20TestItem(["real-product"]), false);
  });
});
