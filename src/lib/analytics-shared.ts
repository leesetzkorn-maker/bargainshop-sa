export function safeAnalyticsPath(path: unknown): string | null {
  if (typeof path !== "string" || path.length > 180) return null;
  if (/^\/(?:product|category)\/[a-z0-9-]+$/.test(path)) return path;
  return ["/", "/shop", "/categories", "/cart", "/checkout", "/about", "/contact", "/shipping", "/returns", "/terms", "/privacy", "/how-it-works"].includes(path) ? path : null;
}
export function analyticsSource(referrer: unknown, origin: string): string {
  if (typeof referrer !== "string" || !referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (!["http:", "https:"].includes(url.protocol)) return "direct";
    if (url.origin === origin) return "internal";
    return url.hostname.toLowerCase().slice(0, 100);
  } catch { return "direct"; }
}
export function analyticsDevice(ua: string): string {
  return /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop";
}
