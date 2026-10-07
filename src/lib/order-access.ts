import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/env";

export const ORDER_ACCESS_COOKIE = "sde_order_access";
const TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_ORDERS = 10;

interface Payload {
  orders: string[];
  exp: number;
}

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

function decode(token: string | undefined): Payload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Payload;
    if (!Array.isArray(parsed.orders) || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Date.now()) return null;
    return { orders: parsed.orders.filter((n) => typeof n === "string"), exp: parsed.exp };
  } catch {
    return null;
  }
}

function encode(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function issueOrderAccessToken(orderNumber: string): string {
  return encode({ orders: [orderNumber], exp: Date.now() + TTL_SECONDS * 1000 });
}

export function verifyOrderAccessToken(token: string | undefined, orderNumber: string): boolean {
  const payload = decode(token);
  return payload ? payload.orders.includes(orderNumber) : false;
}

export async function grantOrderAccess(orderNumber: string): Promise<string> {
  const store = await cookies();
  const current = decode(store.get(ORDER_ACCESS_COOKIE)?.value);
  const orders = [orderNumber, ...(current?.orders ?? [])]
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, MAX_ORDERS);

  const token = encode({ orders, exp: Date.now() + TTL_SECONDS * 1000 });

  store.set(ORDER_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });

  return token;
}

export async function canViewOrder(orderNumber: string, token: string | undefined): Promise<boolean> {
  if (verifyOrderAccessToken(token, orderNumber)) return true;
  const store = await cookies();
  const payload = decode(store.get(ORDER_ACCESS_COOKIE)?.value);
  return payload ? payload.orders.includes(orderNumber) : false;
}
