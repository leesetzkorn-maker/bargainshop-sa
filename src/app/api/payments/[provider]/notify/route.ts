import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settleOrderPayment } from "@/lib/dal/orders";
import { isPayfastReferer, payfastCredentials } from "@/lib/payments/providers/payfast";
import {
  payfastSignaturesMatch,
  payfastSignature,
} from "@/lib/payments/providers/payfast-signature";

/**
 * PayFast Instant Transaction Notification.
 *
 * This endpoint is the only thing in the codebase allowed to mark an order paid
 * without a human. The browser's return from PayFast proves nothing — the URL is
 * guessable and anyone can type it — so a payment is settled here, from a
 * server-to-server POST, and only after every check below passes.
 *
 * PayFast expects a 200 for anything it cannot act on, and retries otherwise, so
 * every rejection is logged and answered 200. A rejection is a bug or an attack,
 * not a transient error, and retrying it would only hammer the store.
 */

export const runtime = "nodejs";
/** Never cache a money-affecting endpoint. */
export const dynamic = "force-dynamic";

function reject(reason: string, detail: Record<string, unknown> = {}): NextResponse {
  console.warn("payfast: ITN rejected", { reason, ...detail });
  return NextResponse.json({ received: true, settled: false, reason }, { status: 200 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;
  if (provider === "peach") return NextResponse.json({ received: false, settled: false, reason: "peach_integration_not_enabled" }, { status: 503 });
  if (provider !== "payfast") return reject("unsupported_provider", { provider });

  const creds = payfastCredentials();
  if (!creds) return reject("provider_not_configured");

  // --- 1. It has to be a PayFast POST -------------------------------
  if (!isPayfastReferer(request.headers.get("referer"))) {
    return reject("bad_referer", { referer: request.headers.get("referer") });
  }

  let posted: Record<string, string>;
  try {
    posted = Object.fromEntries((await request.formData()).entries()) as Record<string, string>;
  } catch {
    return reject("unreadable_body");
  }

  // --- 2. The signature has to be ours ------------------------------
  const expected = payfastSignature(posted, creds.passphrase);
  if (!payfastSignaturesMatch(expected, posted.signature)) {
    return reject("signature_mismatch", { m_payment_id: posted.m_payment_id });
  }

  // --- 3. And be for this merchant ----------------------------------
  if (posted.merchant_id !== creds.merchantId) {
    return reject("merchant_mismatch", { merchant_id: posted.merchant_id });
  }

  // --- 4. Only a completed payment settles an order -----------------
  if (posted.payment_status !== "COMPLETE") {
    return reject("not_complete", { payment_status: posted.payment_status });
  }

  // --- 5. Find the order, without trusting the browser ---------------
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        ...(posted.custom_int1 ? [{ id: posted.custom_int1 }] : []),
        ...(posted.m_payment_id ? [{ orderNumber: posted.m_payment_id }] : []),
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      totalCents: true,
      currency: true,
      status: true,
      paymentStatus: true,
    },
  });

  if (!order) return reject("order_not_found", { m_payment_id: posted.m_payment_id });
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return reject("order_closed", { orderNumber: order.orderNumber });
  }

  // --- 6. The amount has to be the amount we asked for ---------------
  // The signature already binds the amount, so this cannot be forged; it catches
  // a real payment arriving against a stale total after a price change.
  const paidCents = Math.round(Number.parseFloat(posted.amount_gross ?? "") * 100);
  if (!Number.isFinite(paidCents) || paidCents !== order.totalCents) {
    console.warn("payfast: amount mismatch", {
      orderNumber: order.orderNumber,
      expectedCents: order.totalCents,
      receivedCents: Number.isFinite(paidCents) ? paidCents : null,
    });
    return reject("amount_mismatch", { orderNumber: order.orderNumber });
  }

  // --- 7. Settle -----------------------------------------------------
  const result = await settleOrderPayment(order.id, {
    providerRef: posted.pf_payment_id || null,
    source: "webhook",
  });

  if (!result.ok) {
    return reject(result.error ?? "settle_failed", { orderNumber: order.orderNumber });
  }

  return NextResponse.json({ received: true, settled: true, alreadyPaid: result.alreadyPaid });
}

/** A GET here is a misconfiguration, not a payment. */
export async function GET() {
  return NextResponse.json({ error: "This endpoint only accepts PayFast notifications." }, { status: 405 });
}
