/**
 * End-to-end check of the pawn-shop sourcing workflow against the real database.
 *
 * Walks one order through Paid -> Checking stock -> Item secured -> Preparing
 * shipment -> Shipped, then exercises the destructive path the business model
 * depends on: "the item could not be sourced", which refunds in full. Verifies
 * the stock maths and the email-log honesty at each step, then puts everything
 * back.
 */
import { PrismaClient } from "@prisma/client";
import { markItemsUnavailable, refundAdminOrder, updateAdminOrder } from "../../src/lib/dal/admin";
import { prisma as appPrisma } from "../../src/lib/db";
import type { FulfillmentStatus, OrderStatus, PaymentStatus } from "../../src/lib/enums";
import { ORDER_STATUS_TO_FULFILLMENT } from "../../src/lib/enums";
import type { OrderUpdateInput } from "../../src/lib/validation";

const db = new PrismaClient();

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`);
}

async function main() {
  const actor = await db.user.findFirstOrThrow();
  const order = await db.order.findFirstOrThrow({
    orderBy: { placedAt: "asc" },
    include: { items: true },
  });
  const productIds = order.items.map((i) => i.productId);
  const stockBefore = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, itemId: true, stockQty: true, status: true },
  });

  console.log(`\norder ${order.orderNumber} — ${order.items.length} line(s), was ${order.status}\n`);

  // ---- 1. Advance through the happy path -----------------------------------
  const steps: Array<[string, Partial<OrderUpdateInput>]> = [
    ["mark paid", { paymentStatus: "PAID" }],
    ["start checking stock", { orderStatus: "CHECKING_STOCK" }],
    ["item secured", { orderStatus: "ITEM_SECURED" }],
    ["start packing", { orderStatus: "PREPARING_SHIPMENT" }],
    ["handed to courier", { orderStatus: "SHIPPED", fulfillmentStatus: "DISPATCHED" }],
  ];

  for (const [label, patch] of steps) {
    // Re-read before every step, the way the admin form does: each button posts
    // the page as currently rendered, so the snapshot must never be stale.
    const current = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, paymentStatus: true, fulfillmentStatus: true },
    });

    const result = await updateAdminOrder(
      order.id,
      {
        orderStatus: current.status as OrderStatus,
        paymentStatus: current.paymentStatus as PaymentStatus,
        fulfillmentStatus: current.fulfillmentStatus as FulfillmentStatus,
        internalNotes: null,
        ...patch,
      },
      actor.id,
    );
    const after = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, fulfillmentStatus: true, stockCheckedAt: true, securedAt: true, shippedAt: true },
    });
    check(`${label} -> ${after.status}`, after.status, patch.orderStatus ?? after.status);
    // The two vocabularies must never drift apart.
    check(`  ${label} stage tracks status`, after.fulfillmentStatus, (patch.orderStatus ?? current.status) === "SHIPPED" ? "DISPATCHED" : ORDER_STATUS_TO_FULFILLMENT[(patch.orderStatus ?? current.status) as OrderStatus] ?? current.fulfillmentStatus);
    if (patch.orderStatus === "CHECKING_STOCK") check("  recorded stockCheckedAt", after.stockCheckedAt != null, true);
    if (patch.orderStatus === "ITEM_SECURED") check("  recorded securedAt", after.securedAt != null, true);
    if (patch.orderStatus === "SHIPPED") check("  recorded shippedAt", after.shippedAt != null, true);
    check(`  ${label} returned ok`, result.ok, true);
  }

  const emails = await db.emailLog.findMany({ where: { orderId: order.id }, select: { template: true, status: true } });
  console.log(`\n  email log: ${emails.map((e) => `${e.template}=${e.status}`).join(", ") || "none"}`);
  check(
    "no email is claimed SENT without a provider",
    emails.every((e) => e.status !== "SENT"),
    true,
  );
  console.log("");

  // ---- 2. The item could not be sourced -----------------------------------
  const unavailableResult = await markItemsUnavailable(
    order.id,
    productIds,
    "Supplier no longer stocks this model",
    true,
    actor.id,
  );
  check("mark item unavailable succeeds", unavailableResult.ok, true);

  const closed = await db.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { status: true, paymentStatus: true, cancelReason: true, refundedAt: true },
  });
  check("order closed as REFUNDED", closed.status, "REFUNDED");
  check("payment marked REFUNDED", closed.paymentStatus, "REFUNDED");
  check("reason recorded for the customer", closed.cancelReason, "Supplier no longer stocks this model");
  check("refundedAt stamped", closed.refundedAt != null, true);

  const line = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
  check("unavailable reason stored on the line", line.unavailableReason, "Supplier no longer stocks this model");

  const afterUnavailable = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, status: true, stockQty: true },
  });
  check(
    "products taken off the storefront",
    afterUnavailable.every((p) => p.status === "UNAVAILABLE"),
    true,
  );

  // Refunding an already-refunded order must be refused, not double-refunded.
  // This has to run while the order is still closed, i.e. before the restore.
  const stockAfterRefund = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, stockQty: true },
  });
  const double = await refundAdminOrder(order.id, actor.id, "duplicate refund attempt");
  check("refunding a closed order is refused", double.ok, false);
  const stockAfterDouble = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, stockQty: true },
  });
  check("a refused refund does not restock again", stockAfterDouble, stockAfterRefund);

  // ---- 3. Restore ---------------------------------------------------------
  for (const before of stockBefore) {
    await db.product.update({
      where: { id: before.id },
      data: { status: before.status, stockQty: before.stockQty },
    });
  }
  await db.order.update({
    where: { id: order.id },
    data: {
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      cancelReason: null,
      refundedAt: null,
      cancelledAt: null,
      stockCheckedAt: null,
      securedAt: null,
      shippedAt: null,
    },
  });
  await db.orderItem.updateMany({ where: { orderId: order.id }, data: { unavailableReason: null } });
  const payments = await db.payment.findMany({ where: { orderId: order.id }, select: { status: true } });
  for (const p of payments) {
    if (p.status === "REFUNDED") await db.payment.updateMany({ where: { orderId: order.id }, data: { status: "PENDING" } });
  }

  const restored = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { itemId: true, status: true, stockQty: true },
  });
  check("stock restored exactly", restored, stockBefore.map(({ itemId, status, stockQty }) => ({ itemId, status, stockQty })));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    await appPrisma.$disconnect();
  });
