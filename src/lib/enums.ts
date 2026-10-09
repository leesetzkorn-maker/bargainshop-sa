/**
 * Canonical value sets for every `String` status column.
 *
 * The database is SQLite, which has no enum type, so these are validated in
 * application code instead. Every place that writes one of these columns must
 * go through a zod schema built from these arrays (see src/lib/validation).
 */

export const PRODUCT_CONDITIONS = ["VERY_GOOD", "GOOD", "USED", "AS_IS"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const PRODUCT_CONDITION_LABELS: Record<ProductCondition, string> = {
  VERY_GOOD: "Very good",
  GOOD: "Good",
  USED: "Used",
  AS_IS: "As-is",
};

/**
 * Default grade copy. A listing can replace this with its own `conditionNote`.
 * None of these grades mean refurbished or new.
 *
 * These describe APPEARANCE ONLY. They deliberately say nothing about whether
 * the item works, because that used to be baked in here ("tested and working on
 * the checks we could do") and a cosmetic grade is not evidence of a functional
 * check. The functional claim lives in `testingStatus`, which only the seller
 * can set. See TESTING_STATUSES below.
 */
export const PRODUCT_CONDITION_BLURB: Record<ProductCondition, string> = {
  VERY_GOOD:
    "Very good — light cosmetic wear from previous use. Second-hand and pre-owned, not refurbished and not new. Testing status is stated separately on this listing.",
  GOOD:
    "Good — shows normal cosmetic signs of previous use. Second-hand and pre-owned, not refurbished and not new. Testing status is stated separately on this listing.",
  USED:
    "Used — shows normal cosmetic signs of previous use. Second-hand and pre-owned, not refurbished and not new. Testing status is stated separately on this listing.",
  AS_IS:
    "As-is — heavier wear. Any missing parts or limits are described in the listing. Second-hand and pre-owned, not refurbished and not new. Hidden faults may remain. Testing status is stated separately on this listing.",
};

// ---------------------------------------------------------------------------
// Testing attestation
// ---------------------------------------------------------------------------
/**
 * Did anyone actually switch this exact item on?
 *
 * Kept separate from `condition` so a good-looking grade can never be mistaken
 * for a working item, and so an item that was only visually checked is not
 * advertised as tested. `TESTED_AND_WORKING` is only ever set by the seller,
 * by hand, for one specific physical unit.
 */
export const TESTING_STATUSES = ["NOT_TESTED", "TESTED_AND_WORKING"] as const;
export type TestingStatus = (typeof TESTING_STATUSES)[number];

export const TESTING_STATUS_LABELS: Record<TestingStatus, string> = {
  NOT_TESTED: "Not yet tested",
  TESTED_AND_WORKING: "Tested and working",
};

/** Short badge text. Never implies more than the status does. */
export const TESTING_STATUS_BADGE: Record<TestingStatus, string> = {
  NOT_TESTED: "Testing required",
  TESTED_AND_WORKING: "Tested and working",
};

/**
 * The full customer-facing explanation.
 *
 * The point of this copy is the second sentence. "Tested" in second-hand retail
 * is routinely read as "refurbished", and we have not done that work: these
 * items are checked to confirm they function, then sold as they are. Saying so
 * plainly is what keeps the badge honest.
 */
export const TESTING_STATUS_EXPLANATION: Record<TestingStatus, string> = {
  NOT_TESTED:
    "Testing required. The store has not confirmed a physical check of this item yet. It is not described as tested, refurbished, or new.",
  TESTED_AND_WORKING:
    "Tested and working. Pre-owned item; cosmetic wear and any recorded limitations remain as described.",
};

export function normaliseTestingStatus(value: string): TestingStatus {
  return value === "TESTED_AND_WORKING" ? "TESTED_AND_WORKING" : "NOT_TESTED";
}

export function isTestedAndWorking(value: string): boolean {
  return normaliseTestingStatus(value) === "TESTED_AND_WORKING";
}

/**
 * Where a product's packed weight and box size came from.
 *
 * This is a separate axis from `condition` and from `testingStatus`, and it
 * needs to be: "tested and working" says the item functions, "used" says how it
 * looks, and neither of them says anything about whether the delivery price was
 * calculated from a real measurement or a calculated one. A customer looking at
 * a R345 courier quote deserves to know which kind of number produced it.
 */
export const MEASUREMENT_SOURCES = ["MEASURED", "ESTIMATED"] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

/** Badge text on the product page. Deliberately short. */
export const MEASUREMENT_SOURCE_BADGE: Record<MeasurementSource, string> = {
  MEASURED: "Weight & size measured",
  ESTIMATED: "Weight & size estimated",
};

/**
 * The sentence shown next to the badge, so the badge is never the whole story.
 *
 * The estimate is uplifted, so the customer is not being warned that the figure
 * might be wrong — it is being told the store will not understate delivery. The
 * one thing genuinely worth saying out loud is the consequence: if the parcel
 * turns out lighter, the store absorbs the difference, not the customer.
 */
export const MEASUREMENT_SOURCE_EXPLANATION: Record<MeasurementSource, string> = {
  MEASURED:
    "This item was weighed and measured after packing, so the delivery price below is based on those exact figures.",
  ESTIMATED:
    "Packed weight and dimensions are estimated. The delivery estimate is provisional until the parcel is weighed and measured.",
};

export function normaliseMeasurementSource(value: string): MeasurementSource {
  return value === "ESTIMATED" ? "ESTIMATED" : "MEASURED";
}

export function isEstimatedMeasurement(value: string): boolean {
  return normaliseMeasurementSource(value) === "ESTIMATED";
}


/** Older rows used Excellent / Fair. Map them so a badge still reads cleanly. */
export function normaliseCondition(value: string): ProductCondition | null {
  if (value === "EXCELLENT") return "VERY_GOOD";
  if (value === "FAIR") return "USED";
  if ((PRODUCT_CONDITIONS as readonly string[]).includes(value)) return value as ProductCondition;
  return null;
}

export function conditionLabel(value: string): string {
  const key = normaliseCondition(value);
  return key ? PRODUCT_CONDITION_LABELS[key] : value;
}

/** Product-specific note wins. Otherwise the grade blurb. */
export function conditionDescription(condition: string, note?: string | null): string {
  const trimmed = note?.trim();
  if (trimmed) return trimmed;
  const key = normaliseCondition(condition);
  return key ? PRODUCT_CONDITION_BLURB[key] : "Second-hand and pre-owned. Testing status is stated separately on this listing.";
}

export const PRODUCT_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "RESERVED",
  "SOLD_OUT",
  "UNAVAILABLE",
  "ARCHIVED",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Available",
  RESERVED: "Reserved",
  SOLD_OUT: "Sold",
  UNAVAILABLE: "Unavailable",
  ARCHIVED: "Archived",
};

/** What the customer is told. Second-hand stock moves fast, so be honest. */
export const PRODUCT_STATUS_CUSTOMER_MESSAGE: Record<ProductStatus, string | null> = {
  DRAFT: null,
  ACTIVE: null,
  RESERVED: "This item is being held for another customer and is not available right now.",
  SOLD_OUT: "This item has been sold. We list new stock every week — have a look at the latest arrivals.",
  UNAVAILABLE:
    "This item is no longer available from our shop. Sorry about that — browse the rest of the bargains instead.",
  ARCHIVED: "This item is no longer listed.",
};

/** Statuses a customer may still add to their cart. */
export const PURCHASABLE_PRODUCT_STATUSES: ProductStatus[] = ["ACTIVE"];

/** Statuses a customer can still land on from a shared or old link. */
export const PUBLICLY_REACHABLE_PRODUCT_STATUSES: ProductStatus[] = [
  "ACTIVE",
  "RESERVED",
  "SOLD_OUT",
  "UNAVAILABLE",
  "ARCHIVED",
];

/** Statuses that are deliberately kept out of search engines. */
export const INDEXABLE_PRODUCT_STATUSES: ProductStatus[] = ["ACTIVE"];

/**
 * What the admin needs to decide about each status. "Low stock" is useless when
 * everything is one-of-a-kind, so the admin-facing vocabulary is about decisions
 * rather than quantities.
 */
export const PRODUCT_STATUS_HINT: Record<ProductStatus, string> = {
  DRAFT: "never published",
  ACTIVE: "on the storefront",
  RESERVED: "held for a customer — release it or sell it",
  SOLD_OUT: "gone — add stock or archive the listing",
  UNAVAILABLE: "we could not source it — do not relist",
  ARCHIVED: "hidden from the storefront",
};

/** Statuses the dashboard surfaces as "needs a decision". */
export const ATTENTION_PRODUCT_STATUSES: ProductStatus[] = [
  "RESERVED",
  "UNAVAILABLE",
  "DRAFT",
  "SOLD_OUT",
];

export const ATTENTION_HINT =
  "Held, missing, unpublished, or sold items. Each one needs a decision from you.";

/**
 * Prisma stores these as plain strings, so a legacy row can hold a value we no
 * longer recognise. Lookups therefore return a fallback rather than `undefined`.
 */
export function productStatusHint(value: string): string {
  return PRODUCT_STATUS_HINT[value as ProductStatus] ?? "status needs review";
}

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "CHECKING_STOCK",
  "ITEM_SECURED",
  "PREPARING_SHIPMENT",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pending payment",
  PAID: "Paid",
  CHECKING_STOCK: "Checking stock",
  ITEM_SECURED: "Item secured",
  PREPARING_SHIPMENT: "Preparing shipment",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

/**
 * The order of the real-world workflow, used for the progress bar the customer
 * sees and to reject impossible status changes from the admin form.
 */
export const ORDER_WORKFLOW: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "CHECKING_STOCK",
  "ITEM_SECURED",
  "PREPARING_SHIPMENT",
  "SHIPPED",
  "DELIVERED",
];

/** Plain-language status text for the customer's order page. */
export const ORDER_STATUS_CUSTOMER_MESSAGE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "We have your order and are waiting for payment to clear.",
  PAID: "Payment received. Next we check the item is still in stock at the shop.",
  CHECKING_STOCK: "We are checking the item is still available and setting it aside for you.",
  ITEM_SECURED: "Good news — the item has been secured and paid for at our shop.",
  PREPARING_SHIPMENT: "Your item is being packed and is about to be handed to the courier.",
  SHIPPED: "On its way. The tracking details are below.",
  DELIVERED: "Delivered. Thanks for shopping second-hand with us.",
  CANCELLED: "This order was cancelled. Any amount paid is being refunded.",
  REFUNDED: "This order was cancelled and refunded.",
};

export const ORDER_STATUSES_CLOSED: OrderStatus[] = ["CANCELLED", "REFUNDED"];

export const PAYMENT_STATUSES = [
  "UNPAID",
  "PENDING",
  "AUTHORISED",
  "PAID",
  "FAILED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PENDING: "Pending",
  AUTHORISED: "Authorised",
  PAID: "Paid",
  FAILED: "Failed",
  PARTIALLY_REFUNDED: "Partly refunded",
  REFUNDED: "Refunded",
};

/** Payment states that mean money has actually arrived. */
export const PAID_PAYMENT_STATUSES: PaymentStatus[] = [
  "PAID",
  "PARTIALLY_REFUNDED",
];

export const FULFILLMENT_STATUSES = [
  "NOT_FULFILLED",
  "CHECKING_STOCK",
  "ITEM_SECURED",
  "PREPARING_SHIPMENT",
  "DISPATCHED",
  "DELIVERED",
  "RETURNED",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  NOT_FULFILLED: "Not started",
  CHECKING_STOCK: "Checking stock",
  ITEM_SECURED: "Item secured",
  PREPARING_SHIPMENT: "Packing",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
};

/**
 * Fulfillment stage -> the order status the customer sees.
 * `syncOrderStatus()` in src/lib/dal/orders.ts is the single place that applies
 * this, so an order's headline status can never disagree with its stage.
 */
export const FULFILLMENT_TO_ORDER_STATUS: Record<FulfillmentStatus, OrderStatus> = {
  NOT_FULFILLED: "PAID",
  CHECKING_STOCK: "CHECKING_STOCK",
  ITEM_SECURED: "ITEM_SECURED",
  PREPARING_SHIPMENT: "PREPARING_SHIPMENT",
  DISPATCHED: "SHIPPED",
  DELIVERED: "DELIVERED",
  RETURNED: "CANCELLED",
};

/**
 * The sourcing order status -> the stage that produces it.
 *
 * The admin's one-click buttons move the *order* status ("item secured"), but
 * `syncOrderStatus` derives the headline from the *stage*. Without this reverse
 * map, pressing "Item secured" would set an order status the derivation then
 * threw away, and the button would silently do nothing. The DAL uses this to
 * move both vocabularies together.
 */
export const ORDER_STATUS_TO_FULFILLMENT: Partial<Record<OrderStatus, FulfillmentStatus>> = {
  PAID: "NOT_FULFILLED",
  CHECKING_STOCK: "CHECKING_STOCK",
  ITEM_SECURED: "ITEM_SECURED",
  PREPARING_SHIPMENT: "PREPARING_SHIPMENT",
  SHIPPED: "DISPATCHED",
  DELIVERED: "DELIVERED",
};

/**
 * The Courier Guy's locker services. We dispatch from a locker, so the three
 * customer-facing choices are locker-to-locker, locker-to-door and
 * locker-to-kiosk; kiosk-to-door is kept for a future kiosk origin.
 */
export const SHIPPING_METHODS = [
  "LOCKER_TO_LOCKER",
  "LOCKER_TO_DOOR",
  "LOCKER_TO_KIOSK",
  "KIOSK_TO_DOOR",
] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export const SHIPPING_METHOD_LABELS: Record<ShippingMethod, string> = {
  LOCKER_TO_LOCKER: "Locker to locker",
  LOCKER_TO_DOOR: "Locker to door",
  LOCKER_TO_KIOSK: "Locker to kiosk",
  KIOSK_TO_DOOR: "Kiosk to door",
};

/** Collection services hand the parcel over at a locker/kiosk, so the customer
 *  must name the collection point. */
export const SHIPPING_COLLECTION_METHODS = ["LOCKER_TO_LOCKER", "LOCKER_TO_KIOSK"] as const;

/** To-door services are priced with the monthly fuel surcharge and are only
 *  offered once that surcharge has been confirmed. */
export const SHIPPING_DOOR_METHODS = ["LOCKER_TO_DOOR", "KIOSK_TO_DOOR"] as const;

export function isCollectionMethod(method: ShippingMethod): boolean {
  return (SHIPPING_COLLECTION_METHODS as readonly string[]).includes(method);
}

export function isDoorMethod(method: ShippingMethod): boolean {
  return (SHIPPING_DOOR_METHODS as readonly string[]).includes(method);
}

export const PAYMENT_STATUS_VALUES = [
  "INITIATED",
  "PENDING",
  "AUTHORISED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type PaymentRecordStatus = (typeof PAYMENT_STATUS_VALUES)[number];

export const SHIPMENT_STATUSES = [
  "PENDING",
  "LABEL_CREATED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
  "RETURNED",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: "Pending",
  LABEL_CREATED: "Label created",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  RETURNED: "Returned",
};

export const USER_ROLES = ["OWNER", "ADMIN", "STAFF"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  STAFF: "Staff",
};

// ---------------------------------------------------------------------------
// Transactional email
// ---------------------------------------------------------------------------
export const EMAIL_TEMPLATES = [
  "NEW_ORDER_OWNER",
  "NEW_ORDER_RECEIVED_OWNER",
  "ORDER_RECEIVED",
  "ORDER_CONFIRMED",
  "ORDER_SHIPPED",
  "ORDER_CANCELLED",
  "ORDER_REFUNDED",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  NEW_ORDER_OWNER: "New paid order (owner alert)",
  NEW_ORDER_RECEIVED_OWNER: "New order awaiting action (owner alert)",
  ORDER_RECEIVED: "Order received (customer)",
  ORDER_CONFIRMED: "Order confirmation (customer)",
  ORDER_SHIPPED: "Dispatched / tracking (customer)",
  ORDER_CANCELLED: "Order cancelled (customer)",
  ORDER_REFUNDED: "Refund notice (customer)",
};

export const EMAIL_STATUSES = [
  "SENT",
  "FAILED",
  "SKIPPED_NOT_CONFIGURED",
  "SKIPPED_NO_RECIPIENT",
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  SENT: "Sent",
  FAILED: "Failed",
  SKIPPED_NOT_CONFIGURED: "Not sent — no provider configured",
  SKIPPED_NO_RECIPIENT: "Not sent — no address on file",
};

/** Statuses that mean a message genuinely left the building. */
export const SENT_EMAIL_STATUSES: EmailStatus[] = ["SENT"];

/** Roles allowed to see private margin figures. */
export const PRIVILEGED_ROLES: UserRole[] = ["OWNER", "ADMIN"];

/**
 * SA provinces (ISO 3166-2 subdivision codes). Used by the checkout form and
 * validated server-side.
 */
export const ZA_PROVINCES = [

  { code: "EC", name: "Eastern Cape" },
  { code: "FS", name: "Free State" },
  { code: "GP", name: "Gauteng" },
  { code: "KZN", name: "KwaZulu-Natal" },
  { code: "L", name: "Limpopo" },
  { code: "MP", name: "Mpumalanga" },
  { code: "NC", name: "Northern Cape" },
  { code: "NW", name: "North West" },
  { code: "WC", name: "Western Cape" },
] as const;

export const ZA_PROVINCE_CODES = ZA_PROVINCES.map((p) => p.code) as [
  ...(typeof ZA_PROVINCES)[number]["code"][],
];

export function provinceName(code: string): string {
  return ZA_PROVINCES.find((p) => p.code === code)?.name ?? code;
}

// ---------------------------------------------------------------------------
// House numbering
// ---------------------------------------------------------------------------
/** Prefix for every human-quotable reference the store issues. */
export const ORDER_PREFIX = "2DS";

/** Product item numbers are `2DS-0001`, `2DS-0002`, ... */
export const ITEM_NUMBER_PREFIX = "2DS";
export const ITEM_NUMBER_DIGITS = 4;

export function formatItemNumber(sequence: number): string {
  return `${ITEM_NUMBER_PREFIX}-${String(sequence).padStart(ITEM_NUMBER_DIGITS, "0")}`;
}

/** Suggests the next free item number so the admin never types one by hand. */
export function nextItemNumberSuggestion(existing: string[]): string {
  const highest = existing.reduce((max, value) => {
    const match = new RegExp(`^${ITEM_NUMBER_PREFIX}-(\\d+)$`, "i").exec(value.trim());
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  return formatItemNumber(highest + 1);
}
