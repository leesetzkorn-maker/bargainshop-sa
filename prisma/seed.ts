/**
 * Database seed — configuration only.
 *
 * Creates: the admin account, the category tree, and the shipping configuration
 * the store needs before the first order arrives.
 *
 * Creates no physical/demo stock. A single owner-requested R20 non-physical\n * payment-checkout test item is an explicit exception. An earlier version of this file invented 44
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
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { uploadsRoot } from "../src/lib/data-paths";
import {
  CHECKOUT_TEST_ITEM_ID,
  CHECKOUT_TEST_SKU,
  CHECKOUT_TEST_SLUG,
  CHECKOUT_TEST_NAME,
  CHECKOUT_TEST_PRICE_CENTS,
  CHECKOUT_TEST_IMAGE_URL,
} from "../src/lib/checkout-test";
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
  // ONE owner-requested exception to the no-demo-products policy:
  // a clearly labeled NON-PHYSICAL R20 payment test, not a pretend bargain.
  // The normal storefront checkout and Yoco webhook process this purchase.
  // It stays out of public browse/search/sitemap; owner opens the direct link.
  const testCategory = await prisma.category.findUnique({
    where: { slug: "other-bargains" }, select: { id: true },
  });
  if (!testCategory) throw new Error("Required category for the payment test does not exist.");

  const testPicturePath = join(uploadsRoot(), "products", "r20-checkout-test.png");
  await mkdir(join(uploadsRoot(), "products"), { recursive: true });
  const testSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <rect width="800" height="800" fill="#122e29"/>
    <rect x="32" y="32" width="736" height="736" rx="50" fill="#f7f7f0"/>
    <text x="400" y="265" font-family="Arial,sans-serif" font-size="76" font-weight="bold" text-anchor="middle" fill="#122e29">R20</text>
    <text x="400" y="345" font-family="Arial,sans-serif" font-size="46" font-weight="bold" text-anchor="middle" fill="#122e29">PAYMENT TEST</text>
    <line x1="120" y1="390" x2="680" y2="390" stroke="#122e29" stroke-width="4"/>
    <text x="400" y="470" font-family="Arial,sans-serif" font-size="30" text-anchor="middle" fill="#333">Real checkout and payment</text>
    <text x="400" y="525" font-family="Arial,sans-serif" font-size="30" text-anchor="middle" fill="#333">No physical goods shipped</text>
    <text x="400" y="670" font-family="Arial,sans-serif" font-size="32" font-weight="bold" text-anchor="middle" fill="#122e29">2DE BARGAINS</text>
  </svg>`;
  await sharp(Buffer.from(testSvg)).png().toFile(testPicturePath);
  if (!(await prisma.product.findUnique({ where: { sku: CHECKOUT_TEST_SKU }, select: { id: true } }))) {
    await prisma.product.create({
      data: {
        itemId: CHECKOUT_TEST_ITEM_ID,
        sku: CHECKOUT_TEST_SKU,
        slug: CHECKOUT_TEST_SLUG,
        name: CHECKOUT_TEST_NAME,
        description: "OWNER CHECKOUT TEST ONLY. This is a REAL R20 card payment using the same shopping cart, checkout, Yoco gateway and payment confirmation as regular products. No physical goods, delivery, or shipment are included. Only purchase if you own the store and intend to test the payments.",
        categoryId: testCategory.id,
        condition: "GOOD",
        conditionNote: "Not a physical second-hand item. Gateway testing only.",
        itemReviewConfirmed: true,
        sourceCostCents: 0,
        testingStatus: "NOT_TESTED",
        priceCents: CHECKOUT_TEST_PRICE_CENTS,
        priceManualOverride: true,
        productWeightGrams: 1,
        packageWeightGrams: 0,
        packageLengthCm: 1,
        packageWidthCm: 1,
        packageHeightCm: 1,
        measurementSource: "ESTIMATED",
        lockerAllowed: false,
        courierAllowed: false,
        stockQty: 10,
        status: "ACTIVE",
        isFeatured: false,
        adminNotes: "Owner R20 full-checkout smoke test. Real money; no goods, courier, or physical fulfilment. Do not dispatch.",
        images: { create: { url: CHECKOUT_TEST_IMAGE_URL, alt: "R20 owner payment checkout test — no goods supplied", sortOrder: 0 } },
      },
    });
    console.log("Owner R20 checkout test item created; no real stock was invented.");
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const ownerExists = await prisma.user.findFirst({ where: { role: "OWNER" }, select: { id: true } });
  if (!ownerExists && email && !(await prisma.user.findUnique({ where: { email } }))) {
    if (!password || password.length < 12 || /CHANGEME/i.test(password)) throw new Error("Set a unique ADMIN_PASSWORD of at least 12 characters before seeding the admin.");
    await prisma.user.create({ data: { email, name: process.env.ADMIN_NAME || "Store Owner", passwordHash: await bcrypt.hash(password, 12), role: "OWNER" } });
  }
  // One-off owner-requested inventory status change, 14 October 2026.
  // Identify the exact photographed Ryobi drill by its unique item number and
  // the price/name shown on the public product page; do not touch other stock.
  const soldRyobi = await prisma.product.findUnique({
    where: { itemId: "2DS-0097" },
    select: { id: true, name: true, priceCents: true, status: true, stockQty: true },
  });
  if (!soldRyobi || soldRyobi.priceCents !== 146800 ||
      !soldRyobi.name.toLowerCase().includes("ryobi 18v cordless impact drill")) {
    console.warn("Sold-item request 2DS-0097: no exact item/name/price match; inventory unchanged.");
  } else if (soldRyobi.status === "SOLD_OUT" && soldRyobi.stockQty === 0) {
    console.log("Sold-item request 2DS-0097: already SOLD_OUT with zero stock.");
  } else {
    await prisma.product.update({
      where: { id: soldRyobi.id },
      data: { status: "SOLD_OUT", stockQty: 0, soldAt: new Date() },
    });
    console.log("Sold-item request 2DS-0097: marked SOLD_OUT, stock zero; other items unchanged.");
  }

  console.log("Categories and settings ready; no physical demo products invented.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
