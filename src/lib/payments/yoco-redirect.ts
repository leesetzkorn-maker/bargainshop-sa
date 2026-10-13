/**
 * Yoco's Checkout API returns the hosted URL as redirectUrl.
 * Never assume a single subdomain: Yoco may use pay.yoco.com,
 * checkout.yoco.com, or another Yoco-owned subdomain.
 * Reject non-Yoco hosts, credentials, alternate ports and non-HTTPS schemes.
 */
export function isTrustedYocoCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      host.endsWith(".yoco.com");
  } catch {
    return false;
  }
}
