import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cartSecret } from "@/lib/env";
import { cartLineSchema } from "@/lib/validation";

export const CART_COOKIE = "sde_cart";
const MAX_LINES = 25;
const MAX_QTY_PER_LINE = 10;

function sign(payload: string): string {
  return createHmac("sha256", cartSecret()).update(payload).digest("base64url");
}

/**
 * The cart lives in a signed cookie rather than the database.
 *
 * It stores only `{slug, quantity}` — never prices, never stock, never anything
 * private. Every read re-queries the catalogue, so a tampered or stale cookie
 * can never dictate what a customer is charged, and the cookie cannot go stale
 * with respect to pricing.
 */
export interface CartEntry {
  slug: string;
  quantity: number;
}

function encode(entries: CartEntry[]): string {
  const payload = Buffer.from(JSON.stringify(entries)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(raw: string): CartEntry[] {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return [];
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return [];

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = cartLineSchema.safeParse(item);
      return result.success
        ? [{ slug: result.data.slug, quantity: Math.min(MAX_QTY_PER_LINE, result.data.quantity) }]
        : [];
    });
  } catch {
    return [];
  }
}

/** Reads the cart. Always verified — an unsigned or edited cookie yields []. */
export async function readCart(): Promise<CartEntry[]> {
  const store = await cookies();
  const raw = store.get(CART_COOKIE)?.value;
  if (!raw) return [];
  return decode(raw).slice(0, MAX_LINES);
}

/** Writes the cart. Server Actions / Route Handlers only. */
export async function writeCart(entries: CartEntry[]): Promise<void> {
  const store = await cookies();
  const cleaned = entries
    .filter((e) => e.quantity > 0)
    .slice(0, MAX_LINES)
    .map((e) => ({ slug: e.slug, quantity: Math.min(MAX_QTY_PER_LINE, e.quantity) }));

  if (cleaned.length === 0) {
    store.delete(CART_COOKIE);
    return;
  }

  store.set(CART_COOKIE, encode(cleaned), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function addToCartCookie(slug: string, quantity: number): Promise<CartEntry[]> {
  const current = await readCart();
  const existing = current.find((e) => e.slug === slug);
  const next = existing
    ? current.map((e) =>
        e.slug === slug
          ? { ...e, quantity: Math.min(MAX_QTY_PER_LINE, e.quantity + quantity) }
          : e,
      )
    : [...current, { slug, quantity: Math.min(MAX_QTY_PER_LINE, quantity) }];
  await writeCart(next);
  return next;
}

export async function setCartLine(slug: string, quantity: number): Promise<CartEntry[]> {
  const current = await readCart();
  const next =
    quantity <= 0
      ? current.filter((e) => e.slug !== slug)
      : current.map((e) => (e.slug === slug ? { ...e, quantity: Math.min(MAX_QTY_PER_LINE, quantity) } : e));
  await writeCart(next);
  return next;
}

export async function clearCart(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}
