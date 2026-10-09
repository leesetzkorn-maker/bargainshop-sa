/**
 * Shipping engine — pure, dependency-free rate calculation.
 *
 * Nothing here touches the database. The caller (src/lib/dal/shipping.ts) loads
 * the active ShippingSetting and ShippingTier rows and passes them in, which
 * keeps the pricing rules unit-testable.
 *
 * The rates are The Courier Guy's published locker tariff card (effective
 * 2026-09-01, incl. VAT). A parcel is priced by matching it to the smallest
 * locker-size tier it fits inside, then reading the price for the chosen
 * service from that tier. We do not estimate, interpolate or invent a price:
 * if no tier fits, the parcel cannot be quoted online.
 */

import {
  SHIPPING_METHODS,
  isDoorMethod,
  type ShippingMethod,
} from "@/lib/enums";

/** A single product as it contributes to the parcel. */
export interface ParcelLine {
  lockerAllowed?: boolean;
  courierAllowed?: boolean;
  productId: string;
  itemId: string;
  name: string;
  quantity: number;
  /** Weight of the bare product, grams. */
  productWeightGrams: number;
  /** Extra weight of box/bubble wrap for this unit, grams. */
  packageWeightGrams: number;
  packageLengthCm: number;
  packageWidthCm: number;
  packageHeightCm: number;
}

/** The computed parcel, derived from the lines. */
export interface Parcel {
  /** Actual packed weight: sum of (product + packaging) per unit. Grams. */
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Longest single dimension. */
  longestSideCm: number;
  sumCm: number;
  volumeCm3: number;
  totalQuantity: number;
  totalItems: number;
}

/** The subset of ShippingSetting the engine needs. */
export interface ShippingSettings {
  isActive: boolean;
  /** Percent added to to-door services; 0 keeps them closed. */
  doorFuelSurchargePercent: number;
  etaMinDays: number;
  etaMaxDays: number;
}

/** The subset of ShippingTier the engine needs. */
export interface ShippingTier {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  maxLengthCm: number;
  maxWidthCm: number;
  maxHeightCm: number;
  maxWeightGrams: number;
  lockerToLockerCents: number;
  lockerToDoorCents: number;
  lockerToKioskCents: number;
  kioskToDoorCents: number;
}

export interface MethodQuote {
  method: ShippingMethod;
  available: boolean;
  /** Base tariff plus any fuel surcharge. */
  priceCents: number;
  /** The fuel portion already included in priceCents (to-door only). */
  fuelSurchargeCents: number;
  /** Why this method is unavailable, shown to the customer in plain language. */
  unavailableReason?: string;
  matchedTierCode?: string;
  matchedTierName?: string;
  etaMinDays: number;
  etaMaxDays: number;
}

export interface ShippingQuote {
  parcel: Parcel;
  subtotalCents: number;
  /** The service price for the selected method. Customer always pays it. */
  shippingCents: number;
  /** The method selected for checkout. */
  method: ShippingMethod;
  matchedTierCode?: string;
  matchedTierName?: string;
  methods: MethodQuote[];
  /** Present when no method can serve this parcel. */
  error?: string;
}

/**
 * Services offered from a locker origin. Kiosk-to-door is defined in the rate
 * card but not offered while we dispatch from a locker.
 */
export const OFFERED_SHIPPING_METHODS: ShippingMethod[] = [
  "LOCKER_TO_LOCKER",
  "LOCKER_TO_DOOR",
  "LOCKER_TO_KIOSK",
];

/** Defensive check that the enum and this list never drift apart. */
if (OFFERED_SHIPPING_METHODS.some((method) => !SHIPPING_METHODS.includes(method))) {
  throw new Error("OFFERED_SHIPPING_METHODS contains a method missing from SHIPPING_METHODS");
}

export function isValidParcelLine(line: ParcelLine): boolean {
  return (
    Number.isInteger(line.quantity) && line.quantity > 0 &&
    Number.isFinite(line.productWeightGrams) && line.productWeightGrams > 0 &&
    Number.isFinite(line.packageWeightGrams) && line.packageWeightGrams >= 0 &&
    Number.isFinite(line.packageLengthCm) &&
    Number.isFinite(line.packageWidthCm) &&
    Number.isFinite(line.packageHeightCm) &&
    line.packageLengthCm > 0 &&
    line.packageWidthCm > 0 &&
    line.packageHeightCm > 0
  );
}

/**
 * Aggregate cart lines into one parcel.
 *
 * A multi-item order is shipped as a single parcel, so dimensions are the sum of
 * the per-item dimensions (conservative — a real consolidation would re-measure
 * the box). That errs toward the next locker size up, which is the safe
 * direction.
 */
export function buildParcel(lines: ParcelLine[]): Parcel {
  let weightGrams = 0;
  let lengthCm = 0;
  let widthCm = 0;
  let heightCm = 0;
  let totalQuantity = 0;

  for (const line of lines) {
    if (!isValidParcelLine(line)) continue;
    const qty = Math.max(1, Math.floor(line.quantity));
    totalQuantity += qty;
    weightGrams += (line.productWeightGrams + line.packageWeightGrams) * qty;
    lengthCm += line.packageLengthCm * qty;
    widthCm += line.packageWidthCm * qty;
    heightCm += line.packageHeightCm * qty;
  }

  const length = round1(lengthCm);
  const width = round1(widthCm);
  const height = round1(heightCm);
  const volume = round1(length * width * height);

  return {
    weightGrams: Math.max(0, Math.round(weightGrams)),
    lengthCm: length,
    widthCm: width,
    heightCm: height,
    longestSideCm: round1(Math.max(length, width, height)),
    sumCm: round1(length + width + height),
    volumeCm3: volume,
    totalQuantity,
    totalItems: lines.length,
  };
}

function sortedDesc(a: number, b: number, c: number): [number, number, number] {
  const values = [a, b, c].sort((x, y) => y - x);
  return [values[0], values[1], values[2]];
}

/**
 * Whether a parcel fits inside a tier. Dimensions are compared longest-to-
 * longest so a parcel can be rotated into the box; weight is the actual packed
 * weight (not a volumetric estimate).
 */
export function parcelFitsTier(parcel: Parcel, tier: ShippingTier): boolean {
  if (parcel.weightGrams > tier.maxWeightGrams) return false;
  const [pl, pw, ph] = sortedDesc(parcel.lengthCm, parcel.widthCm, parcel.heightCm);
  const [tl, tw, th] = sortedDesc(tier.maxLengthCm, tier.maxWidthCm, tier.maxHeightCm);
  return pl <= tl && pw <= tw && ph <= th;
}

/** The smallest active tier the parcel fits, or undefined when none do. */
export function selectTier(parcel: Parcel, tiers: ShippingTier[]): ShippingTier | undefined {
  return tiers
    .filter((tier) => tier.isActive)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.maxWeightGrams - b.maxWeightGrams)
    .find((tier) => parcelFitsTier(parcel, tier));
}

/** The tariff-card price for a service on a given tier. */
export function tierPriceCents(tier: ShippingTier, method: ShippingMethod): number {
  switch (method) {
    case "LOCKER_TO_LOCKER":
      return tier.lockerToLockerCents;
    case "LOCKER_TO_DOOR":
      return tier.lockerToDoorCents;
    case "LOCKER_TO_KIOSK":
      return tier.lockerToKioskCents;
    case "KIOSK_TO_DOOR":
      return tier.kioskToDoorCents;
  }
}

function doorSurchargeCents(baseCents: number, percent: number): number {
  if (percent <= 0) return 0;
  return Math.round((baseCents * percent) / 100);
}

/**
 * Produce a full quote.
 *
 * @param preferredMethod what the customer selected. If it is unavailable the
 *   quote falls back to whichever method can serve the parcel, so checkout can
 *   never be blocked by a stale selection.
 */
export function calculateShipping(
  lines: ParcelLine[],
  settings: ShippingSettings,
  tiers: ShippingTier[],
  options: { subtotalCents: number; preferredMethod?: ShippingMethod } = { subtotalCents: 0 },
): ShippingQuote {
  const { subtotalCents } = options;
  const preferred = options.preferredMethod;
  const parcel = buildParcel(lines);

  const emptyQuote: ShippingQuote = {
    parcel,
    subtotalCents,
    shippingCents: 0,
    method: preferred ?? "LOCKER_TO_LOCKER",
    methods: [],
    error: "Shipping is not available for this order.",
  };

  if (!settings.isActive) {
    return { ...emptyQuote, error: "Online shipping is temporarily unavailable." };
  }
  if (parcel.totalItems === 0) {
    return { ...emptyQuote, error: "Your cart is empty." };
  }
  if (lines.some((line) => !isValidParcelLine(line))) {
    return {
      ...emptyQuote,
      error: "An item is missing valid packed weight or dimensions. Please contact us for delivery.",
    };
  }
  if (parcel.weightGrams <= 0) {
    return {
      ...emptyQuote,
      error: "This item is missing weight information, so shipping cannot be calculated.",
    };
  }

  const activeTiers = tiers.filter((tier) => tier.isActive);
  if (activeTiers.length === 0) {
    return {
      ...emptyQuote,
      error: "Shipping prices have not been set up yet. Please contact us for a shipping quote.",
    };
  }

  const tier = selectTier(parcel, activeTiers);
  if (!tier) {
    return {
      ...emptyQuote,
      error:
        "This parcel is larger than our biggest locker or kiosk size, so we cannot quote it online. Please contact us for a delivery quote.",
    };
  }

  const canCollect = lines.every((line) => line.lockerAllowed !== false);
  const canDoor = lines.every((line) => line.courierAllowed !== false);
  const doorConfirmed = settings.doorFuelSurchargePercent > 0;

  const methods: MethodQuote[] = OFFERED_SHIPPING_METHODS.map((method) => {
    const base = tierPriceCents(tier, method);
    const door = isDoorMethod(method);

    const quote: MethodQuote = {
      method,
      available: false,
      priceCents: 0,
      fuelSurchargeCents: 0,
      matchedTierCode: tier.code,
      matchedTierName: tier.name,
      etaMinDays: settings.etaMinDays,
      etaMaxDays: settings.etaMaxDays,
    };

    if (base <= 0) {
      return { ...quote, unavailableReason: "No price is set for this size and service yet." };
    }
    if (door && !canDoor) {
      return { ...quote, unavailableReason: "An item in this parcel is not eligible for door delivery." };
    }
    if (!door && !canCollect) {
      return { ...quote, unavailableReason: "An item in this parcel is not eligible for locker delivery." };
    }
    if (door && !doorConfirmed) {
      return {
        ...quote,
        unavailableReason:
          "To-door delivery is not available yet while we confirm The Courier Guy's monthly fuel surcharge. Choose a locker or kiosk collection point, or contact us.",
      };
    }

    const fuel = door ? doorSurchargeCents(base, settings.doorFuelSurchargePercent) : 0;
    return {
      ...quote,
      available: true,
      priceCents: base + fuel,
      fuelSurchargeCents: fuel,
    };
  });

  const available = methods.filter((entry) => entry.available);
  if (available.length === 0) {
    return {
      ...emptyQuote,
      methods,
      matchedTierCode: tier.code,
      matchedTierName: tier.name,
      error: "No delivery option is currently available for this parcel. Please contact us.",
    };
  }

  // Honour the customer's choice when it is still available, else fall back.
  const chosen = (preferred ? available.find((entry) => entry.method === preferred) : undefined) ?? available[0];

  return {
    parcel,
    subtotalCents,
    shippingCents: chosen.priceCents,
    method: chosen.method,
    matchedTierCode: chosen.matchedTierCode,
    matchedTierName: chosen.matchedTierName,
    methods,
  };
}

/** Total payable = items + shipping. */
export function orderTotals(quote: ShippingQuote): {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
} {
  const subtotalCents = Math.max(0, quote.subtotalCents);
  return {
    subtotalCents,
    shippingCents: Math.max(0, quote.shippingCents),
    totalCents: subtotalCents + Math.max(0, quote.shippingCents),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
