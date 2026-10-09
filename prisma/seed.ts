/**
 * Database seed — configuration only.
 *
 * Creates: the admin account, the category tree, and the shipping configuration
 * the store needs before the first order arrives.
 *
 * IT DOES NOT CREATE PRODUCTS. An earlier version of this file invented 44
 * demo listings — plausible-looking drills and appliances with descriptions
 * written from imagination, generic placeholder artwork and no connection to any
 * real item. That is exactly the thing this store must not sell: a customer
 * would be paying for a product nobody has ever seen. Those rows have been
 * removed from the database and are not recreated here.
 *
 * Real stock arrives through the import pipeline, which insists on a
 * photograph of the actual item:
 *
 *   data/internal/ezpawn-intake.json   the owner's own sheet: cost, selling
 *                                       price, condition, testing notes
 *   scripts/import/import-ezpawn-folder.ts    copies the real photos
 *   scripts/catalogue/apply-ezpawn-intake.ts     writes the products, as DRAFT
 *   scripts/shipping/apply-shipping-facts.ts    packed weight and box size, with a
 *                                       MEASURED / ESTIMATED label
 *   scripts/launch/go-live.ts                 publishes what is genuinely ready
 *
 * Missing catalogue stock is never replaced with invented products.
 *
 * Idempotent: create missing configuration only. Existing rows are untouched.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATEGORY_TREE } from "../src/lib/category-tree";


const prisma = new PrismaClient();

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "2DE BARGAINS";


async function main() {
  console.log(`Seeding ${BRAND}...`);

  // ---- Shipping configuration -------------------------------------------
  //
  // Created once, then never touched by a re-run, so that a deliberate change
  // made in the admin area is not silently undone by `npm run db:seed`.
  //
  // The prices below are The Courier Guy's published locker tariff card,
  // effective 2026-09-01, including VAT. To-door prices exclude the monthly fuel
  // surcharge, which stays at 0 here so checkout keeps to-door delivery closed
  // until an admin enters the confirmed percentage.
  await prisma.shippingSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      isActive: true,
      ratesConfirmed: true,
      doorFuelSurchargePercent: 0,
      etaMinDays: 1,
      etaMaxDays: 3,
      dispatchCity: "Johannesburg",
      dispatchProvince: "GP",
      dispatchPostalCode: "2000",
    },
  });

  // The locker tariff card. Sizes are matched smallest-first, so sortOrder
  // doubles as the fit order.
  const tiers = [
    { code: "XS", name: "Extra small", sortOrder: 10, maxLengthCm: 60, maxWidthCm: 17, maxHeightCm: 8, maxWeightGrams: 2000, lockerToLockerCents: 5900, lockerToDoorCents: 7900, lockerToKioskCents: 6900, kioskToDoorCents: 9300 },
    { code: "S", name: "Small", sortOrder: 20, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 8, maxWeightGrams: 5000, lockerToLockerCents: 6900, lockerToDoorCents: 8900, lockerToKioskCents: 7900, kioskToDoorCents: 10500 },
    { code: "M", name: "Medium", sortOrder: 30, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 19, maxWeightGrams: 10000, lockerToLockerCents: 7900, lockerToDoorCents: 11900, lockerToKioskCents: 8900, kioskToDoorCents: 13500 },
    { code: "L", name: "Large", sortOrder: 40, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 41, maxWeightGrams: 15000, lockerToLockerCents: 10900, lockerToDoorCents: 17600, lockerToKioskCents: 12900, kioskToDoorCents: 21000 },
    { code: "XL", name: "Extra large", sortOrder: 50, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 69, maxWeightGrams: 20000, lockerToLockerCents: 14900, lockerToDoorCents: 23900, lockerToKioskCents: 16900, kioskToDoorCents: 28000 },
  ];
  for (const tier of tiers) {
    await prisma.shippingTier.upsert({ where: { code: tier.code }, update: {}, create: tier });
  }

  for (const [index, node] of CATEGORY_TREE.entries()) {
    const category = await prisma.category.upsert({ where: { slug: node.slug }, update: {}, create: { slug: node.slug, name: node.name, description: node.description, sortOrder: index * 10 } });
    for (const [childIndex, child] of node.children.entries()) {
      await prisma.category.upsert({ where: { slug: child.slug }, update: {}, create: { slug: child.slug, name: child.name, parentId: category.id, sortOrder: childIndex } });
    }
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const ownerExists = await prisma.user.findFirst({ where: { role: "OWNER" }, select: { id: true } });
  if (!ownerExists && email && !(await prisma.user.findUnique({ where: { email } }))) {
    if (!password || password.length < 12 || /CHANGEME/i.test(password)) throw new Error("Set a unique ADMIN_PASSWORD of at least 12 characters before seeding the admin.");
    await prisma.user.create({ data: { email, name: process.env.ADMIN_NAME || "Store Owner", passwordHash: await bcrypt.hash(password, 12), role: "OWNER" } });
  }
  console.log("Categories and settings ready; no products invented.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
