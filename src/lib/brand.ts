/**
 * Brand configuration.
 *
 * Customer-facing name is 2DE BARGAINS. The preferred public domain is
 * 2debargains.co.za. The running origin stays in NEXT_PUBLIC_BRAND_URL so a
 * local preview does not pretend the domain is already live.
 *
 * Only values prefixed NEXT_PUBLIC_ live here — this module is imported by
 * client components. Real legal/company details live in src/lib/legal.ts.
 */

export const brand = {
  /** Trading name shown in the header, footer, titles and emails. */
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "2DE BARGAINS",

  /** Absolute site origin, used for canonical URLs, OG tags and the sitemap. */
  url: (process.env.NEXT_PUBLIC_BRAND_URL || "http://localhost:3000").replace(/\/$/, ""),

  /** Preferred public domain. Not used as the live origin until the site is deployed there. */
  preferredDomain: "2debargains.co.za",

  /** Used on the homepage hero. */
  tagline: process.env.NEXT_PUBLIC_TAGLINE || "Tested bargains. Better prices.",

  /** Supporting line under the tagline. */
  secondary: "Real second-hand finds. Tested before shipping.",

  /** One-line explanation of what the business actually is. */
  description:
    "2DE BARGAINS is a South African online shop for real second-hand finds. Tools, electronics and appliances, tested before shipping, at better prices.",

  /** Short line for the footer / SEO defaults. */
  shortDescription:
    "Real second-hand finds. Tested before shipping. Better prices across South Africa.",

  currency: process.env.NEXT_PUBLIC_CURRENCY || "ZAR",

  /** South African English. */
  locale: "en-ZA",
} as const;

/** Primary SEO targets. Kept here so the homepage, shop and footer agree. */
export const seoKeywords = [
  "2DE BARGAINS",
  "South African second-hand bargains",
  "tested second-hand products",
  "used tools South Africa",
  "second-hand electronics South Africa",
  "bargain tools",
  "used gaming products",
  "second-hand appliances",
  "bargain deals South Africa",
] as const;

/**
 * Contact details.
 *
 * Every field is empty until the real business sets it in the environment. A
 * placeholder phone number is worse than none: it looks real, it belongs to
 * somebody else, and a customer who rings it will never reach the shop. So the
 * default is silence, and the UI hides a channel entirely when it is unset —
 * see `hasWhatsapp` / `hasPhone` / `hasEmail` and `ContactLinks`.
 */
const rawContact = {
  /** Digits only, country code first, no + and no spaces. */
  whatsapp: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "").replace(/[^\d]/g, ""),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "",
  /**
   * Unconfirmed. Empty by default so the site never states hours nobody has
   * agreed to. Set NEXT_PUBLIC_CONTACT_HOURS to show them.
   */
  hours: process.env.NEXT_PUBLIC_CONTACT_HOURS || "",
} as const;

export const contact = rawContact;

export const hasWhatsapp = (): boolean => rawContact.whatsapp.length > 0;
export const hasPhone = (): boolean => rawContact.phone.trim().length > 0;
export const hasEmail = (): boolean => rawContact.email.includes("@");
/** True when we have at least one real way for a customer to reach us. */
export const hasAnyContact = (): boolean => hasWhatsapp() || hasPhone() || hasEmail();

/** Strip spaces and brackets for a `tel:` href. Empty in, empty out. */
export function telHref(phone: string = rawContact.phone): string {
  return phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "";
}

/**
 * A short, always-truthful sentence naming how to reach us.
 *
 * Legal pages used to interpolate the email address directly, which produced
 * "Contact us at ." the moment the env var was unset. This builds the sentence
 * from whatever is actually configured and falls back to the contact page.
 */
export function contactBlurb(lead = "Contact us"): string {
  const parts: string[] = [];
  if (hasPhone()) parts.push(`call ${rawContact.phone}`);
  if (hasEmail()) parts.push(`email ${rawContact.email}`);
  if (parts.length === 0) return `${lead} through our contact page: /contact`;
  if (parts.length === 1) return `${lead} by ${parts[0]}`;
  return `${lead} by ${parts[0]}, or ${parts[1]}`;
}

/** wa.me deep link with an optional prefilled message. Empty when unconfigured. */
export function whatsappLink(message?: string): string {
  if (!hasWhatsapp()) return "";
  return message
    ? `https://wa.me/${rawContact.whatsapp}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${rawContact.whatsapp}`;
}

export function absoluteUrl(path: string): string {
  return `${brand.url}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Plain-text templates used by the confirmation page and any future email. */
export const copy = {
  /**
   * The core promise, in one sentence. This is the model that makes the store
   * different: nothing is bought until a customer has already paid for it.
   */
  whatWeDo:
    "We list second-hand tools, appliances and electronics that are sitting in second-hand shops, take your payment online, then buy the exact item for you and ship it to your door.",

  notAPawnShop:
    "We are an online second-hand retailer, not a pawn shop. We do not offer loans and we do not take items in exchange for cash.",

  /** Why an item can vanish after a customer paid for it. */
  whyItemsDisappear:
    "Second-hand stock is one-of-a-kind and moves quickly. If an item is no longer at the shop when we come to collect it, we cancel the order and refund you in full.",

  /** What "condition" means on a listing. */
  conditionExplained:
    "Every item is graded and described honestly. Second-hand goods will show normal signs of previous use — that is exactly why they are cheaper.",
} as const;
