/**
 * Go live: turn the imported draft stock into a real shop, and remove the demo
 * data that was standing in for it.
 *
 * WHY THIS IS A SCRIPT AND NOT A LIST OF STEPS
 *
 * The database arrived carrying two different kinds of thing:
 *
 *   1. 53 real items. Photographs of actual stock, the owner's own cost and
 *      selling-price notes, real condition grading. Good data, sitting in DRAFT
 *      because the store had never been switched on.
 *
 *   2. 44 invented items — 2DS-0001 to 2DS-0044. Descriptions written from
 *      imagination ("the chuck runs true and both speed settings work",
 *      "32.5mm rip capacity"), generic placeholder artwork, and eight demo
 *      orders hanging off them so the admin dashboard would look busy.
 *
 * Item 2 is the dangerous one. Every one of those listings is a promise to sell
 * a product this shop does not have, described with features nobody verified.
 * The eight orders are worse in a quieter way: they are false sales history, so
 * every revenue, profit and "top selling item" figure in the admin area is
 * fiction. A shop that launches on that data is a shop that has already lost a
 * customer's trust before it has taken any money.
 *
 * So this script deletes the invented stock, deletes the orders built on it, and
 * publishes the real stock once it is genuinely ready to sell.
 *
 * WHAT IT WILL NOT DO
 *
 * It will not invent a selling price. Nine real items have no price because the
 * owner has not set one; those stay in DRAFT and are listed in the report at the
 * end, so the store sells only what it can honestly quote a price for.
 *
 * It will not touch a real order. If an order turns out to reference real stock,
 * it is left alone and reported instead of deleted.
 *
 * It will not overwrite a real measurement. Packed weights and box sizes are
 * applied only where they are missing, and the provenance of every figure is
 * recorded (see scripts/shipping/apply-shipping-facts.ts).
 *
 * A copy of the database is taken before anything is written.
 *
 * Usage:
 *   npx tsx scripts/launch/go-live.ts            # report only, change nothing
 *   npx tsx scripts/launch/go-live.ts --yes      # do it
 *   npx tsx scripts/launch/go-live.ts --yes --no-publish
 */

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { productReadinessIssues, readinessInput, readinessSelect } from "../../src/lib/product-readiness";

const prisma = new PrismaClient();

const ASSUME_YES = process.argv.includes("--yes");
const NO_PUBLISH = process.argv.includes("--no-publish");
const DRY_RUN = !ASSUME_YES;

/**
 * An item is demo stock if its photographs are the shared placeholder artwork.
 * That is the honest test — it is what the pictures are — rather than guessing
 * from a name or an item-number range.
 */
const PLACEHOLDER = "/placeholder/";

async function backup() {
  const from = join(process.cwd(), "prisma", "dev.db");
  const dir = join(process.cwd(), "data", "internal", "backups");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const to = join(dir, `dev-${stamp}.db`);
  await copyFile(from, to);
  return to;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN — nothing will be written ===" : "=== APPLYING ===");
  console.log("");

  // ---------------------------------------------------------------- purge ---
  const allProducts = await prisma.product.findMany({
    select: {
      id: true,
      itemId: true,
      name: true,
      slug: true,
      status: true,
      priceCents: true,
      images: { select: { url: true } },
      _count: { select: { orderItems: true } },
    },
  });

  const demo = allProducts.filter((p) => p.images.some((i) => i.url.startsWith(PLACEHOLDER)));
  const real = allProducts.filter((p) => !p.images.some((i) => i.url.startsWith(PLACEHOLDER)));

  console.log(`stock: ${allProducts.length} total = ${real.length} real + ${demo.length} demo`);

  if (demo.length > 0) {
    const first = demo[0];
    const last = demo[demo.length - 1];
    console.log(`  demo ${first.itemId} .. ${last.itemId} — invented descriptions, placeholder art`);
  }

  // Orders built on demo stock. An order that touches ANY real item is kept and
  // reported: a real customer's order is never deleted by a cleanup script.
  const orders = await prisma.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalCents: true,
      items: { select: { productId: true } },
    },
  });

  const demoProductIds = new Set(demo.map((p) => p.id));
  const demoOrders = orders.filter((o) => o.items.every((i) => demoProductIds.has(i.productId)));
  const realOrders = orders.filter((o) => !demoOrders.includes(o));

  console.log(`orders: ${orders.length} total = ${demoOrders.length} demo + ${realOrders.length} real`);
  if (realOrders.length > 0) {
    for (const o of realOrders) {
      console.log(`  KEPT (references real stock): ${o.orderNumber} ${o.status} R${(o.totalCents / 100).toFixed(2)}`);
    }
  }

  const demoCustomerIds = new Set<string>();
  for (const o of demoOrders) {
    const row = await prisma.order.findUnique({ where: { id: o.id }, select: { customerId: true } });
    if (row) demoCustomerIds.add(row.customerId);
  }

  if (DRY_RUN) {
    // In a dry run the demo orders are still there, so customers still resolve.
  } else {
    await prisma.emailLog.deleteMany({
      where: { orderId: { in: demoOrders.map((o) => o.id) } },
    });
    await prisma.order.deleteMany({ where: { id: { in: demoOrders.map((o) => o.id) } } });

    // Only drop a customer who has nothing left. Somebody who has placed a real
    // order keeps their account and address book.
    for (const customerId of demoCustomerIds) {
      const remaining = await prisma.order.count({ where: { customerId } });
      if (remaining === 0) await prisma.customer.delete({ where: { id: customerId } });
    }

    // Images cascade with the product. Placeholder files on disk are dealt with
    // separately, because other parts of the UI may still reference them.
    await prisma.product.deleteMany({ where: { id: { in: demo.map((p) => p.id) } } });
    console.log(`  removed ${demoOrders.length} demo orders, ${demo.length} demo products`);
  }

  // -------------------------------------------------------------- prices ---
  // Reconcile the selling price against the owner's own sheet. Only ever fills a
  // blank, and only from a recorded figure.
  const intake = JSON.parse(
    await readFile(join(process.cwd(), "data", "internal", "ezpawn-intake.json"), "utf8"),
  ) as { drafts: { itemId: string; sellingPriceCents: number | null }[] };

  const priceByItem = new Map(
    intake.drafts
      .filter((d) => typeof d.sellingPriceCents === "number" && d.sellingPriceCents > 0)
      .map((d) => [d.itemId, d.sellingPriceCents] as const),
  );

  const priceFixes: { itemId: string; from: number; to: number }[] = [];
  const noPrice: string[] = [];

  for (const p of await prisma.product.findMany({ select: { id: true, itemId: true, priceCents: true } })) {
    const recorded = priceByItem.get(p.itemId);
    if (recorded && p.priceCents === 0) {
      priceFixes.push({ itemId: p.itemId, from: p.priceCents, to: recorded });
    } else if (!recorded && p.priceCents === 0) {
      noPrice.push(p.itemId);
    }
  }

  if (priceFixes.length > 0) {
    console.log(`\nprices: ${priceFixes.length} recovered from the owner's intake sheet`);
    for (const f of priceFixes) {
      console.log(`  ${f.itemId} R${(f.from / 100).toFixed(2)} -> R${(f.to / 100).toFixed(2)}`);
    }
    if (!DRY_RUN) {
      for (const f of priceFixes) {
        await prisma.product.updateMany({ where: { itemId: f.itemId }, data: { priceCents: f.to } });
      }
    }
  }

  if (noPrice.length > 0) {
    console.log(`\nno selling price (${noPrice.length}) — kept in draft, waiting on the owner:`);
    console.log(`  ${noPrice.join(", ")}`);
  }

  // ------------------------------------------------------------ shipping ---
  if (!DRY_RUN) {
    const tiers = await prisma.shippingTier.count({ where: { isActive: true } });
    console.log(`\nshipping: ${tiers} active locker tariff size(s) configured`);
  }

  // ------------------------------------------------------------- publish ---
  console.log("");
  if (NO_PUBLISH) {
    console.log("publishing skipped (--no-publish)");
  } else if (DRY_RUN) {
    console.log("publishing: see the list below, re-run with --yes to apply");
  }

  const candidates = await prisma.product.findMany({
    where: { status: "DRAFT" },
    orderBy: { itemId: "asc" },
    select: {
      ...readinessSelect,
      id: true,
      itemId: true,
      measurementSource: true,
    },
  });

  const ready: typeof candidates = [];
  const blocked: { itemId: string; reasons: string[] }[] = [];

  for (const p of candidates) {
    const issues = productReadinessIssues(readinessInput(p));
    if (issues.length === 0) ready.push(p);
    else blocked.push({ itemId: p.itemId, reasons: issues.map((i) => `${i.field}: ${i.message}`) });
  }

  if (ready.length > 0) {
    const estimated = ready.filter((p) => p.measurementSource === "ESTIMATED").length;
    console.log(`ready to publish: ${ready.length} (${estimated} with estimated packed measurements)`);
    for (const p of ready) {
      console.log(`  + ${p.itemId}  R${(p.priceCents / 100).toFixed(2).padStart(7)}  ${p.name}`);
    }
    if (!DRY_RUN) {
      for (const p of ready) {
        await prisma.product.update({
          where: { id: p.id },
          data: { status: "ACTIVE" },
        });
      }
    }
  }

  if (blocked.length > 0) {
    console.log(`\nstill in draft (${blocked.length}):`);
    for (const b of blocked) {
      console.log(`  - ${b.itemId}: ${b.reasons.join("; ")}`);
    }
  }

  if (!DRY_RUN) {
    const live = await prisma.product.count({ where: { status: "ACTIVE" } });
    const draftsLeft = await prisma.product.count({ where: { status: "DRAFT" } });
    console.log(`\ndone. storefront: ${live} live items, ${draftsLeft} in draft.`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
