/**
 * Legal and company identity.
 *
 * NONE of this is confirmed yet. The registered company name, registration
 * number, VAT number, physical address and the policy wording are all things
 * the business owner must supply before launch. Guessing them would put wrong
 * legal information in front of customers, so every value is environment
 * driven and `isLegalConfirmed()` lets the pages shout until it is filled in.
 *
 * This module is client-safe: only NEXT_PUBLIC_ values are read here.
 */

export const legal = {
  /** Registered company that sells the goods, if different from the trading name. */
  companyName: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME || "",

  /** CIPC / other registration number. */
  registrationNumber: process.env.NEXT_PUBLIC_LEGAL_REGISTRATION_NUMBER || "",

  /** SARS VAT number. */
  vatNumber: process.env.NEXT_PUBLIC_LEGAL_VAT_NUMBER || "",

  /** Street address of the business, for returns and formal notices. */
  streetAddress: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "",

  city: process.env.NEXT_PUBLIC_LEGAL_CITY || "",
  province: process.env.NEXT_PUBLIC_LEGAL_PROVINCE || "",
  postalCode: process.env.NEXT_PUBLIC_LEGAL_POSTAL_CODE || "",

  /** Named person a customer can contact about a complaint. */
  contactPerson: process.env.NEXT_PUBLIC_LEGAL_CONTACT_PERSON || "",
} as const;

/**
 * False while any legal identifier is missing. Pages show a visible notice so a
 * half-finished policy can never be mistaken for a finished one.
 */
export function isLegalConfirmed(): boolean {
  return Boolean(
    legal.companyName &&
      legal.registrationNumber &&
      legal.streetAddress &&
      legal.city &&
      legal.postalCode,
  );
}

/**
 * An address is only published when *every* line is filled in.
 *
 * This is deliberately all-or-nothing. A previous version joined whatever was
 * present, so setting only `NEXT_PUBLIC_LEGAL_PROVINCE` printed a one-line
 * "Gauteng" as though it were a real street address. A partial address is worse
 * than no address, so nothing is shown until the whole thing is confirmed.
 */
export function hasPublishedAddress(): boolean {
  return Boolean(legal.streetAddress && legal.city && legal.postalCode);
}

export function legalAddressLines(): string[] {
  if (!hasPublishedAddress()) return [];
  return [legal.streetAddress, legal.city, legal.province, legal.postalCode].filter(Boolean);
}

/** Shown in place of an address that has not been published yet. */
export const ADDRESS_NOT_PUBLISHED =
  "Our physical address has not been published on the website yet. Contact us and we will give it to you.";

/** What a customer sees for the seller in policy text. */
export function sellerName(): string {
  return legal.companyName || process.env.NEXT_PUBLIC_BRAND_NAME || "2DE BARGAINS";
}
