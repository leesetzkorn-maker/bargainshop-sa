import "server-only";

import { prisma } from "@/lib/db";
import { ownerNotificationEmail } from "@/lib/env";
import { absoluteUrl, contact } from "@/lib/brand";
import { issueOrderAccessToken } from "@/lib/order-access";
import { getPaymentProvider } from "@/lib/payments/registry";
import { SHIPPING_METHOD_LABELS, type ShippingMethod } from "@/lib/enums";
import { mailIdempotencyKey, sendMail } from "./send";
import {
  newOrderOwnerEmail,
  newOrderReceivedOwnerEmail,
  orderConfirmedEmail,
  orderReceivedCustomerEmail,
  orderRefundedEmail,
  orderSecuredOwnerEmail,
  orderShippedEmail,
} from "./templates";
import type { OrderMailContext } from "./types";

/**
 * Order lifecycle notifications.
 *
 * These are the only functions the rest of the app calls. They read the order
 * fresh from the database, build the context, and hand it to `sendMail`, which
 * records the outcome truthfully.
 *
 * Nothing here throws. Email is important but never load-bearing: if it fails,
 * the order is still perfectly valid and the admin can always contact the
 * customer using the details on the order.
 */

/** The order fields every template needs. Public-safe plus internal totals. */
const mailOrderSelect = {
  id: true,
  orderNumber: true,
  subtotalCents: true,
  shippingCents: true,
  totalCents: true,
  currency: true,
  status: true,
  paymentStatus: true,
  placedAt: true,
  deliveryFullName: true,
  deliveryEmail: true,
  deliveryPhone: true,
  deliveryLine1: true,
  deliveryLine2: true,
  deliverySuburb: true,
  deliveryCity: true,
  deliveryProvince: true,
  deliveryPostalCode: true,
  deliveryMethod: true,
  deliveryNotes: true,
  cancelReason: true,
  customer: { select: { fullName: true, email: true, phone: true } },
  items: {
    select: {
      itemIdSnapshot: true,
      nameSnapshot: true,
      conditionSnapshot: true,
      quantity: true,
      unitPriceCents: true,
      lineTotalCents: true,
    },
    orderBy: { id: "asc" },
  },
  payments: {
    select: { provider: true, status: true },
    orderBy: { createdAt: "asc" },
  },
  shipments: {
    select: { courierName: true, trackingNumber: true, trackingUrl: true, status: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

async function buildContext(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: mailOrderSelect,
  });

  if (!order) return null;

  const tracking = order.shipments.find((s) => s.trackingNumber) ?? order.shipments[0] ?? null;
  const provider = getPaymentProvider();
  const settled = order.payments.some(
    (payment) => payment.status === "PAID" || payment.status === "PARTIALLY_REFUNDED",
  );

  return {
    orderId: order.id,
    ctx: {
      orderNumber: order.orderNumber,
      orderUrl: absoluteUrl(`/order/${order.orderNumber}?t=${issueOrderAccessToken(order.orderNumber)}`),
      createdAt: order.placedAt,
      customerName: order.customer.fullName,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phone,
      items: order.items.map((item) => ({
        itemId: item.itemIdSnapshot,
        name: item.nameSnapshot,
        condition: item.conditionSnapshot,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.lineTotalCents,
      })),
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      currency: order.currency,
      delivery: {
        fullName: order.deliveryFullName,
        phone: order.deliveryPhone,
        line1: order.deliveryLine1,
        line2: order.deliveryLine2,
        suburb: order.deliverySuburb,
        city: order.deliveryCity,
        province: order.deliveryProvince,
        postalCode: order.deliveryPostalCode,
        method: order.deliveryMethod,
        notes: order.deliveryNotes,
      },
      // Never assert a payment that has not been recorded. The unpaid label is
      // the only one that shows on an order still in PENDING_PAYMENT, which is
      // the normal state of every offline order until the owner settles it.
      paymentMethodLabel: settled
        ? `${provider.canAcceptLivePayments ? provider.label : "Payment settled by the store"} (paid)`
        : provider.canAcceptLivePayments
          ? `${provider.label} (awaiting confirmation)`
          : "Arranged with the store (not yet paid)",
      // "Was the money real?" Read from the order AND the payment rows, because
      // an order refunded straight after payment still reads REFUNDED on the
      // header while the Payment row is the only proof it was ever settled.
      wasPaid: settled || order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED",
      tracking: tracking
        ? {
            courierName: tracking.courierName,
            trackingNumber: tracking.trackingNumber,
            trackingUrl: tracking.trackingUrl,
          }
        : null,
      reason: order.cancelReason,
    } satisfies OrderMailContext,
  };
}

/**
 * Fired the instant an order is committed, before any money has moved.
 *
 * This closes the one window where the store was previously silent. With no live
 * gateway an order sits in PENDING_PAYMENT until the owner deals with it, and
 * until this existed neither side heard anything: the customer had only a
 * confirmation screen, and the owner had no signal that a sale had come in.
 *
 * The owner alert is deliberately skipped when a live gateway is configured,
 * because that provider will report the payment itself and abandoned gateway
 * checkouts are visible as PENDING orders in the admin.
 */
export async function notifyOrderReceived(orderId: string): Promise<void> {
  const built = await buildContext(orderId);
  if (!built) return;
  const { ctx, orderId: id } = built;

  const provider = getPaymentProvider();
  const ownerEmail = ownerNotificationEmail();

  if (ownerEmail && !provider.canAcceptLivePayments) {
    const message = newOrderReceivedOwnerEmail(ctx);
    await sendMail("NEW_ORDER_RECEIVED_OWNER", {
      to: ownerEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: contact.email.includes("@") ? contact.email : undefined,
      orderId: id,
      idempotencyKey: mailIdempotencyKey(ctx.orderNumber, "NEW_ORDER_RECEIVED_OWNER"),
    });
  }

  const acknowledgement = orderReceivedCustomerEmail(ctx);
  await sendMail("ORDER_RECEIVED", {
    to: ctx.customerEmail,
    subject: acknowledgement.subject,
    html: acknowledgement.html,
    text: acknowledgement.text,
    orderId: id,
    idempotencyKey: mailIdempotencyKey(ctx.orderNumber, "ORDER_RECEIVED"),
  });
}

/**
 * The owner alert plus the customer confirmation, sent together once payment is
 * recorded. Idempotent: the idempotency key stops a retry double-sending.
 */
export async function notifyPaidOrder(orderId: string): Promise<void> {
  const built = await buildContext(orderId);
  if (!built) return;
  const { ctx, orderId: id } = built;

  const ownerEmail = ownerNotificationEmail();

  if (ownerEmail) {
    const message = newOrderOwnerEmail(ctx);
    await sendMail("NEW_ORDER_OWNER", {
      to: ownerEmail,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: contact.email.includes("@") ? contact.email : undefined,
      orderId: id,
      idempotencyKey: mailIdempotencyKey(ctx.orderNumber, "NEW_ORDER_OWNER"),
    });
  }

  const confirmation = orderConfirmedEmail(ctx);
  await sendMail("ORDER_CONFIRMED", {
    to: ctx.customerEmail,
    subject: confirmation.subject,
    html: confirmation.html,
    text: confirmation.text,
    orderId: id,
    idempotencyKey: mailIdempotencyKey(ctx.orderNumber, "ORDER_CONFIRMED"),
  });
}

/** Fires when the owner has bought the item from the shop. */
export async function notifyOwnerItemSecured(orderId: string): Promise<void> {
  const built = await buildContext(orderId);
  if (!built) return;
  const { ctx, orderId: id } = built;

  const ownerEmail = ownerNotificationEmail();
  if (!ownerEmail) return;

  const message = orderSecuredOwnerEmail(ctx);
  await sendMail("NEW_ORDER_OWNER", {
    to: ownerEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    orderId: id,
    idempotencyKey: mailIdempotencyKey(ctx.orderNumber, "NEW_ORDER_OWNER", "secured"),
  });
}

/** Fires when the order moves to SHIPPED, with whatever tracking exists. */
export async function notifyCustomerShipped(orderId: string): Promise<void> {
  const built = await buildContext(orderId);
  if (!built) return;
  const { ctx, orderId: id } = built;

  const message = orderShippedEmail(ctx);
  await sendMail("ORDER_SHIPPED", {
    to: ctx.customerEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    orderId: id,
    idempotencyKey: mailIdempotencyKey(ctx.orderNumber, "ORDER_SHIPPED"),
  });
}

/** Fires on cancel and on refund, so the customer is never left guessing. */
export async function notifyCustomerClosed(orderId: string, kind: "cancelled" | "refunded"): Promise<void> {
  const built = await buildContext(orderId);
  if (!built) return;
  const { ctx, orderId: id } = built;

  const message = orderRefundedEmail(ctx, kind);
  await sendMail(kind === "refunded" ? "ORDER_REFUNDED" : "ORDER_CANCELLED", {
    to: ctx.customerEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    orderId: id,
    idempotencyKey: mailIdempotencyKey(ctx.orderNumber, kind === "refunded" ? "ORDER_REFUNDED" : "ORDER_CANCELLED"),
  });
}

/** Human label for the delivery method, used in a couple of admin screens. */
export function deliveryMethodLabel(value: string): string {
  return SHIPPING_METHOD_LABELS[value as ShippingMethod] ?? value;
}
