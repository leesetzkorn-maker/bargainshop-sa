/**
 * PayFast security signature.
 *
 * PayFast salts an MD5 digest of the transaction fields with a merchant
 * passphrase. The digest has to be byte-identical to theirs or every
 * notification is rejected, so the encoder is written out rather than borrowed:
 * PHP's `urlencode()` leaves only `A-Z a-z 0-9 - _ .` untouched and turns a
 * space into `+`, which is *not* what `encodeURIComponent` does. Getting that
 * difference wrong is the single most common cause of a signature mismatch, and
 * an apostrophe in a customer's name ("Pieter's drill") is enough to hit it.
 *
 * The construction, per PayFast's own documentation:
 *   1. take the transaction fields, excluding `signature` itself
 *   2. sort them alphabetically by key
 *   3. skip empty values
 *   4. join as `key=urlencode(trim(value))` with `&`
 *   5. append `&passphrase=urlencode(trim(passphrase))` when a passphrase is set
 *   6. MD5 the result, lowercase
 *
 * No secret lives in this file. It is pure so it can be tested without a
 * PayFast account.
 */

import { createHash } from "node:crypto";

/**
 * Byte-for-byte equivalent of PHP's `urlencode()`.
 *
 * `encodeURIComponent` is close but wrong for this purpose: it also leaves
 * `! ~ * ' ( )` unescaped, and it renders a space as `%20` rather than `+`.
 */
export function payfastEncode(value: string): string {
  let out = "";
  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-_.]/.test(char)) {
      out += char;
    } else if (char === " ") {
      out += "+";
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/** The canonical parameter string PayFast MD5s. Exported for tests. */
export function payfastParameterString(
  fields: Record<string, string | undefined | null>,
  passphrase?: string,
): string {
  const parts: string[] = [];

  for (const key of Object.keys(fields).sort()) {
    if (key === "signature") continue;
    const raw = fields[key];
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (value === "") continue;
    parts.push(`${key}=${payfastEncode(value)}`);
  }

  if (passphrase && passphrase.trim() !== "") {
    parts.push(`passphrase=${payfastEncode(passphrase.trim())}`);
  }

  return parts.join("&");
}

export function payfastSignature(
  fields: Record<string, string | undefined | null>,
  passphrase?: string,
): string {
  return createHash("md5").update(payfastParameterString(fields, passphrase)).digest("hex");
}

/** Cents to the fixed 2-decimal string PayFast expects. Never use floats. */
export function payfastAmount(amountCents: number): string {
  return (Math.round(amountCents) / 100).toFixed(2);
}

/**
 * Constant-time comparison, so a mismatched signature cannot be narrowed down
 * by timing the response.
 */
export function payfastSignaturesMatch(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return createHash("sha256").update(a).digest("hex") === createHash("sha256").update(b).digest("hex");
}

/** The hosts PayFast posts ITNs from, for the referer check. */
export const PAYFAST_HOSTS = ["www.payfast.co.za", "sandbox.payfast.co.za"] as const;

export function payfastHost(sandbox: boolean): string {
  return sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za";
}

/**
 * The four values that make the module live. All four or none: a merchant id
 * without a passphrase produces signatures PayFast silently rejects, which is
 * worse than falling back to manual payment.
 */
export interface PayFastCredentials {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  /** True when the sandbox credentials were found and are being used. */
  sandbox: boolean;
}
