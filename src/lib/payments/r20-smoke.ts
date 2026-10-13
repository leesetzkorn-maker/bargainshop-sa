/**
 * R20 admin-only Yoco end-to-end payment test.
 * This must NEVER produce a physical product order, deduct stock, or enter sales totals.
 * Only a signed, timestamp-verified Yoco webhook can mark it paid.
 */
import "server-only";

import { prisma } from "@/lib/db";

export const R20_PAYMENT_TEST_CENTS = 2000;
export const R20_PAYMENT_TEST_PREFIX = "R20TEST-";
export const R20_PAYMENT_TEST_META_PREFIX = "r20-smoke:";

const TEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseR20TestMetadata(orderId: string, orderNumber: string): string | null {
  if (!orderId.startsWith(R20_PAYMENT_TEST_META_PREFIX)) return null;
  const testId = orderId.slice(R20_PAYMENT_TEST_META_PREFIX.length);
  if (!TEST_ID.test(testId) || orderNumber !== R20_PAYMENT_TEST_PREFIX + testId) return null;
  return testId;
}

/**
 * Call ONLY after webhook signature AND freshness have been verified.
 * Signed event must match the fixed amount and the specific test we issued.
 * Idempotent: a duplicate signed webhook cannot double-settle the audit.
 */
export async function recordVerifiedR20YocoEvent(args: {
  testId: string;
  type: string;
  amount: number | undefined;
  currency: string | undefined;
  providerRef: string | undefined;
  eventId: string | undefined;
}) {
  if (!TEST_ID.test(args.testId)) return { received: true, settled: false, reason: "invalid_test_reference" };
  const record = await prisma.auditLog.findFirst({
    where: { entity: "payment_test", entityId: args.testId, action: { in: ["payment_test.started", "payment_test.awaiting", "payment_test.failed", "payment_test.paid"] } },
    select: { id: true, action: true },
  });
  if (!record) return { received: true, settled: false, reason: "unknown_test" };
  if (args.amount !== R20_PAYMENT_TEST_CENTS || args.currency !== "ZAR") {
    return { received: true, settled: false, reason: "test_amount_mismatch" };
  }
  if (args.type === "payment.failed") {
    await prisma.auditLog.updateMany({
      where: { id: record.id, action: { in: ["payment_test.started", "payment_test.awaiting"] } },
      data: { action: "payment_test.failed", meta: { amountCents: R20_PAYMENT_TEST_CENTS, currency: "ZAR", status: "FAILED", eventId: args.eventId ?? null } },
    });
    return { received: true, settled: false, reason: "test_payment_failed" };
  }
  if (args.type !== "payment.succeeded") {
    return { received: true, settled: false, reason: "ignored_test_event" };
  }
  const result = await prisma.auditLog.updateMany({
    where: { id: record.id, action: { in: ["payment_test.started", "payment_test.awaiting", "payment_test.failed"] } },
    data: {
      action: "payment_test.paid",
      meta: {
        amountCents: R20_PAYMENT_TEST_CENTS,
        currency: "ZAR",
        status: "PAID",
        providerRef: args.providerRef ?? null,
        eventId: args.eventId ?? null,
        verifiedBy: "signed_yoco_webhook",
        settledAt: new Date().toISOString(),
      },
    },
  });
  return { received: true, settled: true, alreadyPaid: result.count === 0 };
}
