/**
 * Shipping engine — pure, dependency-free rate calculation.
 *
 * Nothing here touches the database. The caller (src/lib/dal/shipping.ts)
 * loads the active ShippingSetting + ShippingRule rows and passes them in, which
 * keeps the pricing rules unit-testable. Configured tariffs determine the customer-paid delivery price.
 */

import type { ShippingMethod } from "@/lib/enums";

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
  /** Billable weight: sum of (product + packaging) per unit. Grams. */
  weightGrams: number;
  /** Volumetric weight: L*W*H/5000 in grams, the divisor most SA couriers use. */
  volumetricWeightGrams: number;
  /** The greater of actual and volumetric weight — what couriers bill on. */
  billableWeightGrams: number;
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
  /** Owner-confirmed Courier Guy locker card; ignores legacy weight brackets. */
  tcgLockerTariffs?: boolean;
  /** Only set after confirming the current month's door fuel surcharge. */
  doorFuelSurchargePercent?: number;
  volumetricDivisor?: number;
  isActive: boolean;
  lockerEnabled: boolean;
  lockerMaxWeightGrams: number;
  lockerMaxLengthCm: number;
  lockerMaxWidthCm: number;
  lockerMaxHeightCm: number;
  lockerMaxSumCm: number;
  courierEnabled: boolean;
  deliverySurchargeCents: number;
  freeShippingAboveCents: number;
  handlingFeeCents: number;
  lockerEtaMinDays: number;
  lockerEtaMaxDays: number;
  courierEtaMinDays: number;
  courierEtaMaxDays: number;
}

/** The subset of ShippingRule the engine needs. */
export interface ShippingRule {
  provinceCodes?: string[];
  postalCodePrefixes?: string[];
  id: string;
  name: string;
  method: ShippingMethod;
  minWeightGrams: number;
  maxWeightGrams: number; // 0 === no upper bound
  priceCents: number;
  sortOrder: number;
  isActive: boolean;
}

export interface MethodQuote {
  method: ShippingMethod;
  available: boolean;
  priceCents: number;
  /** Why this method is unavailable, shown to the customer in plain language. */
  unavailableReason?: string;
  matchedRuleId?: string;
  matchedRuleName?: string;
  etaMinDays: number;
  etaMaxDays: number;
}

export interface ShippingQuote {
  parcel: Parcel;
  subtotalCents: number;
  /** Price before free-shipping discount. */
  baseShippingCents: number;
  /** Negative when free shipping applied. */
  discountCents: number;
  /** baseShipping + surcharge + handling − discount, floored at 0. */
  shippingCents: number;
  handlingFeeCents: number;
  deliverySurchargeCents: number;
  freeShippingApplied: boolean;
  freeShippingThresholdCents: number;
  /** Remaining spend to unlock free shipping. 0 once unlocked. */
  freeShippingRemainingCents: number;
  /** The method selected for checkout. */
  method: ShippingMethod;
  /** Is this parcel small/light enough for a locker? */
  lockerEligible: boolean;
  /** Human-readable blockers when lockerEligible is false. */
  lockerBlockers: string[];
  methods: MethodQuote[];
  /** Present when no method can serve this parcel. */
  error?: string;
}

const VOLUMETRIC_DIVISOR = 5000;

/** VAT-inclusive card supplied by the owner, effective 1 September 2026. */
export const TCG_LOCKER_SIZES = [
  { size: "XS", dimensions: [60, 17, 8], maxWeightGrams: 2000, lockerCents: 5900, doorCents: 7900, kioskCents: 6900, kioskDoorCents: 9300 },
  { size: "S", dimensions: [60, 41, 8], maxWeightGrams: 5000, lockerCents: 6900, doorCents: 8900, kioskCents: 7900, kioskDoorCents: 10500 },
  { size: "M", dimensions: [60, 41, 19], maxWeightGrams: 10000, lockerCents: 7900, doorCents: 11900, kioskCents: 8900, kioskDoorCents: 13500 },
  { size: "L", dimensions: [60, 41, 41], maxWeightGrams: 15000, lockerCents: 10900, doorCents: 17600, kioskCents: 12900, kioskDoorCents: 21000 },
  { size: "XL", dimensions: [60, 41, 69], maxWeightGrams: 20000, lockerCents: 14900, doorCents: 23900, kioskCents: 16900, kioskDoorCents: 28000 },
] as const;

export function findTcgLockerSize(parcel: Parcel) {
  const packed = [parcel.lengthCm, parcel.widthCm, parcel.heightCm].sort((a, b) => a - b);
  return TCG_LOCKER_SIZES.find((entry) => {
    const limits = [...entry.dimensions].sort((a, b) => a - b);
    return parcel.weightGrams <= entry.maxWeightGrams && packed.every((dimension, index) => dimension <= limits[index]);
  });
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
 * the box). That errs toward courier, which is the safe direction.
 */
export function buildParcel(lines: ParcelLine[], volumetricDivisor = VOLUMETRIC_DIVISOR): Parcel {
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

  // Never round a parcel down across a size boundary.
  const length = Math.ceil(lengthCm * 10) / 10;
  const width = Math.ceil(widthCm * 10) / 10;
  const height = Math.ceil(heightCm * 10) / 10;
  const volume = round1(length * width * height);
  const volumetric = Math.ceil(volume / volumetricDivisor * 1000);
  const actual = Math.max(0, Math.round(weightGrams));

  return {
    weightGrams: actual,
    volumetricWeightGrams: volumetric,
    billableWeightGrams: Math.max(actual, volumetric),
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

/**
 * Locker eligibility. A parcel must clear every configured ceiling —
 * a parcel is never assumed to fit just because it is light.
 */
export function checkLockerEligibility(
  parcel: Parcel,
  settings: ShippingSettings,
): { eligible: boolean; blockers: string[] } {
  const blockers: string[] = [];

  if (!settings.lockerEnabled) {
    return { eligible: false, blockers: ["Locker delivery is currently unavailable."] };
  }
  if (parcel.totalItems === 0) {
    return { eligible: false, blockers: ["There is nothing in your cart yet."] };
  }

  if (parcel.weightGrams > settings.lockerMaxWeightGrams) {
    blockers.push(
      `Parcel weighs ${formatGrams(parcel.weightGrams)}, over the locker limit of ${formatGrams(settings.lockerMaxWeightGrams)}.`,
    );
  }
  if (parcel.longestSideCm > settings.lockerMaxLengthCm) {
    blockers.push(
      `Longest side is ${parcel.longestSideCm} cm, over the locker limit of ${settings.lockerMaxLengthCm} cm.`,
    );
  }
  if (parcel.widthCm > settings.lockerMaxWidthCm) {
    blockers.push(
      `Width is ${parcel.widthCm} cm, over the locker limit of ${settings.lockerMaxWidthCm} cm.`,
    );
  }
  if (parcel.heightCm > settings.lockerMaxHeightCm) {
    blockers.push(
      `Height is ${parcel.heightCm} cm, over the locker limit of ${settings.lockerMaxHeightCm} cm.`,
    );
  }
  if (parcel.sumCm > settings.lockerMaxSumCm) {
    blockers.push(
      `Combined dimensions are ${parcel.sumCm} cm, over the locker limit of ${settings.lockerMaxSumCm} cm.`,
    );
  }

  return { eligible: blockers.length === 0, blockers };
}

/** Find the active rule of `method` whose weight bracket contains the billable weight. */
export function findRuleForWeight(
  rules: ShippingRule[],
  method: ShippingMethod,
  weightGrams: number,
  destination?: { province?: string; postalCode?: string },
): ShippingRule | undefined {
  return rules
    .filter((rule) => rule.isActive && rule.method === method && rule.priceCents > 0)
    .filter((rule) => !rule.provinceCodes?.length || rule.provinceCodes.includes(destination?.province ?? ""))
    .filter((rule) => !rule.postalCodePrefixes?.length || rule.postalCodePrefixes.some((prefix) => destination?.postalCode?.startsWith(prefix)))
    .filter((rule) => weightGrams >= rule.minWeightGrams)
    .filter((rule) => rule.maxWeightGrams === 0 || weightGrams <= rule.maxWeightGrams)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.minWeightGrams - b.minWeightGrams)[0];
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
  rules: ShippingRule[],
  options: { subtotalCents: number; preferredMethod?: ShippingMethod; destination?: { province?: string; postalCode?: string } } = {
    subtotalCents: 0,
  },
): ShippingQuote {
  const { subtotalCents } = options;
  const preferred = options.preferredMethod;
  const parcel = buildParcel(lines, settings.volumetricDivisor ?? VOLUMETRIC_DIVISOR);

  const emptyQuote: ShippingQuote = {
    parcel,
    subtotalCents,
    baseShippingCents: 0,
    discountCents: 0,
    shippingCents: 0,
    handlingFeeCents: 0,
    deliverySurchargeCents: 0,
    freeShippingApplied: false,
    freeShippingThresholdCents: settings.freeShippingAboveCents,
    freeShippingRemainingCents: 0,
    method: preferred ?? "COURIER",
    lockerEligible: false,
    lockerBlockers: [],
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
    return { ...emptyQuote, error: "An item is missing valid packed weight or dimensions. Please contact us for delivery." };
  }
  if (parcel.weightGrams <= 0) {
    return {
      ...emptyQuote,
      error: "This item is missing weight information, so shipping cannot be calculated.",
    };
  }

  if (settings.tcgLockerTariffs) {
    const size = findTcgLockerSize(parcel);
    const fits = Boolean(size);
    const lockerAvailable = fits && lines.every((line) => line.lockerAllowed !== false);
    const fuel = settings.doorFuelSurchargePercent;
    const fuelConfirmed = fuel !== undefined && Number.isFinite(fuel) && fuel >= 0;
    const courierAvailable = fits && fuelConfirmed && lines.every((line) => line.courierAllowed !== false);
    const methods: MethodQuote[] = [
      { method: "LOCKER", available: lockerAvailable, priceCents: lockerAvailable ? size!.lockerCents : 0,
        matchedRuleName: size ? `The Courier Guy ${size.size} locker-to-locker` : undefined,
        unavailableReason: !fits ? "This packed parcel exceeds the locker size or weight limits. Please request a delivery quote." : !lockerAvailable ? "An item cannot be sent to a locker." : undefined,
        etaMinDays: settings.lockerEtaMinDays, etaMaxDays: settings.lockerEtaMaxDays },
      { method: "COURIER", available: courierAvailable, priceCents: courierAvailable ? size!.doorCents + Math.ceil(size!.doorCents * fuel! / 100) : 0,
        matchedRuleName: size ? `The Courier Guy ${size.size} locker-to-door` : undefined,
        unavailableReason: !fits ? "This packed parcel needs a separate delivery quote." : !fuelConfirmed ? "Door delivery awaits confirmation of the current fuel surcharge. Choose locker delivery." : "An item cannot be delivered by courier.",
        etaMinDays: settings.courierEtaMinDays, etaMaxDays: settings.courierEtaMaxDays },
    ];
    const available = methods.filter((entry) => entry.available);
    const chosen = available.find((entry) => entry.method === preferred) ?? available[0];
    const blockers = lockerAvailable ? [] : [methods[0].unavailableReason!];
    if (!chosen) return { ...emptyQuote, methods, lockerBlockers: blockers, error: "No delivery option can carry this parcel. Please request a delivery quote." };
    // Full customer-paid tariff. Legacy free shipping, handling and surcharges do not apply.
    return { ...emptyQuote, error: undefined, methods, method: chosen.method, lockerEligible: lockerAvailable,
      lockerBlockers: blockers, baseShippingCents: chosen.priceCents, shippingCents: chosen.priceCents,
      freeShippingThresholdCents: 0 };
  }

  const { eligible: lockerEligible, blockers } = checkLockerEligibility(parcel, settings);
  const itemLockerAllowed = lines.every((line) => line.lockerAllowed !== false);
  if (!itemLockerAllowed) blockers.push("An item in this parcel is not eligible for locker delivery.");

  const methods: MethodQuote[] = [];

  // --- Locker ---
  if (settings.lockerEnabled && lockerEligible && itemLockerAllowed) {
    const rule = findRuleForWeight(rules, "LOCKER", parcel.weightGrams, options.destination);
    methods.push({
      method: "LOCKER",
      available: rule !== undefined,
      priceCents: rule?.priceCents ?? 0,
      unavailableReason:
        rule === undefined ? "No locker price bracket covers this parcel weight yet." : undefined,
      matchedRuleId: rule?.id,
      matchedRuleName: rule?.name,
      etaMinDays: settings.lockerEtaMinDays,
      etaMaxDays: settings.lockerEtaMaxDays,
    });
  } else {
    methods.push({
      method: "LOCKER",
      available: false,
      priceCents: 0,
      unavailableReason:
        blockers[0] ??
        "This parcel is too large or heavy for locker delivery.",
      etaMinDays: settings.lockerEtaMinDays,
      etaMaxDays: settings.lockerEtaMaxDays,
    });
  }

  // --- Courier ---
  if (settings.courierEnabled && lines.every((line) => line.courierAllowed !== false)) {
    const rule = findRuleForWeight(rules, "COURIER", parcel.billableWeightGrams, options.destination);
    methods.push({
      method: "COURIER",
      available: rule !== undefined,
      priceCents: rule?.priceCents ?? 0,
      unavailableReason:
        rule === undefined
          ? "No courier price bracket covers this parcel weight yet."
          : undefined,
      matchedRuleId: rule?.id,
      matchedRuleName: rule?.name,
      etaMinDays: settings.courierEtaMinDays,
      etaMaxDays: settings.courierEtaMaxDays,
    });
  } else {
    methods.push({
      method: "COURIER",
      available: false,
      priceCents: 0,
      unavailableReason: "Courier delivery is currently unavailable.",
      etaMinDays: settings.courierEtaMinDays,
      etaMaxDays: settings.courierEtaMaxDays,
    });
  }

  const available = methods.filter((m) => m.available);

  if (available.length === 0) {
    const missing = rules.filter((r) => r.isActive).length === 0;
    return {
      ...emptyQuote,
      methods,
      lockerEligible,
      lockerBlockers: blockers,
      error: !options.destination?.province && rules.some((rule) => rule.provinceCodes?.length || rule.postalCodePrefixes?.length)
        ? "Enter your destination province and postal code at checkout to calculate delivery."
        : missing
        ? "Shipping prices have not been set up yet. Please contact us for a shipping quote."
        : "No delivery option can carry this parcel. Please contact us for a quote.",
    };
  }

  // Honour the customer's choice when it is still available, else fall back.
  const chosen =
    (preferred ? available.find((m) => m.method === preferred) : undefined) ??
    available[0];

  const baseShippingCents = chosen.priceCents;
  const deliverySurchargeCents = settings.deliverySurchargeCents;
  const handlingFeeCents = settings.handlingFeeCents;

  const grossShippingCents = baseShippingCents + deliverySurchargeCents + handlingFeeCents;

  const freeShippingApplied =
    settings.freeShippingAboveCents > 0 && subtotalCents >= settings.freeShippingAboveCents;

  // Free shipping waives the delivery charge only — never the handling fee,
  // which is a real cost of packing the order.
  const discountCents = freeShippingApplied ? baseShippingCents + deliverySurchargeCents : 0;
  const shippingCents = Math.max(0, grossShippingCents - discountCents);

  const freeShippingRemainingCents =
    settings.freeShippingAboveCents > 0 && !freeShippingApplied
      ? Math.max(0, settings.freeShippingAboveCents - subtotalCents)
      : 0;

  return {
    parcel,
    subtotalCents,
    baseShippingCents,
    discountCents,
    shippingCents,
    handlingFeeCents,
    deliverySurchargeCents,
    freeShippingApplied,
    freeShippingThresholdCents: settings.freeShippingAboveCents,
    freeShippingRemainingCents,
    method: chosen.method,
    lockerEligible: lockerEligible && itemLockerAllowed,
    lockerBlockers: blockers,
    methods,
  };
}

/** Total payable = items + shipping (handling/surcharge already inside shippingCents). */
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

function formatGrams(grams: number): string {
  return grams >= 1000 ? `${(grams / 1000).toFixed(2).replace(/\.?0+$/, "")} kg` : `${grams} g`;
}
