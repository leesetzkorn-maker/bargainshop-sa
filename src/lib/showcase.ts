/**
 * Homepage merchandising fallback.
 *
 * These entries are the *fallback* artwork used when the live catalogue cannot
 * supply real product photographs. They are deliberately declarative: each entry
 * names a category slug and its href is derived from it, so a link can never
 * drift away from the category it claims to point at. The homepage then drops
 * any entry whose slug is not a live category, which is what makes it safe to
 * rename or retire a category.
 *
 * Photographs are original studio shots of unbranded products — examples of the
 * kinds of bargains 2DE-STORE sells, not official brand assets.
 */

export interface Spotlight {
  id: string;
  label: string;
  href: string;
  image: string;
  alt: string;
  priceLabel?: string | null;
  kicker?: string;
}

/** A showcase entry plus the slug it is validated against. */
export interface ShowcaseEntry extends Spotlight {
  categorySlug: string;
}

function entry(categorySlug: string, label: string, image: string, alt: string): ShowcaseEntry {
  return {
    id: categorySlug,
    categorySlug,
    label,
    href: `/category/${categorySlug}`,
    image,
    alt,
  };
}

export const HERO_SPOTLIGHTS: ShowcaseEntry[] = [
  entry("power-tools", "Power tools", "/media/hero/drill.jpg", "Unbranded cordless drill"),
  entry("grinders", "Angle grinders", "/media/hero/grinder.jpg", "Unbranded angle grinder"),
  entry("electronics", "Laptops & computers", "/media/hero/laptop.jpg", "Unbranded closed laptop"),
  entry("small-electronics", "Phones & small electronics", "/media/hero/phone.jpg", "Unbranded smartphone with a blank screen"),
  entry("electronics", "Gaming", "/media/hero/controller.jpg", "Unbranded wireless game controller"),
  entry("air-fryers", "Air fryers", "/media/hero/air-fryer.jpg", "Unbranded compact air fryer"),
  entry("small-appliances", "Small appliances", "/media/hero/kettle.jpg", "Unbranded stainless steel kettle"),
  entry("jacks", "Automotive jacks", "/media/hero/jack.jpg", "Red hydraulic trolley jack"),
  entry("spanners", "Hand tools", "/media/hero/spanners.jpg", "Metric spanners in a canvas tool roll"),
];

/**
 * Eight distinct images, eight distinct live categories. The home page tiles
 * each of these so the "shop by what you need" row is fully populated even
 * before a single product is published.
 */
export const SHOWCASE_CATEGORIES: ShowcaseEntry[] = [
  entry("small-electronics", "Gaming & Electronics", "/media/hero/controller.jpg", "Wireless game controller"),
  entry("power-tools", "Power Tools", "/media/hero/drill.jpg", "Cordless drill"),
  entry("electronics", "Laptops & Computers", "/media/hero/laptop.jpg", "Laptop"),
  entry("small-electronics", "Phones & Electronics", "/media/hero/phone.jpg", "Smartphone"),
  entry("air-fryers", "Appliances", "/media/hero/air-fryer.jpg", "Air fryer"),
  entry("jacks", "Automotive & Tools", "/media/hero/jack.jpg", "Trolley jack"),
  entry("spanners", "Hand Tools", "/media/hero/spanners.jpg", "Spanner set"),
  entry("small-appliances", "Small Appliances", "/media/hero/kettle.jpg", "Kettle"),
];

/**
 * Keeps only the entries whose category actually exists in the storefront.
 * Anything else is dropped rather than rendered, so a stale slug degrades into a
 * shorter row instead of a 404 the customer can click.
 */
export function resolveShowcase(
  entries: ShowcaseEntry[],
  liveSlugs: ReadonlySet<string>,
  hrefFor?: (entry: ShowcaseEntry) => string,
): Spotlight[] {
  return entries
    .filter((candidate) => liveSlugs.has(candidate.categorySlug))
    .map((candidate) => (hrefFor ? { ...candidate, href: hrefFor(candidate) } : candidate));
}
