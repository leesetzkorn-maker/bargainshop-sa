/**
 * Owner-requested real storefront checkout smoke test.
 * This is a real R20 Yoco charge and a normal Order + Payment, not a fake order.
 * No physical product exists or needs to be shipped. Keep it off the public
 * catalogue, but let the owner reach its ordinary product page by direct link.
 */
export const CHECKOUT_TEST_ITEM_ID = "2DS-R20-CHECKOUT";
export const CHECKOUT_TEST_SKU = "CHECKOUT-TEST-R20";
export const CHECKOUT_TEST_SLUG = "r20-checkout-test";
export const CHECKOUT_TEST_NAME = "R20 Checkout Payment Test (No Item Shipped)";
export const CHECKOUT_TEST_PRICE_CENTS = 2_000;
export const CHECKOUT_TEST_IMAGE_URL = "/uploads/products/r20-checkout-test.png";

/** Never subsidise delivery for normal goods or multiple units / mixed carts. */
export function isExactR20TestParcel(
  lines: ReadonlyArray<{ itemId: string; name: string; quantity: number }>,
  subtotalCents: number,
): boolean {
  return lines.length === 1
    && lines[0].itemId === CHECKOUT_TEST_ITEM_ID
    && lines[0].name === CHECKOUT_TEST_NAME
    && lines[0].quantity === 1
    && subtotalCents === CHECKOUT_TEST_PRICE_CENTS;
}

export function containsR20TestItem(slugs: ReadonlyArray<string>): boolean {
  return slugs.includes(CHECKOUT_TEST_SLUG);
}
