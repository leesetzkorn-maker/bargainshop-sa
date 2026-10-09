import "server-only";

import { prisma } from "@/lib/db";
import {
  calculateShipping,
  type ParcelLine,
  type ShippingQuote,
  type ShippingTier as EngineTier,
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
    // Both switches must be on, so a rate change can be staged without going live.
    isActive: row.isActive && row.ratesConfirmed,
    doorFuelSurchargePercent: row.doorFuelSurchargePercent,
    etaMinDays: row.etaMinDays,
    etaMaxDays: row.etaMaxDays,
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
  return prisma.shippingSetting.findUniqueOrThrow({
    where: { id: 1 },
    select: { dispatchCity: true, dispatchProvince: true, dispatchPostalCode: true },
  });
}

/** The active locker-size tiers, cheapest fit first. */
export async function getActiveShippingTiers(): Promise<EngineTier[]> {
  return prisma.shippingTier.findMany({
    where: { isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      sortOrder: true,
      isActive: true,
      maxLengthCm: true,
      maxWidthCm: true,
      maxHeightCm: true,
      maxWeightGrams: true,
      lockerToLockerCents: true,
      lockerToDoorCents: true,
      lockerToKioskCents: true,
      kioskToDoorCents: true,
    },
    orderBy: [{ sortOrder: "asc" }, { maxWeightGrams: "asc" }],
  });
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
): Promise<ShippingQuote> {
  const [settings, tiers] = await Promise.all([getShippingSettings(), getActiveShippingTiers()]);
  return calculateShipping(lines, settings, tiers, { subtotalCents, preferredMethod });
}
