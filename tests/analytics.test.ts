import { test } from "node:test";
import assert from "node:assert/strict";
import { safeAnalyticsPath, analyticsSource, analyticsDevice } from "../src/lib/analytics-shared";

test("tracking allowlist excludes private paths and query strings", () => {
  for (const path of ["/order/2DE-123", "/admin", "/api/payments/yoco/notify", "/checkout?email=private", "https://evil.test", "/product/../../admin"]) assert.equal(safeAnalyticsPath(path), null);
  assert.equal(safeAnalyticsPath("/product/ps4-console"), "/product/ps4-console");
  assert.equal(safeAnalyticsPath("/checkout"), "/checkout");
});
test("sources retain domain only, never URL identifiers", () => {
  assert.equal(analyticsSource("https://facebook.com/path?token=private", "https://bargainshop.co.za"), "facebook.com");
  assert.equal(analyticsSource("https://bargainshop.co.za/cart", "https://bargainshop.co.za"), "internal");
  assert.equal(analyticsSource("invalid", "https://bargainshop.co.za"), "direct");
  assert.equal(analyticsDevice("Mozilla Android"), "mobile");
});
