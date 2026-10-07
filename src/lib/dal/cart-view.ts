import "server-only";

import { readCart } from "@/lib/cart";
import { getProductBySlug, resolveCartProducts, type CatalogProduct } from "@/lib/dal/catalog";
import { quoteShipping, toParcelLines } from "@/lib/dal/shipping";
import type { ShippingQuote } from "@/lib/shipping/engine";
import type { ShippingMethod } from "@/lib/enums";

export interface CartViewLine {
  product: CatalogProduct;
  quantity: number;
  lineTotalCents: number;
}

export interface CartView {
  lines: CartViewLine[];
  itemCount: number;
  subtotalCents: number;
  quote: ShippingQuote | null;
  /** Items that were silently dropped when the cart was resolved. */
  removed: Array<{ name: string; reason: string }>;
}

/**
 * The cart as the storefront sees it.
 *
 * Resolved against live stock and current prices on every call — the cookie
 * never dictates what is charged. Anything that sold out or was archived while
 * sitting in the cart is reported in `removed` so the UI can say so plainly
 * instead of silently shrinking the order.
 */
export async function getCartView(preferredMethod?: ShippingMethod, destination?: { province?: string; postalCode?: string }): Promise<CartView> {
  const entries = await readCart();

  if (entries.length === 0) {
    return {
      lines: [],
      itemCount: 0,
      subtotalCents: 0,
      quote: null,
      removed: [],
    };
  }

  const resolved = await resolveCartProducts(entries);

  const lines: CartViewLine[] = resolved.map(({ product, quantity }) => ({
    product,
    quantity,
    lineTotalCents: product.priceCents * quantity,
  }));

  // Work out what dropped out and why.
  const kept = new Map(resolved.map((r) => [r.product.slug, r]));
  const removed: Array<{ name: string; reason: string }> = [];

  for (const entry of entries) {
    if (kept.has(entry.slug)) continue;
    const product = await getProductBySlug(entry.slug);
    if (!product) {
      removed.push({ name: "An item", reason: "no longer available" });
      continue;
    }
    if (product.stockQty <= 0) {
      removed.push({ name: product.name, reason: "sold out" });
    } else {
      removed.push({ name: product.name, reason: "no longer available" });
    }
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

  const quote =
    lines.length > 0
      ? await quoteShipping(toParcelLines(lines), subtotalCents, preferredMethod, destination)
      : null;

  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents,
    quote,
    removed,
  };
}
