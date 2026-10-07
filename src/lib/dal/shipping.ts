import "server-only";

import { prisma } from "@/lib/db";
import {
  calculateShipping,
  type ParcelLine,
  type ShippingQuote,
  type ShippingRule as EngineRule,
  type ShippingSettings as EngineSettings,
} from "@/lib/shipping/engine";
import type { ShippingMethod } from "@/lib/enums";

/** Load the singleton settings row, creating it with sane defaults on first run. */
export async function getShippingSettings(): Promise<EngineSettings> {
  let row = await prisma.shippingSetting.findUnique({ where: { id: 1 } });
  if (!row) {
    row = await prisma.shippingSetting.create({ data: { id: 1 } });
  }
  return {
    isActive: row.isActive && row.ratesConfirmed,
    volumetricDivisor: row.volumetricDivisor,
    lockerEnabled: row.lockerEnabled,
    lockerMaxWeightGrams: row.lockerMaxWeightGrams,
    lockerMaxLengthCm: row.lockerMaxLengthCm,
    lockerMaxWidthCm: row.lockerMaxWidthCm,
    lockerMaxHeightCm: row.lockerMaxHeightCm,
    lockerMaxSumCm: row.lockerMaxSumCm,
    courierEnabled: row.courierEnabled,
    deliverySurchargeCents: row.deliverySurchargeCents,
    freeShippingAboveCents: row.freeShippingAboveCents,
    handlingFeeCents: row.handlingFeeCents,
    lockerEtaMinDays: row.lockerEtaMinDays,
    lockerEtaMaxDays: row.lockerEtaMaxDays,
    courierEtaMinDays: row.courierEtaMinDays,
    courierEtaMaxDays: row.courierEtaMaxDays,
  };
}

/**
 * Where parcels leave from, for customer-facing copy only.
 *
 * Deliberately separate from `getShippingSettings()`: the pricing engine does not
 * need the address, and widening the engine input would let copy concerns leak
 * into quote calculations.
 */
export async function getDispatchLocation(): Promise<{
  dispatchCity: string;
  dispatchProvince: string;
  dispatchPostalCode: string;
}> {
  // `getShippingSettings` returns the engine input, which intentionally omits the
  // address, so read the row again rather than widening the engine type.
  await getShippingSettings();
  const row = await prisma.shippingSetting.findUniqueOrThrow({
    where: { id: 1 },
    select: { dispatchCity: true, dispatchProvince: true, dispatchPostalCode: true },
  });
  return row;
}

export async function getActiveShippingRules(): Promise<EngineRule[]> {
  const rows = await prisma.shippingRule.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      method: true,
      minWeightGrams: true,
      maxWeightGrams: true,
      priceCents: true,
      sortOrder: true,
      isActive: true,
      provinceCodes: true, postalCodePrefixes: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((row) => ({ ...row, method: row.method as ShippingMethod, provinceCodes: row.provinceCodes.split(",").map((code) => code.trim().toUpperCase()).filter(Boolean), postalCodePrefixes: row.postalCodePrefixes.split(",").map((prefix) => prefix.trim()).filter(Boolean) }));
}

/** Turn resolved cart products into engine input. Includes private cost? No. */
export function toParcelLines(
  lines: Array<{
    product: {
      lockerAllowed?: boolean;
      courierAllowed?: boolean;
      itemId: string;
      name: string;
      productWeightGrams: number;
      packageWeightGrams: number;
      packageLengthCm: number;
      packageWidthCm: number;
      packageHeightCm: number;
    };
    quantity: number;
  }>,
): ParcelLine[] {
  return lines.map(({ product, quantity }) => ({
    lockerAllowed: product.lockerAllowed,
    courierAllowed: product.courierAllowed,
    productId: product.itemId,
    itemId: product.itemId,
    name: product.name,
    quantity,
    productWeightGrams: product.productWeightGrams,
    packageWeightGrams: product.packageWeightGrams,
    packageLengthCm: product.packageLengthCm,
    packageWidthCm: product.packageWidthCm,
    packageHeightCm: product.packageHeightCm,
  }));
}

/** Full quote for a set of cart lines. Used by the cart page and checkout. */
export async function quoteShipping(
  lines: ParcelLine[],
  subtotalCents: number,
  preferredMethod?: ShippingMethod,
  destination?: { province?: string; postalCode?: string },
): Promise<ShippingQuote> {
  const [settings, rules] = await Promise.all([getShippingSettings(), getActiveShippingRules()]);
  return calculateShipping(lines, settings, rules, { subtotalCents, preferredMethod, destination });
}
