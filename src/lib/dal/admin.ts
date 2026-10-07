import "server-only";

/**
 * PRIVATE admin data access.
 *
 * Everything in this file is admin-only and includes fields that must never
 * reach a customer page: `sourceCostCents`, `supplierNotes`, `adminNotes`,
 * `internalNotes`, payment `rawPayload`, shipment `notes` and customer contact
 * details.
 *
 * Rules for this module:
 *   1. `import "server-only"` so it can never be pulled into a client bundle.
 *   2. Every query uses an explicit `select` — never `findMany()` bare, so a new
 *      private column cannot be leaked by forgetting a field.
 *   3. Every exported function that mutates takes an `actorId` and writes an
 *      audit log entry.
 *   4. Nothing here may be called from a `(storefront)` page.
 */

import { prisma } from "@/lib/db";
import type { PaymentStatus, ProductStatus } from "@/lib/enums";
import {
  ATTENTION_PRODUCT_STATUSES,
  ORDER_STATUS_TO_FULFILLMENT,
  PAID_PAYMENT_STATUSES,
  nextItemNumberSuggestion,
} from "@/lib/enums";
import type { OrderStatus } from "@/lib/enums";
import type {
  ProductInput,
  CategoryInput,
  OrderUpdateInput,
  ShipmentUpdateInput,
  ShippingSettingsInput,
  ShippingRuleInput,
} from "@/lib/validation";
import { slugify } from "@/lib/utils";
import { restockOrder, syncOrderStatus } from "@/lib/dal/orders";
import { getAdminSession } from "@/lib/auth/session";
import { getCourierProvider } from "@/lib/courier/registry";
import {
  productReadinessIssues,
  catalogueFlags,
  readinessInput,
  readinessSelect,
  summariseReadiness,
} from "@/lib/product-readiness";

// ---------------------------------------------------------------------------
// Authorisation guard
// ---------------------------------------------------------------------------

/**
 * Every admin action and every admin page must call this first.
 *
 * `getAdminSession()` re-reads the user from the database, so deactivating an
 * account takes effect on the next request rather than whenever the cookie
 * happens to expire.
 */
export async function requireAdmin(): Promise<{ id: string; email: string; name: string }> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("UNAUTHORISED");
  }
  return { id: session.userId, email: session.email, name: session.name };
}

/** The same check, but as a predicate for page guards that should redirect. */
export async function currentAdmin(): Promise<{ id: string; email: string; name: string } | null> {
  const session = await getAdminSession();
  if (!session) return null;
  return { id: session.userId, email: session.email, name: session.name };
}

async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  meta?: object,
): Promise<void> {
  // An audit failure must never roll back or mask the business operation that
  // already succeeded, so this swallows and reports instead of throwing.
  try {
    await prisma.auditLog.create({
      data: { actorId, action, entity, entityId, meta: meta as object | undefined },
    });
  } catch (error) {
    console.error(`admin: audit write failed for ${action}`, { entityId, error });
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardStats {
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number;
  orderCount: number;
  customerCount: number;
  activeProductCount: number;
  /** Listings that need a decision: unpublished, held, missing, or sold. */
  attentionCount: number;
  pendingFulfilmentCount: number;
  awaitingPaymentCents: number;
  awaitingPaymentCount: number;
  /** Paid orders sitting at "checking stock" — the first thing to action. */
  actionRequiredCount: number;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Revenue and profit count only orders whose money has actually settled, so the
 * dashboard does not show a big number that is still an unpaid promise.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const paidFilter = { paymentStatus: { in: PAID_PAYMENT_STATUSES } };

  const [paidAgg, awaiting, customerCount, activeProductCount, attentionCount, actionRequiredCount] =
    await Promise.all([
      prisma.order.aggregate({
        where: { ...paidFilter, placedAt: { gte: thirtyDaysAgo } },
        _sum: { totalCents: true, subtotalCents: true, shippingCents: true, discountCents: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: { paymentStatus: { in: ["UNPAID", "PENDING", "AUTHORISED"] } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      prisma.customer.count(),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      // "Low stock" is meaningless for one-of-a-kind second-hand goods, so the
      // dashboard counts listings that need a decision instead: unpublished
      // drafts, items someone is holding, and items we could not source.
      prisma.product.count({ where: { status: { in: ATTENTION_PRODUCT_STATUSES } } }),
      // Paid orders where we still have to go and buy the item.
      prisma.order.count({
        where: { paymentStatus: { in: PAID_PAYMENT_STATUSES }, status: { in: ["PAID", "CHECKING_STOCK"] } },
      }),
    ]);

  // Cost is a per-item snapshot, so it has to be summed from the order lines
  // rather than aggregated on the order row.
  const paidItems = await prisma.orderItem.findMany({
    where: { order: { ...paidFilter, placedAt: { gte: thirtyDaysAgo } } },
    select: { quantity: true, unitSourceCostCents: true },
  });

  let costCents = 0;
  for (const item of paidItems) {
    if (item.unitSourceCostCents != null) {
      costCents += item.unitSourceCostCents * item.quantity;
    }
  }

  const revenueCents = paidAgg._sum.totalCents ?? 0;
  const profitCents = revenueCents - costCents;

  const pendingFulfilmentCount = await prisma.order.count({
    where: {
      status: { notIn: ["CANCELLED", "REFUNDED", "DELIVERED"] },
      fulfillmentStatus: { notIn: ["RETURNED", "DELIVERED"] },
    },
  });

  return {
    revenueCents,
    costCents,
    profitCents,
    marginPct: revenueCents > 0 ? Math.round((profitCents / revenueCents) * 1000) / 10 : 0,
    orderCount: paidAgg._count._all,
    customerCount,
    activeProductCount,
    attentionCount,
    actionRequiredCount,
    pendingFulfilmentCount,
    awaitingPaymentCents: awaiting._sum.totalCents ?? 0,
    awaitingPaymentCount: awaiting._count._all,
  };
}

/** Daily paid revenue for the dashboard sparkline. */
export async function getRecentDailyRevenue(days = 14): Promise<
  Array<{ date: string; revenueCents: number; orderCount: number }>
> {
  const since = startOfDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const orders = await prisma.order.findMany({
    where: { paymentStatus: { in: PAID_PAYMENT_STATUSES }, placedAt: { gte: since } },
    select: { placedAt: true, totalCents: true },
  });

  const buckets = new Map<string, { revenueCents: number; orderCount: number }>();
  for (let i = 0; i < days; i += 1) {
    buckets.set(startOfDay(new Date(since.getTime() + i * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10), {
      revenueCents: 0,
      orderCount: 0,
    });
  }
  for (const order of orders) {
    const key = order.placedAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.revenueCents += order.totalCents;
      bucket.orderCount += 1;
    }
  }
  return [...buckets.entries()].map(([date, value]) => ({ date, ...value }));
}

export async function getRecentOrders(take = 8) {
  return prisma.order.findMany({
    take,
    orderBy: { placedAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      totalCents: true,
      placedAt: true,
      customer: { select: { fullName: true, email: true } },
    },
  });
}

/**
 * Listings that need a decision, most urgent first.
 *
 * Replaces the old "low stock" panel, which flagged every single-unit item and
 * was therefore useless. For second-hand stock the useful list is: items we
 * hold, items we lost, drafts never published, and sold items worth relisting.
 */
export async function getAttentionProducts(take = 8) {
  return prisma.product.findMany({
    where: { status: { in: ATTENTION_PRODUCT_STATUSES } },
    take,
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      itemId: true,
      stockQty: true,
      status: true,
      priceCents: true,
      updatedAt: true,
      images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });
}

/** The next free `2DS-####` item number, so the admin never types one by hand. */
export async function suggestNextItemNumber(): Promise<string> {
  const rows = await prisma.product.findMany({ select: { itemId: true } });
  return nextItemNumberSuggestion(rows.map((r) => r.itemId));
}

export async function getRecentAuditEntries(take = 10) {
  return prisma.auditLog.findMany({
    take,
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true, entity: true, entityId: true, createdAt: true, actorId: true },
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface AdminOrderFilters {
  status?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  query?: string;
  page?: number;
  perPage?: number;
}

export async function listAdminOrders(filters: AdminOrderFilters = {}) {
  const perPage = Math.min(Math.max(filters.perPage ?? 25, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const query = filters.query?.trim();

  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
    ...(filters.fulfillmentStatus ? { fulfillmentStatus: filters.fulfillmentStatus } : {}),
    ...(query
      ? {
          OR: [
            { orderNumber: { contains: query } },
            { customer: { email: { contains: query } } },
            { customer: { fullName: { contains: query } } },
            { deliveryPhone: { contains: query } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        subtotalCents: true,
        shippingCents: true,
        totalCents: true,
        placedAt: true,
        deliveryCity: true,
        deliveryProvince: true,
        deliveryMethod: true,
        customer: { select: { id: true, fullName: true, email: true, phone: true } },
        _count: { select: { items: true, shipments: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { rows, total, page, perPage, pageCount: Math.max(Math.ceil(total / perPage), 1) };
}

export async function getAdminOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      subtotalCents: true,
      shippingCents: true,
      discountCents: true,
      totalCents: true,
      currency: true,
      shippingQuote: true,
      internalNotes: true,
      deliveryFullName: true,
      deliveryPhone: true,
      deliveryEmail: true,
      deliveryLine1: true,
      deliveryLine2: true,
      deliverySuburb: true,
      deliveryCity: true,
      deliveryProvince: true,
      deliveryPostalCode: true,
      deliveryCountry: true,
      deliveryMethod: true,
      deliveryNotes: true,
      placedAt: true,
      paidAt: true,
      stockCheckedAt: true,
      securedAt: true,
      shippedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      refundedAt: true,
      cancelReason: true,
      customer: {
        select: { id: true, fullName: true, email: true, phone: true, createdAt: true },
      },
      items: {
        select: {
          id: true,
          productId: true,
          itemIdSnapshot: true,
          skuSnapshot: true,
          nameSnapshot: true,
          imageUrlSnapshot: true,
          conditionSnapshot: true,
          unitPriceCents: true,
          quantity: true,
          lineTotalCents: true,
          unitSourceCostCents: true,
          unavailableReason: true,
          product: { select: { id: true, status: true, slug: true } },
        },
      },
      emails: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          template: true,
          to: true,
          subject: true,
          provider: true,
          status: true,
          error: true,
          createdAt: true,
        },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          provider: true,
          providerRef: true,
          amountCents: true,
          status: true,
          settledBy: true,
          settledAt: true,
          createdAt: true,
        },
      },
      shipments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          courier: true,
          courierName: true,
          trackingNumber: true,
          trackingUrl: true,
          status: true,
          parcelWeightGrams: true,
          dispatchedAt: true,
          deliveredAt: true,
          notes: true,
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
      },
    },
  });
}

/** Map an order payment status onto the payment-record status set. */
function paymentRecordStatusFor(orderPaymentStatus: string): string | null {
  switch (orderPaymentStatus) {
    case "PAID":
    case "PARTIALLY_REFUNDED":
      return "PAID";
    case "FAILED":
      return "FAILED";
    case "REFUNDED":
      return "REFUNDED";
    case "PENDING":
      return "PENDING";
    case "AUTHORISED":
      return "AUTHORISED";
    case "UNPAID":
      return "INITIATED";
    default:
      return null;
  }
}

/** Per-order profit, derived from the cost snapshot on each line. */
export function orderProfitCents(
  items: Array<{ quantity: number; unitSourceCostCents: number | null; lineTotalCents: number }>,
): { revenueCents: number; costCents: number; profitCents: number } | null {
  const anyCost = items.some((i) => i.unitSourceCostCents != null);
  if (!anyCost) return null;

  let costCents = 0;
  let revenueCents = 0;
  for (const item of items) {
    if (item.unitSourceCostCents != null) costCents += item.unitSourceCostCents * item.quantity;
    revenueCents += item.lineTotalCents;
  }
  return { revenueCents, costCents, profitCents: revenueCents - costCents };
}

/**
 * Stages that must not silently move backwards, because each one represents
 * work that has already happened: the shop has been paid, a parcel is in
 * transit. Reverting them silently would misrepresent reality to the customer.
 */
const TERMINAL_STAGES = new Set(["DISPATCHED", "DELIVERED", "RETURNED"]);

export async function updateAdminOrder(
  orderId: string,
  input: OrderUpdateInput,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const before = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      paidAt: true,
      shippedAt: true,
      deliveredAt: true,
      stockCheckedAt: true,
      securedAt: true,
    },
  });
  if (!before) return { ok: false, error: "That order no longer exists." };

  // Guard the two invariants the rest of the app relies on: a cancelled order
  // must not sit in a paid or dispatched state.
  if (before.status === "CANCELLED" || before.status === "REFUNDED") {
    return { ok: false, error: "This order is closed. Un-cancel it before changing statuses." };
  }

  // Once a parcel is moving we cannot pretend it is still on the shelf. The
  // admin must cancel-and-refund the order instead of rewinding the stage.
  if (TERMINAL_STAGES.has(before.fulfillmentStatus) && !TERMINAL_STAGES.has(input.fulfillmentStatus)) {
    return {
      ok: false,
      error:
        "This parcel has already been dispatched. Cancel and refund the order instead of moving the status backwards.",
    };
  }

  // Cancelling is not a status tweak: stock has to go back and the order has
  // to close. The dedicated cancel path owns that.
  if (input.orderStatus === "CANCELLED") {
    const result = await cancelAndRestockOrder(orderId, actorId, true, input.cancelReason ?? null);
    if (result.ok && input.internalNotes !== undefined) {
      await prisma.order.update({
        where: { id: orderId },
        data: { internalNotes: input.internalNotes },
      });
    }
    return result;
  }

  const now = new Date();
  const paymentPaid = PAID_PAYMENT_STATUSES.includes(input.paymentStatus as PaymentStatus);

  // The two status vocabularies have to move together.
  //
  // The admin's one-click buttons ask for an *order* status ("item secured"),
  // but the headline is derived from the *stage*. Deriving the stage from an
  // explicitly requested order status means the button cannot be silently
  // swallowed by the derivation — which is exactly what used to happen: the
  // button reported success and the order never moved.
  const requestedStage = ORDER_STATUS_TO_FULFILLMENT[input.orderStatus as OrderStatus];
  const fulfillmentStatus =
    requestedStage && requestedStage !== input.fulfillmentStatus
      ? requestedStage
      : input.fulfillmentStatus;

  // syncOrderStatus owns the order-status derivation and the paidAt/shippedAt/
  // deliveredAt stamps, so the admin form and checkout cannot disagree about
  // what a status combination means.
  const synced = syncOrderStatus({
    paymentStatus: input.paymentStatus,
    fulfillmentStatus,
  });

  // REFUNDED cannot be derived from the payment and fulfilment pair, so an
  // explicit choice there is honoured. CANCELLED is handled above.
  const status = input.orderStatus === "REFUNDED" ? "REFUNDED" : synced.status;

  // A refund is money going back, so the stock has to come back too. Handled
  // here rather than in the cancel path because a refund can follow a delivery.
  if (status === "REFUNDED") {
    const result = await refundAdminOrder(orderId, actorId, input.cancelReason ?? null);
    if (!result.ok) return result;
    if (input.internalNotes !== undefined) {
      await prisma.order.update({ where: { id: orderId }, data: { internalNotes: input.internalNotes } });
    }
    return result;
  }

  const wasPaid = PAID_PAYMENT_STATUSES.includes(before.paymentStatus as PaymentStatus);
  const becamePaid = paymentPaid && !wasPaid;
  const becameShipped =
    !TERMINAL_STAGES.has(before.fulfillmentStatus) &&
    (fulfillmentStatus === "DISPATCHED" || fulfillmentStatus === "DELIVERED");
  const becameSecured = fulfillmentStatus === "ITEM_SECURED" && before.fulfillmentStatus !== "ITEM_SECURED";

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status,
        paymentStatus: input.paymentStatus,
        fulfillmentStatus,
        ...(synced.paidAt && !before.paidAt ? { paidAt: now } : {}),
        // The shop-visit stamps that make the workflow auditable.
        ...(fulfillmentStatus === "CHECKING_STOCK" && !before.stockCheckedAt
          ? { stockCheckedAt: now }
          : {}),
        ...(fulfillmentStatus === "ITEM_SECURED" && !before.securedAt ? { securedAt: now } : {}),
        ...(synced.shippedAt && !before.shippedAt ? { shippedAt: now } : {}),
        ...(synced.deliveredAt && !before.deliveredAt ? { deliveredAt: now } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
      },
    });

    // Keep the latest payment record in step with the order-level payment
    // status, so the customer's status page and the admin view cannot disagree.
    const latest = await tx.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const recordStatus = paymentRecordStatusFor(input.paymentStatus);
    if (latest && recordStatus) {
      await tx.payment.update({
        where: { id: latest.id },
        data: {
          status: recordStatus,
          ...(paymentPaid ? { settledAt: now, settledBy: `admin:${actorId}` } : {}),
        },
      });
    }

    if (fulfillmentStatus === "DISPATCHED" || fulfillmentStatus === "DELIVERED") {
      const shipment = await tx.shipment.findFirst({
        where: { orderId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, dispatchedAt: true, deliveredAt: true },
      });
      if (shipment && shipment.status !== "DELIVERED") {
        await tx.shipment.update({
          where: { id: shipment.id },
          data:
            fulfillmentStatus === "DELIVERED"
              ? {
                  status: "DELIVERED",
                  dispatchedAt: shipment.dispatchedAt ?? now,
                  deliveredAt: shipment.deliveredAt ?? now,
                }
              : {
                  status: "DISPATCHED",
                  dispatchedAt: shipment.dispatchedAt ?? now,
                },
        });
      }
    }
  });

  await audit(actorId, "order.updated", "order", orderId, {
    before,
    after: {
      status,
      paymentStatus: input.paymentStatus,
      fulfillmentStatus,
    },
  });

  // --- Customer + owner notifications.
  // Each branch fires at most once per real transition, so re-saving the form
  // does not spam anyone. Failures are recorded inside the mail layer.
  if (becamePaid) {
    const { notifyPaidOrder } = await import("@/lib/mail/order-notifications");
    await notifyPaidOrder(orderId);
  } else if (becameShipped) {
    const { notifyCustomerShipped } = await import("@/lib/mail/order-notifications");
    await notifyCustomerShipped(orderId);
  } else if (becameSecured) {
    const { notifyOwnerItemSecured } = await import("@/lib/mail/order-notifications");
    await notifyOwnerItemSecured(orderId);
  }

  return { ok: true };
}

export async function updateAdminShipment(
  input: ShipmentUpdateInput,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await prisma.shipment.findUnique({
    where: { id: input.shipmentId },
    select: { id: true, orderId: true, status: true, dispatchedAt: true, deliveredAt: true },
  });
  if (!existing) return { ok: false, error: "That shipment no longer exists." };

  const now = new Date();
  const movingOut =
    input.status === "DISPATCHED" || input.status === "IN_TRANSIT" || input.status === "DELIVERED";
  await prisma.shipment.update({
    where: { id: input.shipmentId },
    data: {
      courierName: input.courierName || null,
      trackingNumber: input.trackingNumber || null,
      status: input.status,
      notes: input.notes || null,
      ...(movingOut && !existing.dispatchedAt ? { dispatchedAt: now } : {}),
      ...(input.status === "DELIVERED" && !existing.deliveredAt ? { deliveredAt: now } : {}),
    },
  });

  await reflectShipmentOnOrder(existing.orderId, input.status);
  await audit(actorId, "shipment.updated", "shipment", input.shipmentId, {
    orderId: existing.orderId,
    status: input.status,
  });

  return { ok: true };
}

/** Add a shipment when checkout did not create one (older or repaired orders). */
export async function createAdminShipment(
  orderId: string,
  input: Omit<ShipmentUpdateInput, "shipmentId">,
  actorId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, error: "This order is closed." };
  }

  const now = new Date();
  const shipment = await prisma.shipment.create({
    data: {
      orderId,
      courier: getCourierProvider().key,
      courierName: input.courierName || null,
      trackingNumber: input.trackingNumber || null,
      status: input.status,
      notes: input.notes || null,
      dispatchedAt:
        input.status === "DISPATCHED" || input.status === "IN_TRANSIT" || input.status === "DELIVERED"
          ? now
          : undefined,
      deliveredAt: input.status === "DELIVERED" ? now : undefined,
    },
    select: { id: true },
  });

  await reflectShipmentOnOrder(orderId, input.status);
  await audit(actorId, "shipment.created", "shipment", shipment.id, { orderId, status: input.status });
  return { ok: true, id: shipment.id };
}

/**
 * Dispatch and delivery on the shipment should show up on the order, otherwise
 * the customer status page and the admin order status drift apart.
 */
async function reflectShipmentOnOrder(orderId: string, shipmentStatus: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      paidAt: true,
      shippedAt: true,
      deliveredAt: true,
    },
  });
  if (!order || order.status === "CANCELLED" || order.status === "REFUNDED") return;

  let fulfillment = order.fulfillmentStatus;
  if (shipmentStatus === "DELIVERED") fulfillment = "DELIVERED";
  else if (shipmentStatus === "RETURNED") fulfillment = "RETURNED";
  else if (
    (shipmentStatus === "DISPATCHED" || shipmentStatus === "IN_TRANSIT") &&
    fulfillment !== "DELIVERED"
  ) {
    fulfillment = "DISPATCHED";
  } else {
    return;
  }

  if (fulfillment === order.fulfillmentStatus) return;

  const synced = syncOrderStatus({
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: fulfillment,
  });
  const now = new Date();
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: synced.status,
      fulfillmentStatus: fulfillment,
      ...(synced.paidAt && !order.paidAt ? { paidAt: now } : {}),
      ...(synced.shippedAt && !order.shippedAt ? { shippedAt: now } : {}),
      ...(synced.deliveredAt && !order.deliveredAt ? { deliveredAt: now } : {}),
    },
  });
}

export async function addAdminOrderNote(
  orderId: string,
  body: string,
  authorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) return { ok: false, error: "That order no longer exists." };

  await prisma.adminNote.create({ data: { orderId, body, authorId } });
  await audit(authorId, "order.note_added", "order", orderId);
  return { ok: true };
}

/** Cancel and put the stock back. Delegates the transactional work. */
export async function cancelAndRestockOrder(
  orderId: string,
  actorId: string,
  restock: boolean,
  reason: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, error: "This order is already closed." };
  }

  if (restock) {
    await restockOrder(orderId, actorId);
  } else {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    await audit(actorId, "order.cancelled", "order", orderId, { restocked: false, reason });
  }

  const { notifyCustomerClosed } = await import("@/lib/mail/order-notifications");
  await notifyCustomerClosed(orderId, "cancelled");

  return { ok: true };
}

/**
 * Refund an order: money goes back, stock comes back, customer is told.
 *
 * Separate from cancel because a refund can follow a delivery, and because
 * "cancelled" alone would leave the customer unsure whether their money is
 * coming back.
 */
export async function refundAdminOrder(
  orderId: string,
  actorId: string,
  reason: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentStatus: true },
  });
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status === "REFUNDED") return { ok: false, error: "This order is already refunded." };

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Return the units this order took. Mirrors restockOrder's rule of only
    // reversing the state this order itself caused.
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });
    for (const item of items) {
      const current = await tx.product.findUnique({
        where: { id: item.productId },
        select: { status: true },
      });
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
      data: {
        status: "REFUNDED",
        paymentStatus: "REFUNDED",
        fulfillmentStatus: "RETURNED",
        refundedAt: now,
        cancelledAt: now,
        ...(reason ? { cancelReason: reason } : {}),
      },
    });

    const latest = await tx.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest) {
      await tx.payment.update({
        where: { id: latest.id },
        data: { status: "REFUNDED", settledBy: `admin:${actorId}` },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "order.refunded",
        entity: "order",
        entityId: orderId,
        meta: { reason, restockedUnits: items.length },
      },
    });
  });

  const { notifyCustomerClosed } = await import("@/lib/mail/order-notifications");
  await notifyCustomerClosed(orderId, "refunded");

  return { ok: true };
}

/**
 * "The shop no longer has it."
 *
 * This is the action that makes the whole business model honest. It records
 * which lines could not be sourced and why, takes those products off the
 * storefront so nobody else orders them, then cancels the order and refunds.
 *
 * Everything except the notification is one transaction, so a partial failure
 * can never leave an item marked unavailable with no refund.
 */
export async function markItemsUnavailable(
  orderId: string,
  productIds: string[],
  reason: string,
  refund: boolean,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true, paymentStatus: true },
  });
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { ok: false, error: "This order is already closed." };
  }

  // Only touch lines that actually belong to this order.
  const lines = await prisma.orderItem.findMany({
    where: { orderId, productId: { in: productIds } },
    select: { id: true, productId: true, quantity: true },
  });
  if (lines.length === 0) {
    return { ok: false, error: "None of those items are on this order." };
  }

  const now = new Date();
  const affectedProductIds = lines.map((l) => l.productId);

  await prisma.$transaction(async (tx) => {
    // 1. Why it happened, on the line, so nobody has to guess later.
    await tx.orderItem.updateMany({
      where: { id: { in: lines.map((l) => l.id) } },
      data: { unavailableReason: reason },
    });

    // 2. Take them off the storefront.
    await tx.product.updateMany({
      where: { id: { in: affectedProductIds }, status: { not: "ARCHIVED" } },
      data: { status: "UNAVAILABLE", stockQty: 0, soldAt: null },
    });

    // 3. Return the units this order reserved. Deliberately not restoring the
    //    product status: the item is gone, not back on the shelf.
    for (const line of lines) {
      await tx.product.update({
        where: { id: line.productId },
        data: { stockQty: { increment: line.quantity } },
      });
    }

    // 4. Close the order.
    //
    //    Cancelling WITHOUT refunding must never rewrite a paid order's payment
    //    status back to PENDING. That would erase the only record that the
    //    customer actually handed over money, which is exactly the evidence
    //    needed to trace the manual refund later. A paid order stays PAID and
    //    the admin note records that a refund still has to be paid out.
    const alreadyPaid = order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED";
    const paymentStatus = refund ? "REFUNDED" : alreadyPaid ? "PAID" : order.paymentStatus;

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: refund ? "REFUNDED" : "CANCELLED",
        paymentStatus,
        fulfillmentStatus: "RETURNED",
        cancelReason: reason,
        cancelledAt: now,
        ...(refund ? { refundedAt: now } : {}),
      },
    });

    if (refund) {
      const latest = await tx.payment.findFirst({
        where: { orderId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (latest) {
        await tx.payment.update({
          where: { id: latest.id },
          data: { status: "REFUNDED", settledBy: `admin:${actorId}` },
        });
      }
    }

    // 5. A permanent, human-readable record.
    await tx.adminNote.create({
      data: {
        orderId,
        authorId: actorId,
        body: `Item no longer available at the supplier. Reason: ${reason}. ${refund ? "Order refunded in full." : "Order cancelled; refund to be arranged manually."}`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "order.items_unavailable",
        entity: "order",
        entityId: orderId,
        meta: { orderNumber: order.orderNumber, reason, refunded: refund, productIds: affectedProductIds },
      },
    });
  });

  const { notifyCustomerClosed } = await import("@/lib/mail/order-notifications");
  await notifyCustomerClosed(orderId, refund ? "refunded" : "cancelled");

  return { ok: true };
}

/** The email trail for one order, newest first. Shown on the admin order page. */
export async function listOrderEmails(orderId: string) {
  return prisma.emailLog.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      template: true,
      to: true,
      subject: true,
      provider: true,
      status: true,
      error: true,
      createdAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface AdminProductFilters {
  query?: string;
  status?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
  page?: number;
  perPage?: number;
}

export async function listAdminProducts(filters: AdminProductFilters = {}) {
  const perPage = Math.min(Math.max(filters.perPage ?? 25, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const query = filters.query?.trim();

  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.lowStockOnly ? { stockQty: { lte: 1 } } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { itemId: { contains: query } },
            { sku: { contains: query } },
            { description: { contains: query } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        itemId: true,
        sku: true,
        name: true,
        slug: true,
        status: true,
        priceCents: true,
        sourceCostCents: true,
        stockQty: true,
        condition: true,
        description: true,
          isFeatured: true,
          updatedAt: true,
          productWeightGrams: true,
          packageLengthCm: true,
          packageWidthCm: true,
          packageHeightCm: true,
          measurementSource: true,
          brand: true, model: true, modelSourceUrl: true, specsConfirmed: true, itemReviewConfirmed: true, cleanImageLicense: true,

        categoryId: true,
        category: { select: { id: true, name: true, slug: true } },
        images: { select: { url: true }, orderBy: { sortOrder: "asc" }, take: 1 },
        _count: { select: { images: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  // How many problems stand between each draft and the shop. Purely additive:
  // the list itself is unchanged, this just tells the owner which of the 53
  // imported items still need a scale and a ruler before they can be listed.
  const rowsWithReadiness = rows.map((row) => ({
    ...row,
    catalogueFlags: catalogueFlags({ ...row, imageCount: row._count.images }),
    readinessIssues: productReadinessIssues({
      ...row,
      imageCount: row._count.images,
    }),
  }));

  return {
    rows: rowsWithReadiness,
    total,
    page,
    perPage,
    pageCount: Math.max(Math.ceil(total / perPage), 1),
  };
}

export async function getAdminProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      itemId: true,
      sku: true,
      name: true,
      slug: true,
      brand: true, model: true, modelSourceUrl: true,
      specsConfirmed: true, itemReviewConfirmed: true, cleanImageLicense: true, researchNotes: true,
      specifications: true, includedItems: true, priceManualOverride: true,
      lockerAllowed: true, courierAllowed: true,
      description: true,
      categoryId: true,
      condition: true,
      conditionNote: true,
      testingStatus: true,
      testedAt: true,
      measurementSource: true,
      priceCents: true,
      sourceCostCents: true,
      supplierNotes: true,
      adminNotes: true,
      productWeightGrams: true,
      packageWeightGrams: true,
      packageLengthCm: true,
      packageWidthCm: true,
      packageHeightCm: true,
      stockQty: true,
      status: true,
      isFeatured: true,
      soldAt: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
      images: {
        select: { id: true, url: true, alt: true, sortOrder: true, coverMode: true, maskBoxes: true },
        orderBy: { sortOrder: "asc" },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
      },
      _count: { select: { orderItems: true } },
    },
  });
}

/** Item id and SKU are unique, so generate a free one when the admin leaves it blank. */
async function generateUniqueField(field: "itemId" | "sku", prefix: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const where = field === "itemId" ? { itemId: candidate } : { sku: candidate };
    const clash = await prisma.product.findUnique({
      where,
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error(`Could not generate a unique ${field}. Set it manually.`);
}

/**
 * Keep the listing status and the stock quantity telling the same story.
 *
 * Second-hand stock is one-of-a-kind, so "available" and "quantity" are the
 * same fact expressed twice. Rules:
 *   - DRAFT / ARCHIVED keep whatever the admin typed: a listing you have pulled
 *     should not be silently re-priced by its stock number.
 *   - RESERVED and UNAVAILABLE are deliberate human decisions, so they are
 *     preserved rather than derived. A held or missing item can still have
 *     units on paper, and the storefront shows the right message either way.
 *   - SOLD_OUT is a fact: once the units are gone the item is sold.
 *   - Anything else with stock on hand is available.
 */
function normaliseListing(
  status: string,
  stockQty: number,
): { status: string; stockQty: number; soldAt: Date | null | undefined } {
  if (status === "ARCHIVED" || status === "DRAFT") {
    return { status, stockQty, soldAt: undefined };
  }
  if (status === "RESERVED" || status === "UNAVAILABLE") {
    return { status, stockQty, soldAt: null };
  }
  if (status === "SOLD_OUT" || stockQty <= 0) {
    return { status: "SOLD_OUT", stockQty: 0, soldAt: new Date() };
  }
  return { status: "ACTIVE", stockQty, soldAt: null };
}

async function uniqueSlug(desired: string, excludeId?: string): Promise<string> {
  const base = slugify(desired) || "item";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === excludeId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createAdminProduct(
  input: ProductInput,
  actorId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const itemId = input.itemId || (await generateUniqueField("itemId", "2DE"));
  const sku = input.sku || (await generateUniqueField("sku", "SKU"));
  const slug = await uniqueSlug(input.slug || input.name);
  const listing = normaliseListing(input.status, input.stockQty);

  // A new product saved straight to ACTIVE has to clear the same bar as one
  // published later from the products list.
  if (listing.status === "ACTIVE") {
    const issues = productReadinessIssues({
      brand: input.brand,
      model: input.model,
      modelSourceUrl: input.modelSourceUrl,
      specsConfirmed: input.specsConfirmed,
      itemReviewConfirmed: input.itemReviewConfirmed,
      cleanImageLicense: input.cleanImageLicense,
      researchNotes: input.researchNotes,
      name: input.name,
      priceCents: input.priceCents,
      stockQty: listing.stockQty,
      productWeightGrams: input.productWeightGrams,
      packageLengthCm: input.packageLengthCm,
      packageWidthCm: input.packageWidthCm,
      packageHeightCm: input.packageHeightCm,
      condition: input.condition,
      description: input.description,
      categoryId: input.categoryId,
      imageCount: input.imageUrls.length,
      sourceCostCents: input.sourceCostCents,
      measurementSource: input.measurementSource,
    });
    if (issues.length > 0) {
      return { ok: false, error: summariseReadiness(issues) };
    }
  }

  const data = {
    itemId,
    sku,
      brand: input.brand,
      model: input.model,
      modelSourceUrl: input.modelSourceUrl,
      specsConfirmed: input.specsConfirmed,
      itemReviewConfirmed: input.itemReviewConfirmed,
      cleanImageLicense: input.cleanImageLicense,
      researchNotes: input.researchNotes,
      name: input.name,
    slug,
    description: input.description,
    specifications: input.specifications,
    includedItems: input.includedItems,
    priceManualOverride: input.priceManualOverride,
    categoryId: input.categoryId,
    condition: input.condition,
    conditionNote: input.conditionNote ?? null,
    testingStatus: input.testingStatus ?? "NOT_TESTED",
    measurementSource: input.measurementSource ?? "ESTIMATED",
    lockerAllowed: input.lockerAllowed,
    courierAllowed: input.courierAllowed,
    priceCents: input.priceCents,
    sourceCostCents: input.sourceCostCents ?? null,
    supplierNotes: input.supplierNotes || null,
    adminNotes: input.adminNotes || null,
    productWeightGrams: input.productWeightGrams,
    packageWeightGrams: input.packageWeightGrams,
    packageLengthCm: input.packageLengthCm,
    packageWidthCm: input.packageWidthCm,
    packageHeightCm: input.packageHeightCm,
    stockQty: listing.stockQty,
    status: listing.status,
    isFeatured: input.isFeatured,
    ...(listing.soldAt !== undefined ? { soldAt: listing.soldAt } : {}),
  };

  const product = await prisma.product.create({
    data: {
      ...data,
      images: {
        create: input.imageUrls.map((url, index) => ({ url, sortOrder: index })),
      },
    },
    select: { id: true },
  });

  await audit(actorId, "product.created", "product", product.id, { name: input.name, itemId });
  return { ok: true, id: product.id };
}

export async function updateAdminProduct(
  id: string,
  input: ProductInput,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { id: true, slug: true, itemId: true, sku: true, ...readinessSelect },
  });
  if (!existing) return { ok: false, error: "That product no longer exists." };

  // The edit form carries its own status field, so a save can publish a listing
  // without ever touching setAdminProductStatus. The surviving image count comes
  // from `existing` plus whatever this form keeps.
  const keptImages = input.imageUrls ?? [];
  if (normaliseListing(input.status, input.stockQty).status === "ACTIVE") {
    const issues = productReadinessIssues(
      readinessInput({
        ...existing,
        sourceCostCents: input.sourceCostCents,
        measurementSource: input.measurementSource,
      brand: input.brand,
      model: input.model,
      modelSourceUrl: input.modelSourceUrl,
      specsConfirmed: input.specsConfirmed,
      itemReviewConfirmed: input.itemReviewConfirmed,
      cleanImageLicense: input.cleanImageLicense,
      researchNotes: input.researchNotes,

        priceCents: input.priceCents,
        stockQty: input.stockQty,
        productWeightGrams: input.productWeightGrams,
        packageLengthCm: input.packageLengthCm,
        packageWidthCm: input.packageWidthCm,
        packageHeightCm: input.packageHeightCm,
        condition: input.condition,
        description: input.description,
        categoryId: input.categoryId,
        _count: { images: keptImages.length },
      }),
    );
    if (issues.length > 0) {
      return { ok: false, error: summariseReadiness(issues) };
    }
  }

  const slug = input.slug ? await uniqueSlug(input.slug, id) : existing.slug;

  // A blank itemId or SKU means "keep what is there" on an edit, not "erase it",
  // because both are unique and NOT NULL.
  const itemId = input.itemId || existing.itemId;
  const sku = input.sku || existing.sku;
  const listing = normaliseListing(input.status, input.stockQty);

  const removedUrls: string[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        itemId,
        sku,
      brand: input.brand,
      model: input.model,
      modelSourceUrl: input.modelSourceUrl,
      specsConfirmed: input.specsConfirmed,
      itemReviewConfirmed: input.itemReviewConfirmed,
      cleanImageLicense: input.cleanImageLicense,
      researchNotes: input.researchNotes,
      name: input.name,
        slug,
        description: input.description,
    specifications: input.specifications,
    includedItems: input.includedItems,
    priceManualOverride: input.priceManualOverride,
        categoryId: input.categoryId,
        condition: input.condition,
        conditionNote: input.conditionNote ?? null,
        testingStatus: input.testingStatus ?? "NOT_TESTED",
    measurementSource: input.measurementSource ?? "ESTIMATED",
    lockerAllowed: input.lockerAllowed,
    courierAllowed: input.courierAllowed,
        priceCents: input.priceCents,
        sourceCostCents: input.sourceCostCents ?? null,
        supplierNotes: input.supplierNotes || null,
        adminNotes: input.adminNotes || null,
        productWeightGrams: input.productWeightGrams,
        packageWeightGrams: input.packageWeightGrams,
        packageLengthCm: input.packageLengthCm,
        packageWidthCm: input.packageWidthCm,
        packageHeightCm: input.packageHeightCm,
        stockQty: listing.stockQty,
        status: listing.status,
        isFeatured: input.isFeatured,
        ...(listing.soldAt !== undefined ? { soldAt: listing.soldAt } : {}),
      },
    });

    // Reconcile images: drop any that are no longer in the submitted list, then
    // add the new ones and rewrite sort order to match the form.
    const current = await tx.productImage.findMany({
      where: { productId: id },
      select: { id: true, url: true },
    });
    const wanted = new Set(input.imageUrls);
    const removed = current.filter((img) => !wanted.has(img.url));
    if (removed.length > 0) {
      removedUrls.push(...removed.map((img) => img.url));
      await tx.productImage.deleteMany({ where: { id: { in: removed.map((img) => img.id) } } });
    }
    const existingUrls = new Set(current.map((img) => img.url));
    const added = input.imageUrls.filter((url) => !existingUrls.has(url));
    if (added.length > 0) {
      await tx.productImage.createMany({
        data: added.map((url) => ({
          productId: id,
          url,
          sortOrder: input.imageUrls.indexOf(url),
        })),
      });
    }
    for (const [index, url] of input.imageUrls.entries()) {
      await tx.productImage.updateMany({
        where: { productId: id, url },
        data: { sortOrder: index },
      });
    }
  });

  // Keep uploaded original files for provenance and recovery even when detached.

  await audit(actorId, "product.updated", "product", id, { name: input.name });
  return { ok: true };
}

export async function setAdminProductStatus(
  id: string,
  status: ProductStatus,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { status: true, ...readinessSelect },
  });
  if (!existing) return { ok: false, error: "That product no longer exists." };

  // A listing that cannot be shipped must not reach the shop. Checked before the
  // status switch so a refusal names every blocker, not just the first one the
  // old price check happened to catch.
  if (status === "ACTIVE") {
    const issues = productReadinessIssues(readinessInput(existing));
    if (issues.length > 0) {
      return { ok: false, error: summariseReadiness(issues) };
    }
  }

  // Re-listing a sold item should not silently invent stock. The admin has to
  // go to the edit form and set a real quantity if the item is back.
  const data = (() => {
    switch (status) {
      case "SOLD_OUT":
        return { status, stockQty: 0, soldAt: new Date() };
      case "ACTIVE":
      case "RESERVED":
        return existing.stockQty > 0
          ? { status, soldAt: null }
          : {
              status,
              soldAt: null,
              error:
                status === "ACTIVE"
                  ? "This item has no stock left. Set a quantity on the edit form before listing it again."
                  : null,
            };
      case "UNAVAILABLE":
        return { status, stockQty: 0, soldAt: null };
      default:
        return { status };
    }
  })();

  if ("error" in data && data.error) return { ok: false, error: data.error };

  await prisma.product.update({ where: { id }, data });
  await audit(actorId, "product.status_changed", "product", id, { from: existing.status, to: status });
  return { ok: true };
}

export async function addAdminProductNote(
  productId: string,
  body: string,
  authorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, error: "That product no longer exists." };
  await prisma.adminNote.create({ data: { productId, body, authorId } });
  await audit(authorId, "product.note_added", "product", productId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listAdminCategories() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      parentId: true,
      sortOrder: true,
      isActive: true,
      parent: { select: { id: true, name: true } },
      _count: { select: { products: true, children: true } },
    },
  });
}

async function uniqueCategorySlug(desired: string, excludeId?: string): Promise<string> {
  const base = slugify(desired) || "category";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await prisma.category.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === excludeId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createAdminCategory(
  input: CategoryInput,
  actorId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const slug = await uniqueCategorySlug(input.slug || input.name);
  const parentId = await resolveParentId(input.parentId, null);
  const category = await prisma.category.create({
    data: {
    name: input.name,
      slug,
      description: input.description || null,
      imageUrl: input.imageUrl || null,
      parentId,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
    select: { id: true },
  });
  await audit(actorId, "category.created", "category", category.id, { name: input.name, parentId });
  return { ok: true, id: category.id };
}

/**
 * Reject a parent that would create a cycle, and null out one that has gone.
 * The tree is only two deep in practice, but a self-parent loop would make
 * `getCategoryTree` recurse forever.
 */
async function resolveParentId(
  desired: string | null | undefined,
  selfId: string | null,
): Promise<string | null> {
  if (!desired) return null;
  if (selfId && desired === selfId) return null;
  const parent = await prisma.category.findUnique({ where: { id: desired }, select: { id: true } });
  return parent ? parent.id : null;
}

export async function updateAdminCategory(
  id: string,
  input: CategoryInput,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "That category no longer exists." };

  const slug = input.slug ? await uniqueCategorySlug(input.slug, id) : undefined;
  await prisma.category.update({
    where: { id },
    data: {
    name: input.name,
      ...(slug ? { slug } : {}),
      description: input.description || null,
      imageUrl: input.imageUrl || null,
      parentId: await resolveParentId(input.parentId, id),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  await audit(actorId, "category.updated", "category", id, { name: input.name });
  return { ok: true };
}

/** Refuses to orphan products, because Category -> Product is a required relation. */
export async function deleteAdminCategory(
  id: string,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const category = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: { select: { products: true, children: true } },
    },
  });
  if (!category) return { ok: false, error: "That category no longer exists." };
  if (category._count.products > 0) {
    return {
      ok: false,
      error: `"${category.name}" still has ${category._count.products} product(s). Move or archive them first.`,
    };
  }
  if (category._count.children > 0) {
    return {
      ok: false,
      error: `"${category.name}" still has ${category._count.children} sub-categor(y/ies). Re-parent or delete them first.`,
    };
  }

  await prisma.category.delete({ where: { id } });
  await audit(actorId, "category.deleted", "category", id, { name: category.name });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function listAdminCustomers(query?: string) {
  const search = query?.trim();
  return prisma.customer.findMany({
    where: search
      ? {
          OR: [
            { fullName: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      createdAt: true,
      _count: { select: { orders: true } },
      orders: {
        orderBy: { placedAt: "desc" },
        take: 1,
        select: { totalCents: true, placedAt: true, orderNumber: true },
      },
    },
  });
}

export async function getAdminCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      createdAt: true,
      addresses: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          phone: true,
          line1: true,
          line2: true,
          suburb: true,
          city: true,
          province: true,
          postalCode: true,
          isDefault: true,
        },
      },
      orders: {
        orderBy: { placedAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          totalCents: true,
          placedAt: true,
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Shipping configuration
// ---------------------------------------------------------------------------

export async function getAdminShippingSettings() {
  const row = await prisma.shippingSetting.findUnique({ where: { id: 1 } });
  if (row) return row;
  return prisma.shippingSetting.create({ data: { id: 1 } });
}

export async function getCatalogueReadinessSummary() {
  const rows = await prisma.product.findMany({
    where: { status: { not: "ARCHIVED" }, images: { some: { url: { startsWith: "/uploads/" } } } },
    select: readinessSelect,
  });
  const counts: Record<string, number> = { "TOTAL PRODUCTS": rows.length, READY: 0, "NEEDS REVIEW": 0, "NEEDS IMAGE": 0, "NEEDS SPECS": 0, "NEEDS PRICE": 0 };
  for (const row of rows) for (const flag of catalogueFlags(readinessInput(row))) counts[flag]++;
  return counts;
}

export async function updateAdminShippingSettings(
  input: ShippingSettingsInput,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (input.ratesConfirmed && (!input.dispatchPostalCode || input.dispatchPostalCode === "0000")) {
    return { ok: false, error: "Enter the actual dispatch postal code before confirming rates." };
  }
  await prisma.shippingSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...input },
    update: input,
  });
  await audit(actorId, "shipping.settings_updated", "shipping_setting", "1");
  return { ok: true };
}

export async function listAdminShippingRules() {
  return prisma.shippingRule.findMany({
    orderBy: [{ method: "asc" }, { sortOrder: "asc" }, { minWeightGrams: "asc" }],
    select: {
      id: true,
      name: true,
      method: true,
      minWeightGrams: true,
      maxWeightGrams: true,
      priceCents: true,
      sortOrder: true,
      isActive: true,
      notes: true,
      provinceCodes: true, postalCodePrefixes: true,
    },
  });
}

export async function createAdminShippingRule(
  input: ShippingRuleInput,
  actorId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const rule = await prisma.shippingRule.create({
    data: {
    name: input.name,
      method: input.method,
      minWeightGrams: input.minWeightGrams,
      maxWeightGrams: input.maxWeightGrams,
      priceCents: input.priceCents,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      notes: input.notes || null,
      provinceCodes: input.provinceCodes, postalCodePrefixes: input.postalCodePrefixes,
    },
    select: { id: true },
  });
  await audit(actorId, "shipping.rule_created", "shipping_rule", rule.id, { name: input.name });
  return { ok: true, id: rule.id };
}

export async function updateAdminShippingRule(
  id: string,
  input: ShippingRuleInput,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await prisma.shippingRule.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "That shipping bracket no longer exists." };

  await prisma.shippingRule.update({
    where: { id },
    data: {
    name: input.name,
      method: input.method,
      minWeightGrams: input.minWeightGrams,
      maxWeightGrams: input.maxWeightGrams,
      priceCents: input.priceCents,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      notes: input.notes || null,
      provinceCodes: input.provinceCodes, postalCodePrefixes: input.postalCodePrefixes,
    },
  });
  await audit(actorId, "shipping.rule_updated", "shipping_rule", id, { name: input.name });
  return { ok: true };
}

export async function deleteAdminShippingRule(
  id: string,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const rule = await prisma.shippingRule.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!rule) return { ok: false, error: "That shipping bracket no longer exists." };
  await prisma.shippingRule.delete({ where: { id } });
  await audit(actorId, "shipping.rule_deleted", "shipping_rule", id, { name: rule.name });
  return { ok: true };
}
