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
 *   scripts/import-ezpawn-folder.ts    copies the real photos
 *   scripts/apply-ezpawn-intake.ts     writes the products, as DRAFT
 *   scripts/apply-shipping-facts.ts    packed weight and box size, with a
 *                                       MEASURED / ESTIMATED label
 *   scripts/go-live.ts                 publishes what is genuinely ready
 *
 * This seed refuses to report success if the storefront is empty, because an
 * empty shop and a fake shop are both a broken shop. It never invents stock to
 * paper over the difference.
 *
 * Idempotent: safe to re-run. Existing rows are updated, not duplicated.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATEGORY_TREE } from "../src/lib/category-tree";


const prisma = new PrismaClient();

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "2DE BARGAINS";

/** Rands. Free delivery above this order value. See the note at the usage below. */
const FREE_SHIPPING_ABOVE_RANDS = Number(process.env.FREE_SHIPPING_ABOVE_RANDS ?? 0);


async function main() {
  console.log(`Seeding ${BRAND}...`);

  // ---- Shipping configuration -------------------------------------------
  //
  // Created once, then never touched by a re-run, so that a deliberate change
  // made in the admin area is not silently undone by `npm run db:seed`.
  //
  // The locker limits below are the PNA size and weight limits. Delivery falls
  // back to courier for anything heavier, longer or bulkier, and the customer is
  // shown the courier price instead of being told a parcel is undeliverable.
  await prisma.shippingSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      lockerEnabled: false,
      ratesConfirmed: false,
      lockerMaxWeightGrams: 2000,
      lockerMaxLengthCm: 35,
      lockerMaxWidthCm: 30,
      lockerMaxHeightCm: 20,
      lockerMaxSumCm: 60,
      courierEnabled: true,
      deliverySurchargeCents: 0,
      freeShippingAboveCents: Math.round(FREE_SHIPPING_ABOVE_RANDS * 100),
      handlingFeeCents: 0,
    },
  });

  // No example tariffs: the owner enters confirmed Courier Guy rates in admin.
  for (const [index, node] of CATEGORY_TREE.entries()) {
    const category = await prisma.category.upsert({ where: { slug: node.slug }, update: {}, create: { slug: node.slug, name: node.name, description: node.description, sortOrder: index * 10 } });
    for (const [childIndex, child] of node.children.entries()) {
      await prisma.category.upsert({ where: { slug: child.slug }, update: {}, create: { slug: child.slug, name: child.name, parentId: category.id, sortOrder: childIndex } });
    }
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && !(await prisma.user.findUnique({ where: { email } }))) {
    if (!password || password.length < 12 || /CHANGEME/i.test(password)) throw new Error("Set a unique ADMIN_PASSWORD of at least 12 characters before seeding the admin.");
    await prisma.user.create({ data: { email, name: process.env.ADMIN_NAME || "Store Owner", passwordHash: await bcrypt.hash(password, 12), role: "OWNER" } });
  }
  console.log("Categories and settings ready; no products or shipping prices invented.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
