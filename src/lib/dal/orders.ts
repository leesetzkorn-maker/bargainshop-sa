import "server-only";
import { productReadinessIssues, readinessSelect } from "@/lib/product-readiness";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/registry";
import { getCourierProvider } from "@/lib/courier/registry";
import { getShippingSettings, getActiveShippingRules, toParcelLines } from "@/lib/dal/shipping";
import { calculateShipping, orderTotals } from "@/lib/shipping/engine";
import type { CheckoutInput } from "@/lib/validation";
import { ORDER_PREFIX, type OrderStatus, type ShippingMethod } from "@/lib/enums";
import { FULFILLMENT_TO_ORDER_STATUS, PAID_PAYMENT_STATUSES } from "@/lib/enums";
import { brand, absoluteUrl } from "@/lib/brand";

const ORDER_NUMBER_PREFIX = ORDER_PREFIX;

/**
 * Order creation.
 *
 * Two invariants this file exists to guarantee:
 *
 *  1. A one-of-a-kind item can never be sold twice. Stock is decremented inside
 *     the same transaction that creates the order, guarded by a
 *     `stockQty >= requested` condition. If two customers race for the last
 *     item, one transaction wins and the other is rejected outright.
 *
 *  2. The customer never dictates money. Prices, stock availability and the
 *     shipping price are all recomputed server-side from the database. The form
 *     only supplies contact and delivery details.
 *
 * Private fields (source cost, profit, admin notes) are written to the order but
 * are never returned to the customer and never serialised into a page.
 */

export interface CreateOrderResult {
  ok: boolean;
  orderId?: string;
  orderNumber?: string;
  /** Item total before delivery and any discount. */
  subtotalCents?: number;
  /** What the customer actually pays, including delivery and handling. */
  totalCents?: number;
  /** Where the customer should go next. Null means "stay and show instructions". */
  redirectUrl?: string;
  /** "GET" (default) follows redirectUrl; "POST" needs a signed form submit. */
  redirectMethod?: "GET" | "POST";
  /** Fields for a "POST" redirect, signature included. */
  redirectFields?: Record<string, string>;
  instructions?: string[];
  error?: string;
  /** Field-level problems, keyed by form field name. */
  fieldErrors?: Record<string, string[]>;
  /** Products that were unavailable, for a friendly message. */
  unavailable?: Array<{ name: string; reason: string }>;
}

/** Sequential, human-quotable order number: 2DS-2026-000137 */
async function nextOrderNumber(tx: {
  order: {
    count: () => Promise<number>;
    findUnique: (args: { where: { orderNumber: string }; select: { id: true } }) => Promise<{ id: string } | null>;
  };
}): Promise<string> {
  const year = new Date().getFullYear();

  // count() is not gapless and is not a reliable ordering under concurrency, so
  // the candidate is treated as a hint and confirmed against the unique index
  // *through the same transaction* before it is used.
  const start = await tx.order.count();
  for (let i = 0; i < 25; i += 1) {
    const candidate = `${ORDER_NUMBER_PREFIX}-${year}-${String(start + i + 1).padStart(6, "0")}`;
    const clash = await tx.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }

  // Suffix fallback. Deliberately not derived from the clock: two orders created in
  // the same millisecond would otherwise get the same fallback number.
  return `${ORDER_NUMBER_PREFIX}-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createOrderFromCheckout(
  cartEntries: Array<{ slug: string; quantity: number }>,
  input: CheckoutInput,
): Promise<CreateOrderResult> {
  if (cartEntries.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  const preferredMethod = input.deliveryMethod as ShippingMethod;

  // --- Re-read products server-side. `where: { status: ACTIVE }` means an
  // --- item archived a moment ago cannot be bought.
  const products = await prisma.product.findMany({
    where: { slug: { in: cartEntries.map((e) => e.slug) }, status: "ACTIVE" },
    select: {
      ...readinessSelect,
      id: true,
      itemId: true,
      sku: true,
      name: true,
      slug: true,
      condition: true,
      priceCents: true,
      stockQty: true,
      productWeightGrams: true,
      packageWeightGrams: true,
      lockerAllowed: true,
      courierAllowed: true,
      packageLengthCm: true,
      packageWidthCm: true,
      packageHeightCm: true,
      sourceCostCents: true, // private, used only for internal margin reporting
      images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });

  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const unavailable: Array<{ name: string; reason: string }> = [];
  const lines: Array<{ product: (typeof products)[number]; quantity: number }> = [];

  for (const entry of cartEntries) {
    const product = bySlug.get(entry.slug);
    if (!product) {
      unavailable.push({ name: entry.slug, reason: "This item is no longer available." });
      continue;
    }
    if (productReadinessIssues({ ...product, imageCount: product._count.images }).length) {
      unavailable.push({ name: product.name, reason: "This item is awaiting listing verification." });
      continue;
    }
    if (product.stockQty <= 0) {
      unavailable.push({ name: product.name, reason: "Sold out while it was in your cart." });
      continue;
    }
    const quantity = Math.min(entry.quantity, product.stockQty);
    if (quantity < 1) {
      unavailable.push({ name: product.name, reason: "No units left." });
      continue;
    }
    lines.push({ product, quantity });
  }

  if (unavailable.length || lines.length === 0) {
    return {
      ok: false,
      error: "None of the items in your cart are still available.",
      unavailable,
    };
  }

  // --- Server-side money
  const subtotalCents = lines.reduce(
    (sum, { product, quantity }) => sum + product.priceCents * quantity,
    0,
  );

  const [settings, rules] = await Promise.all([getShippingSettings(), getActiveShippingRules()]);
  const quote = calculateShipping(toParcelLines(lines), settings, rules, {
    subtotalCents,
    preferredMethod,
    destination: { province: input.province, postalCode: input.postalCode },
  });

  if (quote.error) {
    return { ok: false, error: quote.error, unavailable };
  }
  if (quote.method !== preferredMethod ||
      (input.quotedShippingCents != null && input.quotedShippingCents !== quote.shippingCents) ||
      (input.quotedSubtotalCents != null && input.quotedSubtotalCents !== subtotalCents)) {
    return { ok: false, error: "Your delivery option or price changed. Refresh checkout and review the new total before placing your order." };
  }

  const totals = orderTotals(quote);
  const chosenMethod = quote.method;

  // --- Transaction: reserve stock, create customer, order, items, payment, shipment.
  const provider = getPaymentProvider();
  const courier = getCourierProvider();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Guarded decrement. `updateMany` with a `stockQty >= quantity` filter is
      // the concurrency check: it only updates if the condition still holds.
      for (const { product, quantity } of lines) {
        const updated = await tx.product.updateMany({
          where: { id: product.id, status: "ACTIVE", priceCents: product.priceCents, stockQty: { gte: quantity } },
          data: { stockQty: { decrement: quantity } },
        });

        if (updated.count === 0) {
          // Someone else took the last unit between the read and this write.
          throw new StockConflictError(product.name);
        }

        // One-of-a-kind behaviour: the moment stock hits zero, the item is
        // marked sold out so it disappears from the storefront and cannot be
        // bought again. The row is kept, so order history stays intact.
        const after = await tx.product.findUnique({
          where: { id: product.id },
          select: { stockQty: true },
        });
        if (after && after.stockQty <= 0) {
          await tx.product.update({
            where: { id: product.id },
            data: { status: "SOLD_OUT", soldAt: new Date() },
          });
        }
      }

      const customer = await tx.customer.upsert({
        where: { email: input.email },
        create: {
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
        },
        update: { fullName: input.fullName, phone: input.phone },
        select: { id: true },
      });

      const orderNumber = await nextOrderNumber(tx as never);

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          deliveryFullName: input.fullName,
          deliveryPhone: input.phone,
          deliveryEmail: input.email,
          deliveryLine1: input.line1,
          deliveryLine2: input.line2 ?? null,
          deliverySuburb: input.suburb,
          deliveryCity: input.city,
          deliveryProvince: input.province,
          deliveryPostalCode: input.postalCode,
          deliveryCountry: "ZA",
          deliveryMethod: chosenMethod,
          deliveryNotes: [chosenMethod === "LOCKER" ? `Pickup point: ${input.pickupPoint}` : "", input.orderNotes].filter(Boolean).join("\n") || null,
          subtotalCents: totals.subtotalCents,
          shippingCents: totals.shippingCents,
          totalCents: totals.totalCents,
          currency: brand.currency,
          status: "PENDING_PAYMENT",
          paymentStatus: "UNPAID",
          fulfillmentStatus: "NOT_FULFILLED",
          // Persist the quote so the price the customer agreed to is auditable.
          // Cast through a plain object: Prisma's Json input type requires an
          // index signature, which the Parcel interface does not have.
          shippingQuote: {
            parcel: { ...quote.parcel },
            method: quote.method,
            baseShippingCents: quote.baseShippingCents,
            deliverySurchargeCents: quote.deliverySurchargeCents,
            handlingFeeCents: quote.handlingFeeCents,
            discountCents: quote.discountCents,
            freeShippingApplied: quote.freeShippingApplied,
            lockerEligible: quote.lockerEligible,
            matchedRule:
              quote.methods.find((m) => m.method === chosenMethod)?.matchedRuleName ?? null,
            calculatedAt: new Date().toISOString(),
          } as object,
          items: {
            create: lines.map(({ product, quantity }) => ({
              productId: product.id,
              itemIdSnapshot: product.itemId,
              skuSnapshot: product.sku,
              nameSnapshot: product.name,
              imageUrlSnapshot: product.images[0]?.url ?? null,
              conditionSnapshot: product.condition,
              unitPriceCents: product.priceCents,
              quantity,
              lineTotalCents: product.priceCents * quantity,
              unitProductWeightGrams: product.productWeightGrams,
              unitPackageWeightGrams: product.packageWeightGrams,
              packageLengthCm: product.packageLengthCm,
              packageWidthCm: product.packageWidthCm,
              packageHeightCm: product.packageHeightCm,
              // private margin snapshot
              unitSourceCostCents: product.sourceCostCents,
            })),
          },
          payments: {
            create: {
              provider: provider.key,
              amountCents: totals.totalCents,
              currency: brand.currency,
              status: "INITIATED",
            },
          },
          shipments: {
            create: {
              courier: courier.key,
              courierName: null,
              status: "PENDING",
              parcelWeightGrams: quote.parcel.weightGrams,
              parcelLengthCm: quote.parcel.lengthCm,
              parcelWidthCm: quote.parcel.widthCm,
              parcelHeightCm: quote.parcel.heightCm,
            },
          },
        },
        select: { id: true, orderNumber: true, subtotalCents: true, totalCents: true },
      });

      return order;
    });

    // --- Payment session, outside the transaction. If the gateway throws, the
    // --- order still exists as PENDING_PAYMENT and an admin can resolve it.
    let paymentResult = null;
    try {
      paymentResult = await provider.createPaymentSession({
        orderId: result.id,
        orderNumber: result.orderNumber,
        amountCents: result.totalCents,
        currency: brand.currency,
        customer: { fullName: input.fullName, email: input.email, phone: input.phone },
        delivery: {
          method: chosenMethod,
          province: input.province,
          city: input.city,
          postalCode: input.postalCode,
          line1: input.line1,
        },
        lines: lines.map(({ product, quantity }) => ({
          name: product.name,
          amountCents: product.priceCents,
          quantity,
          url: absoluteUrl(`/product/${product.slug}`),
        })),
        successUrl: absoluteUrl(`/order/${result.orderNumber}?paid=1`),
        cancelUrl: absoluteUrl("/checkout?cancelled=1"),
        notifyUrl: absoluteUrl(`/api/payments/${provider.key}/notify`),
      });

      await prisma.payment.updateMany({
        where: { orderId: result.id },
        data: {
          providerRef: paymentResult.providerRef,
          status: "PENDING",
          rawPayload: (paymentResult.raw ?? undefined) as never,
        },
      });
    } catch (error) {
      // Never fail the order because a payment module misbehaved; flag it loudly
      // in the audit trail instead.
      await prisma.auditLog.create({
        data: {
          action: "payment.session_failed",
          entity: "order",
          entityId: result.id,
          meta: {
            provider: provider.key,
            message: error instanceof Error ? error.message : "Unknown error",
          },
        },
      });
    }

    return {
      ok: true,
      orderId: result.id,
      orderNumber: result.orderNumber,
      subtotalCents: result.subtotalCents,
      totalCents: result.totalCents,
      redirectUrl: paymentResult?.redirectUrl ?? undefined,
      redirectMethod: paymentResult?.redirectMethod,
      redirectFields: paymentResult?.redirectFields,
      instructions: paymentResult?.instructions ?? undefined,
      unavailable,
    };
  } catch (error) {
    if (error instanceof StockConflictError) {
      return {
        ok: false,
        error: `"${error.productName}" was sold while you were checking out. Your cart has been updated — please review it and try again.`,
        unavailable: [{ name: error.productName, reason: "Sold out just now." }],
      };
    }
    throw error;
  }
}

class StockConflictError extends Error {
  constructor(public readonly productName: string) {
    super(`Stock conflict for ${productName}`);
    this.name = "StockConflictError";
  }
}

/**
 * Record that money has arrived for an order.
 *
 * Single entry point shared by the admin "Mark paid" button and — once a real
 * gateway is connected — its webhook. Both paths must produce the same state,
 * so neither of them is allowed to set the status fields directly.
 *
 * Fires the owner alert and the customer confirmation. Email failures are
 * swallowed by the mail layer and recorded, never thrown, so a mail outage
 * cannot undo a genuine payment.
 */
export async function settleOrderPayment(
  orderId: string,
  opts: { actorId?: string | null; providerRef?: string | null; source?: string } = {},
): Promise<{ ok: boolean; alreadyPaid: boolean; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true, paymentStatus: true, fulfillmentStatus: true },
  });

  if (!order) return { ok: false, alreadyPaid: false, error: "That order no longer exists." };
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, alreadyPaid: false, error: "This order is already closed." };
  }

  const alreadyPaid = PAID_PAYMENT_STATUSES.includes(order.paymentStatus as never);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const latest = await tx.order.findUnique({
      where: { id: orderId },
      select: { paymentStatus: true, fulfillmentStatus: true, paidAt: true },
    });
    if (!latest) return;

    const derived = syncOrderStatus({
      paymentStatus: "PAID",
      fulfillmentStatus: latest.fulfillmentStatus,
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "PAID",
        // Preserve the stage the order is already in; only the headline moves.
        status: derived.status,
        paidAt: latest.paidAt ?? now,
      },
    });

    await tx.payment.updateMany({
      where: { orderId, status: { in: ["INITIATED", "PENDING", "AUTHORISED"] } },
      data: {
        status: "PAID",
        settledAt: now,
        settledBy: opts.source ?? (opts.actorId ? `admin:${opts.actorId}` : "webhook"),
        ...(opts.providerRef ? { providerRef: opts.providerRef } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: opts.actorId ?? null,
        action: alreadyPaid ? "order.payment_reconfirmed" : "order.payment_settled",
        entity: "order",
        entityId: orderId,
        meta: { orderNumber: order.orderNumber, source: opts.source ?? "admin" },
      },
    });
  });

  // Only announce a genuine first settlement, so a re-click does not spam the
  // customer's inbox.
  if (!alreadyPaid) {
    const { notifyPaidOrder } = await import("@/lib/mail/order-notifications");
    await notifyPaidOrder(orderId);
  }

  return { ok: true, alreadyPaid };
}

/**
 * Restore stock when an order is cancelled or refunded.
 *
 * Only the state this order itself caused is reversed. If an admin has since
 * archived or re-drafted the product on purpose, the stock is still returned but
 * the status is left alone — cancelling an old order must not silently
 * re-publish an item somebody deliberately pulled.
 */
export async function restockOrder(orderId: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true, items: { select: { productId: true, quantity: true } } },
    });
    if (!order) return;
    if (order.status === "CANCELLED" || order.status === "REFUNDED") return; // already done

    for (const item of order.items) {
      const current = await tx.product.findUnique({
        where: { id: item.productId },
        select: { status: true },
      });

      // SOLD_OUT is the state the sale produced, so it is the one we undo.
      const restoreStatus = current?.status === "SOLD_OUT" ? "ACTIVE" : undefined;

      await tx.product.update({
        where: { id: item.productId },
        data: {
          stockQty: { increment: item.quantity },
          ...(restoreStatus ? { status: restoreStatus, soldAt: null } : {}),
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date(), fulfillmentStatus: "RETURNED" },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "order.cancelled_restocked",
        entity: "order",
        entityId: orderId,
      },
    });
  });
}

/**
 * Derive the headline order status from payment + fulfilment stage.
 *
 * This is the ONLY place the relationship is expressed, so an order's headline
 * status can never disagree with the stage it is actually in. The workflow is
 * the real one for this business: a customer pays, we go and buy the item at
 * the shop, then we pack and ship it.
 */
export function syncOrderStatus(input: {
  paymentStatus: string;
  fulfillmentStatus: string;
}): { status: OrderStatus; paidAt?: Date; shippedAt?: Date; deliveredAt?: Date } {
  const now = new Date();
  const paid = PAID_PAYMENT_STATUSES.includes(input.paymentStatus as never);

  const fromStage = FULFILLMENT_TO_ORDER_STATUS[input.fulfillmentStatus as keyof typeof FULFILLMENT_TO_ORDER_STATUS];

  const status: OrderStatus =
    input.paymentStatus === "REFUNDED"
      ? "REFUNDED"
      : paid
        ? (fromStage ?? "PAID")
        : "PENDING_PAYMENT";

  const out: { status: OrderStatus; paidAt?: Date; shippedAt?: Date; deliveredAt?: Date } = { status };
  if (paid) out.paidAt = now;
  if (status === "SHIPPED" || status === "DELIVERED") out.shippedAt = now;
  if (status === "DELIVERED") out.deliveredAt = now;
  return out;
}


/** Used by the confirmation page and the customer order lookup. */
export async function getOrderForCustomer(orderNumber: string) {
  return prisma.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      subtotalCents: true,
      shippingCents: true,
      totalCents: true,
      currency: true,
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
      placedAt: true,
      paidAt: true,
      stockCheckedAt: true,
      securedAt: true,
      shippedAt: true,
      deliveredAt: true,
      /**
       * Safe to show the customer: they were told this reason at the time, and
       * knowing why an order died is far better service than silence.
       */
      cancelReason: true,
      // Public-ish: the customer needs to know what they bought.
      items: {
        select: {
          id: true,
          itemIdSnapshot: true,
          nameSnapshot: true,
          imageUrlSnapshot: true,
          conditionSnapshot: true,
          unitPriceCents: true,
          quantity: true,
          lineTotalCents: true,
        },
      },
      payments: {
        select: { id: true, status: true, amountCents: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      shipments: {
        select: {
          id: true,
          courierName: true,
          trackingNumber: true,
          trackingUrl: true,
          status: true,
          dispatchedAt: true,
          deliveredAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
