import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settleOrderPayment } from "@/lib/dal/orders";
import { isPayfastReferer, payfastCredentials } from "@/lib/payments/providers/payfast";
import {
  payfastSignaturesMatch,
  payfastSignature,
} from "@/lib/payments/providers/payfast-signature";
import {
  yocoExpectedSignature,
  yocoSignaturesMatch,
  yocoSignedContent,
  yocoTimestampIsFresh,
} from "@/lib/payments/providers/yoco-core";
import { yocoCredentials } from "@/lib/payments/providers/yoco";

/**
 * Payment gateway notifications.
 *
 * This endpoint is the only thing in the codebase allowed to mark an order paid
 * without a human. The browser's return from a gateway proves nothing — the URL
 * is guessable and anyone can type it — so a payment is settled here, from a
 * server-to-server POST, and only after every check below passes.
 *
 * Two gateways share it, each verifying its own way:
 *   payfast  form-encoded ITN, MD5 signature over a sorted parameter string
 *   yoco     JSON webhook, HMAC-SHA256 over `id.timestamp.body` (Standard Webhooks)
 *
 * PayFast expects a 200 for anything it cannot act on, and retries otherwise, so
 * every rejection there is logged and answered 200. A rejection is a bug or an
 * attack, not a transient error, and retrying it would only hammer the store.
 * Yoco answers the same way for anything it cannot act on, but 401 for a
 * delivery that is not authentically ours, so a forged POST is never mistaken
 * for a accepted one.
 */

export const runtime = "nodejs";
/** Never cache a money-affecting endpoint. */
export const dynamic = "force-dynamic";

function reject(reason: string, detail: Record<string, unknown> = {}): NextResponse {
  console.warn("payfast: ITN rejected", { reason, ...detail });
  return NextResponse.json({ received: true, settled: false, reason }, { status: 200 });
}

/** Yoco's answer for the same situation. `settled: false` never claims money arrived. */
function yocoReject(status: number, reason: string, detail: Record<string, unknown> = {}): NextResponse {
  console.warn("yoco: webhook rejected", { reason, status, ...detail });
  return NextResponse.json({ received: status < 400, settled: false, reason }, { status });
}

type YocoWebhookEvent = {
  id?: string;
  type?: string;
  payload?: {
    id?: string;
    type?: string;
    amount?: number;
    currency?: string;
    mode?: string;
    metadata?: Record<string, unknown> | null;
  };
};

function yocoIgnore(reason: string, eventId?: string): NextResponse {
  return NextResponse.json({ received: true, settled: false, reason, eventId: eventId ?? null }, { status: 200 });
}

/**
 * Yoco Checkout webhook.
 *
 * Verification is done on the raw body before a single byte of it is parsed:
 * re-serialising the JSON would change the bytes and therefore the signature.
 * Only a `payment.succeeded` event whose amount and currency match the order we
 * created may settle it, and the order is looked up from metadata we wrote
 * server-side, never from anything the browser sent.
 */
async function yocoNotify(request: Request): Promise<NextResponse> {
  const creds = yocoCredentials();
  if (!creds) return yocoReject(401, "provider_not_configured");

  const webhookId = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!webhookId || !timestamp || !signature) return yocoReject(401, "missing_signature_headers");
  if (!yocoTimestampIsFresh(timestamp)) {
    return yocoReject(401, "stale_timestamp", { webhookId });
  }

  const rawBody = await request.text();
  const expected = yocoExpectedSignature(
    creds.webhookSecret,
    yocoSignedContent(webhookId, timestamp, rawBody),
  );
  if (!expected || !yocoSignaturesMatch(expected, signature)) {
    return yocoReject(401, "signature_mismatch", { webhookId });
  }

  let event: YocoWebhookEvent;
  try {
    event = JSON.parse(rawBody) as YocoWebhookEvent;
  } catch {
    return yocoReject(200, "unreadable_payload", { webhookId });
  }

  const payload = event.payload;
  if (!payload || payload.type !== "payment") return yocoIgnore("not_a_payment_event", event.id);

  // A failed card attempt is expected, not an error. It is reported so the
  // retry schedule stops, and it must never settle anything.
  if (event.type === "payment.failed") return yocoIgnore("payment_failed", event.id);
  if (event.type !== "payment.succeeded") return yocoIgnore("ignored_event_type", event.id);

  const metadata = payload.metadata ?? {};
  const orderId = typeof metadata.orderId === "string" ? metadata.orderId : "";
  const orderNumber = typeof metadata.orderNumber === "string" ? metadata.orderNumber : "";
  if (!orderId && !orderNumber) return yocoIgnore("missing_order_metadata", event.id);

  const order = await prisma.order.findFirst({
    where: {
      OR: [...(orderId ? [{ id: orderId }] : []), ...(orderNumber ? [{ orderNumber }] : [])],
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

  if (!order) return yocoIgnore("order_not_found", event.id);
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return yocoIgnore("order_closed", event.id);
  }

  // The amount is inside the signed body, so it cannot be forged; this catches a
  // real payment landing against a stale total after a price or stock change.
  if (payload.currency !== order.currency || payload.amount !== order.totalCents) {
    console.warn("yoco: amount mismatch", {
      orderNumber: order.orderNumber,
      expectedCents: order.totalCents,
      expectedCurrency: order.currency,
      receivedCents: payload.amount ?? null,
      receivedCurrency: payload.currency ?? null,
    });
    return yocoReject(200, "amount_mismatch", { eventId: event.id });
  }

  const result = await settleOrderPayment(order.id, {
    providerRef: payload.id ?? null,
    source: "webhook",
  });

  if (!result.ok) {
    return yocoReject(200, result.error ?? "settle_failed", { orderNumber: order.orderNumber });
  }

  return NextResponse.json({ received: true, settled: true, alreadyPaid: result.alreadyPaid });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;
  if (provider === "yoco") return yocoNotify(request);
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
  return NextResponse.json(
    { error: "This endpoint only accepts server-to-server payment notifications." },
    { status: 405 },
  );
}
