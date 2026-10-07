/**
 * Product identification from whatever the photo actually says.
 *
 * Everything here is conservative on purpose: a guess that lands in a listing
 * is a lie about a real item. So a brand is only suggested when its name is
 * literally on the photo or the tag, a product type only when a recognisable
 * cue word was read, and anything unclear comes back empty for Lee to type.
 */

/**
 * Brands that show up on second-hand stock and are worth matching on. Lower
 * case; matched case-insensitively on word boundaries.
 */
export const KNOWN_BRANDS: string[] = [
  "acer", "adidas", "apple", "asus", "audi", "barbie", "beko", "black & decker",
  "black+decker", "bosch", "braun", "breville", "bmw", "canon", "casio", "citizen",
  "dell", "defy", "dewalt", "dremel", "electrolux", "fujifilm", "garmin", "hasbro",
  "hewlett-packard", "hikoki", "hitachi", "honda", "hisense", "hp", "ingco",
  "kenwood", "lego", "lenovo", "lg", "makita", "mattel", "mercedes", "metabo",
  "microsoft", "midea", "milwaukee", "nike", "nikon", "nintendo", "olympus",
  "panasonic", "philips", "puma", "pyrex", "reebok", "russell hobbs", "ryobi",
  "samsung", "seiko", "sony", "stanley", "suzuki", "tupperware", "toshiba",
  "toyota", "vitamix", "werner", "whirlpool", "yamaha",
];

/** Product types the store actually sells, with the words that prove one. */
const PRODUCT_TYPES: Array<{ type: string; cues: string[] }> = [
  { type: "angle grinder", cues: ["angle grinder", "grinder disc"] },
  { type: "circular saw", cues: ["circular saw", "table saw", "mitre saw"] },
  { type: "hammer drill", cues: ["hammer drill", "rotary hammer"] },
  { type: "impact driver", cues: ["impact driver", "impact wrench"] },
  { type: "cordless drill", cues: ["cordless drill", "drill driver", "combi drill"] },
  { type: "power drill", cues: ["power drill", "drill"] },
  { type: "orbital sander", cues: ["orbital sander", "belt sander", "sander"] },
  { type: "jigsaw", cues: ["jigsaw"] },
  { type: "heat gun", cues: ["heat gun"] },
  { type: "vacuum cleaner", cues: ["vacuum cleaner", "vacuum", "dust extractor"] },
  { type: "pressure washer", cues: ["pressure washer", "jet wash"] },
  { type: "air compressor", cues: ["air compressor", "compressor"] },
  { type: "full face helmet", cues: ["full face helmet", "flip up helmet"] },
  { type: "open face helmet", cues: ["open face helmet", "half helmet"] },
  { type: "helmet", cues: ["helmet"] },
  { type: "air fryer", cues: ["air fryer"] },
  { type: "microwave oven", cues: ["microwave"] },
  { type: "blender", cues: ["blender"] },
  { type: "kettle", cues: ["kettle"] },
  { type: "toaster", cues: ["toaster"] },
  { type: "washing machine", cues: ["washing machine"] },
  { type: "refrigerator", cues: ["refrigerator", "fridge", "freezer"] },
  { type: "television", cues: ["smart tv", "led tv", "television", " tv "] },
  { type: "game console", cues: ["playstation", "ps5", "ps4", "xbox", "nintendo switch"] },
  { type: "game controller", cues: ["dualsense", "dualshock", "controller"] },
  { type: "laptop", cues: ["laptop", "notebook computer"] },
  { type: "mobile phone", cues: ["smartphone", "mobile phone", "cell phone", "galaxy"] },
  { type: "power tool set", cues: ["power tool", "tool kit", "tool set"] },
  { type: "football boots", cues: ["football boots", "soccer boots", "cleats"] },
  { type: "bicycle", cues: ["bicycle", "mountain bike"] },
  { type: "electric guitar", cues: ["electric guitar", "guitar amplifier"] },
];

export type IdentifyConfidence = "HIGH" | "MEDIUM";

export interface BrandIdentification {
  brand: string;
  confidence: IdentifyConfidence;
  /** Every known brand seen, so the admin can pick a different one. */
  all: string[];
}

/** The brand literally written on the photo or tag, if any. */
export function identifyBrand(text: string): BrandIdentification | null {
  const haystack = ` ${text.toLowerCase()} `;
  const hits: Array<{ brand: string; index: number }> = [];
  for (const brand of new Set(KNOWN_BRANDS)) {
    const index = haystack.indexOf(brand);
    if (index >= 0) hits.push({ brand, index });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.index - b.index);

  // "black & decker" and "black+decker" are the same brand once seen.
  const brands = hits
    .map((hit) => hit.brand)
    .filter((brand) => !(brand === "black+decker" && hits.some((h) => h.brand === "black & decker")));

  return {
    brand: normaliseBrand(brands[0]!),
    confidence: brands.length === 1 ? "HIGH" : "MEDIUM",
    all: brands.map(normaliseBrand),
  };
}

function normaliseBrand(brand: string): string {
  if (brand === "hp") return "HP";
  if (brand === "lg") return "LG";
  if (brand === "asus") return "ASUS";
  if (brand === "msi") return "MSI";
  return brand
    .split(" ")
    .map((word) => (word.length <= 3 && word === word.toLowerCase() ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** The product type the photo says it is, if anything recognisable was read. */
export function suggestProductType(text: string): string | null {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  for (const entry of PRODUCT_TYPES) {
    for (const cue of entry.cues) {
      if (haystack.includes(cue)) return entry.type;
    }
  }
  return null;
}

/**
 * A listing title built only from what was confirmed.
 *
 * Empty string when nothing is known — never a fabricated name.
 */
export function suggestTitle(parts: { brand?: string; type?: string; model?: string }): string {
  return [parts.brand?.trim(), parts.model?.trim(), parts.type?.trim()]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ")
    .trim();
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface CategoryMatch {
  id: string;
  name: string;
  score: number;
}

/**
 * Pick the store category whose name overlaps the read text most.
 *
 * Below a token-overlap threshold nothing is suggested: putting a drill in
 * "Home & Garden" because both words appeared is worse than leaving the select
 * blank for Lee.
 */
export function matchCategory(text: string, categories: CategoryOption[]): CategoryMatch | null {
  const words = new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
  if (words.size === 0 || categories.length === 0) return null;

  let best: CategoryMatch | null = null;
  for (const category of categories) {
    const nameWords = category.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);
    if (nameWords.length === 0) continue;
    const overlap = nameWords.filter((word) => words.has(word)).length;
    const score = overlap / nameWords.length;
    if (score >= 0.5 && (!best || score > best.score)) {
      best = { id: category.id, name: category.name, score };
    }
  }
  return best;
}

/**
 * Group uploaded photos into products.
 *
 * The rule the store asked for: photos uploaded together describe ONE physical
 * item, so a batch becomes one product with a gallery — never one product per
 * photo. A photo Lee explicitly marks as a different item starts the next
 * group.
 */
export interface GroupablePhoto {
  key: string;
  /** True when Lee says this photo is a different physical item. */
  separate?: boolean;
}

export interface PhotoGroup {
  index: number;
  keys: string[];
}

export function groupPhotos(photos: GroupablePhoto[]): PhotoGroup[] {
  const groups: PhotoGroup[] = [];
  for (const photo of photos) {
    const startsNew = photo.separate || groups.length === 0;
    if (startsNew) {
      groups.push({ index: groups.length, keys: [photo.key] });
    } else {
      groups[groups.length - 1]!.keys.push(photo.key);
    }
  }
  return groups;
}
