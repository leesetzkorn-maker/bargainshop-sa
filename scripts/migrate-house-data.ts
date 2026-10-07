/**
 * One-off data migration. Safe to re-run.
 *
 * Three jobs:
 *  1. Renumber every product item id to the `2DS-0001` house format, and every
 *     order number / order-item snapshot to match. Ids stay stable per product;
 *     only the human-facing reference changes.
 *  2. Rebuild the category tree as the eight main categories plus their
 *     sub-categories, reusing existing rows wherever the slug already exists.
 *  3. Move legacy workflow values onto the new pawn-shop vocabulary
 *     (PROCESSING -> CHECKING_STOCK, PACKED -> ITEM_SECURED).
 *
 * Run with: npx tsx scripts/migrate-house-data.ts
 */
import { PrismaClient } from "@prisma/client";
import { CATEGORY_SLUGS, CATEGORY_TREE } from "../src/lib/category-tree";

const prisma = new PrismaClient();

const ITEM_PREFIX = "2DS";
const ORDER_PREFIX = "2DS";
const SKU_PREFIX = "SKU-2DS";

const LEGACY_ORDER_STATUS: Record<string, string> = {
  PROCESSING: "CHECKING_STOCK",
  PACKED: "ITEM_SECURED",
};

const LEGACY_FULFILLMENT_STATUS: Record<string, string> = {
  PICKING: "CHECKING_STOCK",
  PACKED: "PREPARING_SHIPMENT",
  CHECKING_STOCK: "CHECKING_STOCK",
  ITEM_SECURED: "ITEM_SECURED",
  PREPARING_SHIPMENT: "PREPARING_SHIPMENT",
};

async function renumberProducts() {
  const products = await prisma.product.findMany({
    select: { id: true, itemId: true, sku: true },
    orderBy: { createdAt: "asc" },
  });

  for (const [index, product] of products.entries()) {
    const n = String(index + 1).padStart(4, "0");
    const nextItemId = `${ITEM_PREFIX}-${n}`;
    const nextSku = `${SKU_PREFIX}-${n}`;
    if (product.itemId === nextItemId && product.sku === nextSku) continue;

    await prisma.$transaction([
      prisma.product.update({ where: { id: product.id }, data: { itemId: nextItemId, sku: nextSku } }),
      prisma.orderItem.updateMany({
        where: { productId: product.id },
        data: { itemIdSnapshot: nextItemId, skuSnapshot: nextSku },
      }),
    ]);
  }
  console.log(`  products renumbered: ${products.length}`);
}

async function renumberOrders() {
  const orders = await prisma.order.findMany({ select: { id: true, orderNumber: true } });
  for (const order of orders) {
    if (order.orderNumber.startsWith(`${ORDER_PREFIX}-`)) continue;
    const suffix = order.orderNumber.replace(/^[A-Z0-9]+-/, "");
    const next = `${ORDER_PREFIX}-${suffix}`;
    await prisma.order.update({ where: { id: order.id }, data: { orderNumber: next } });
  }
  console.log(`  orders renumbered: ${orders.length}`);
}

async function rebuildCategories() {
  const existing = new Map(
    (await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]),
  );

  let mainOrder = 0;
  for (const main of CATEGORY_TREE) {
    const mainId =
      existing.get(main.slug) ??
      (await prisma.category.create({ data: { slug: main.slug, name: main.name } })).id;

    await prisma.category.update({
      where: { id: mainId },
      data: { name: main.name, description: main.description, parentId: null, sortOrder: mainOrder, isActive: true },
    });

    let childOrder = 0;
    for (const child of main.children) {
      const childId =
        existing.get(child.slug) ??
        (await prisma.category.create({ data: { slug: child.slug, name: child.name } })).id;
      await prisma.category.update({
        where: { id: childId },
        data: { name: child.name, parentId: mainId, sortOrder: childOrder, isActive: true },
      });
      childOrder += 1;
    }
    mainOrder += 1;
  }

  // Anything left over (a category an admin created by hand) is parked under
  // "Other Bargains" rather than left as an orphan at the top level.
  const keep = CATEGORY_SLUGS;
  const orphans = await prisma.category.findMany({
    where: { slug: { notIn: [...keep] } },
    select: { id: true, slug: true },
  });
  const otherId = existing.get("other-bargains");
  for (const orphan of orphans) {
    await prisma.category.update({
      where: { id: orphan.id },
      data: { parentId: otherId ?? null, sortOrder: 90 },
    });
    console.log(`  parked stray category: ${orphan.slug}`);
  }

  console.log(`  categories: ${CATEGORY_TREE.length} main + ${CATEGORY_TREE.reduce((n, m) => n + m.children.length, 0)} sub`);
}

async function migrateStatuses() {
  const orders = await prisma.order.findMany({
    select: { id: true, status: true, fulfillmentStatus: true },
  });

  for (const order of orders) {
    const status = LEGACY_ORDER_STATUS[order.status] ?? order.status;
    const fulfillment = LEGACY_FULFILLMENT_STATUS[order.fulfillmentStatus] ?? order.fulfillmentStatus;
    if (status === order.status && fulfillment === order.fulfillmentStatus) continue;

    await prisma.order.update({
      where: { id: order.id },
      data: { status, fulfillmentStatus: fulfillment },
    });
  }
  console.log(`  orders migrated: ${orders.length}`);
}

async function main() {
  console.log("Migrating house data…");
  await renumberProducts();
  await renumberOrders();
  await rebuildCategories();
  await migrateStatuses();
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
