import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Yoco Checkout API — the parts that must be provable.
 *
 * Two separate concerns live here because both are pure functions of their
 * arguments, and both are the kind of code that fails silently in production if
 * nobody pins it down:
 *
 *   1. Credentials. Yoco has no "is this key live?" endpoint, so the only way to
 *      know whether the store is holding a test key or a live key is to read the
 *      key itself. Deriving the mode from the `sk_live_` prefix rather than from
 *      a separate YOCO_MODE switch removes the one misconfiguration that could
 *      charge a real card during a test: there is no way to point a live key at
 *      "test mode" if the mode *is* the key.
 *
 *   2. Webhook signatures. The Yoco webhook secret is handed over exactly once,
 *      when the webhook is registered, and is never shown again. Verification
 *      follows the Standard Webhooks scheme: sign
 *      `${webhook-id}.${webhook-timestamp}.${rawBody}` with HMAC-SHA256 over the
 *      base64-decoded key that follows `whsec_`.
 *
 * Deliberately free of `server-only` and of `@/lib/env`, so tests/yoco.test.ts
 * can exercise every branch without a React server context. `yoco.ts` is the
 * thin server-side wrapper that reads the environment.
 */

export interface YocoCredentials {
  secretKey: string;
  webhookSecret: string;
  mode: "live" | "test";
}

/**
 * Accepts a Checkout API secret key and a webhook secret, or returns null when
 * either is missing.
 *
 * The webhook secret is required, not optional: without it every delivery would
 * fail verification, and a store that silently marks nothing as paid is worse
 * than a store that refuses to open checkout until the webhook is registered.
 */
export function yocoCredentialsFrom(
  secretKey?: string | null,
  webhookSecret?: string | null,
): YocoCredentials | null {
  const key = secretKey?.trim();
  const hook = webhookSecret?.trim();
  if (!key || !hook) return null;
  return {
    secretKey: key,
    webhookSecret: hook,
    mode: key.startsWith("sk_live_") ? "live" : "test",
  };
}

/** The exact bytes that get signed. Order and separators are part of the spec. */
export function yocoSignedContent(webhookId: string, timestamp: string, rawBody: string): string {
  return `${webhookId}.${timestamp}.${rawBody}`;
}

/**
 * HMAC-SHA256 of the signed content, base64 encoded — or null when the secret
 * cannot be decoded, which is treated as "not configured" rather than as a
 * signature that happens to be wrong.
 */
export function yocoExpectedSignature(secret: string, signedContent: string): string | null {
  const separator = secret.indexOf("_");
  const encoded = separator >= 0 ? secret.slice(separator + 1) : secret;
  const key = Buffer.from(encoded, "base64");
  if (key.length === 0) return null;
  return createHmac("sha256", key).update(signedContent, "utf8").digest("base64");
}

/** Length-safe constant-time comparison. Buffer.from never throws on text. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * True when any signature in the `webhook-signature` header matches.
 *
 * The header holds space-separated `v1,<base64>` entries so a signing key can be
 * rotated without dropping deliveries mid-flight; the version prefix is stripped
 * before comparing, and the comparison is constant time.
 */
export function yocoSignaturesMatch(expected: string, header: string | null | undefined): boolean {
  if (!expected || !header) return false;
  for (const entry of header.split(/\s+/)) {
    if (!entry) continue;
    const comma = entry.indexOf(",");
    const value = comma >= 0 ? entry.slice(comma + 1) : entry;
    if (value && constantTimeEquals(expected, value)) return true;
  }
  return false;
}

/** Yoco recommends rejecting deliveries signed more than 3 minutes ago. */
export const YOCO_WEBHOOK_TOLERANCE_SECONDS = 180;

/**
 * Replay protection. The timestamp is inside the signed content, so an attacker
 * cannot move it without invalidating the signature; comparing it against the
 * clock is what stops an old, correctly signed delivery from being replayed.
 */
export function yocoTimestampIsFresh(
  header: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = YOCO_WEBHOOK_TOLERANCE_SECONDS,
): boolean {
  if (!header || !header.trim()) return false;
  const timestamp = Number(header);
  if (!Number.isInteger(timestamp)) return false;
  return Math.abs(nowSeconds - timestamp) <= toleranceSeconds;
}
