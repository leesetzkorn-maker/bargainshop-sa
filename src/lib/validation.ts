import { z } from "zod";
import { parseZARToCents } from "@/lib/money";
import {
  FULFILLMENT_STATUSES,
  MEASUREMENT_SOURCES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_VALUES,
  PRODUCT_CONDITIONS,
  PRODUCT_STATUSES,
  TESTING_STATUSES,
  SHIPMENT_STATUSES,
  SHIPPING_METHODS,
  ZA_PROVINCE_CODES,
  USER_ROLES,
} from "@/lib/enums";

/**
 * Every request body, form submission and route param passes through one of
 * these before it reaches Prisma. `FormData` is untrusted input.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
const requiredText = (label: string, min = 1, max = 500) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v));

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(90)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254)
  .email("Enter a valid email address")
  .transform((v) => v.toLowerCase());

/** Accepts 0821234567 / +27821234567 / 082 123 4567 and stores it compactly. */
export const phoneSchema = z
  .string()
  .trim()
  .min(9, "Enter a valid mobile number")
  .max(20)
  .regex(/^[+\d][\d\s()-]{7,19}$/, "Enter a valid mobile number")
  .transform((v) => v.replace(/[^\d+]/g, ""));

export const postalCodeSchema = z
  .string()
  .trim()
  .min(3, "Postal code is required")
  .max(6)
  .regex(/^\d{3,4}$/, "South African postal codes are 3 or 4 digits");

export const provinceSchema = z.enum(ZA_PROVINCE_CODES, {
  message: "Choose a province",
});

export const conditionSchema = z.enum(PRODUCT_CONDITIONS);
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export const testingStatusSchema = z.enum(TESTING_STATUSES);
export const measurementSourceSchema = z.enum(MEASUREMENT_SOURCES);
export const shippingMethodSchema = z.enum(SHIPPING_METHODS);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const paymentRecordStatusSchema = z.enum(PAYMENT_STATUS_VALUES);
export const fulfillmentStatusSchema = z.enum(FULFILLMENT_STATUSES);
export const shipmentStatusSchema = z.enum(SHIPMENT_STATUSES);
export const userRoleSchema = z.enum(USER_ROLES);

const centsSchema = z
  .number({ message: "Enter an amount" })
  .int("Amounts must be in cents")
  .min(0, "Amount cannot be negative")
  .max(100_000_000, "Amount is too large");

/** Accepts a rand value from a form field and stores cents. */
const centsInputSchema = z
  .union([z.string(), z.number()])
  .transform((v) => {
    if (typeof v === "number") return Math.round(v);
    return parseZARToCents(v) ?? Number.NaN;
  })
  .refine((n) => Number.isFinite(n) && n >= 0, "Enter a valid amount");

const gramsSchema = z.coerce
  .number()
  .int("Enter a whole number of grams")
  .min(0, "Weight cannot be negative")
  .max(100_000_000, "Weight looks too large");
const cmSchema = z.coerce
  .number()
  .min(0, "Dimension cannot be negative")
  .max(1000, "Dimension looks too large");

// ---------------------------------------------------------------------------
// Admin auth
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const categorySchema = z.object({
  name: requiredText("Category name", 2, 60),
  slug: slugSchema.optional(),
  description: optionalText(500).optional(),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  /** Null makes this a main (top-level) category. */
  parentId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .or(z.literal(""))
    .or(z.literal("none"))
    .transform((v) => (v && v !== "none" ? v : null)),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.coerce.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export const productSchema = z.object({
  specifications: z.string().trim().max(4000).default(""),
  includedItems: z.string().trim().max(2000).default(""),
  priceManualOverride: z.boolean().default(true),
  brand: z.string().trim().max(100).default(""),
  model: z.string().trim().max(100).default(""),
  modelSourceUrl: z.union([z.literal(""), z.url().startsWith("https://")]).default(""),
  specsConfirmed: z.boolean().default(false),
  itemReviewConfirmed: z.boolean().default(false),
  cleanImageLicense: z.string().trim().max(1000).default(""),
  researchNotes: z.string().trim().max(4000).default(""),
  name: requiredText("Product name", 3, 140),
  slug: slugSchema.optional(),
  itemId: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v.toUpperCase() : "")),
  sku: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v.toUpperCase() : "")),
  description: requiredText("Description", 10, 5000),
  categoryId: z.string().trim().min(1, "Choose a category"),
  condition: conditionSchema,
  conditionNote: optionalText(400).optional(),
  /**
   * The functional claim, kept apart from the cosmetic grade. Only the seller
   * can set this, and only for one specific physical unit they checked.
   */
  testingStatus: testingStatusSchema.default("NOT_TESTED"),
  /**
   * Provenance of the weight and box size. Defaulting to MEASURED is the
   * conservative direction: a hand-typed figure that nobody labelled is treated
   * as a real measurement, which is the one thing the store is entitled to
   * assume when someone typed it into the form themselves.
   */
  measurementSource: measurementSourceSchema.default("MEASURED"),
  lockerAllowed: z.boolean().default(true),
  courierAllowed: z.boolean().default(true),
  priceCents: centsInputSchema,
  sourceCostCents: centsInputSchema.nullable().optional(),
  productWeightGrams: gramsSchema,
  packageWeightGrams: gramsSchema.default(0),
  packageLengthCm: cmSchema,
  packageWidthCm: cmSchema,
  packageHeightCm: cmSchema,
  stockQty: z.coerce.number().int().min(0, "Stock cannot be negative").max(10_000).default(1),
  status: productStatusSchema.default("DRAFT"),
  isFeatured: z.coerce.boolean().default(false),
  adminNotes: optionalText(4000).optional(),
  supplierNotes: optionalText(2000).optional(),
  /** Existing image URLs carried through the form. New files arrive as uploads. */
  imageUrls: z
    .array(z.string().trim().min(1).max(500))
    .max(12)
    .default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

// ---------------------------------------------------------------------------
// Cart / checkout
// ---------------------------------------------------------------------------
export const cartLineSchema = z.object({
  slug: slugSchema,
  quantity: z.coerce.number().int().min(1).max(10),
});
export type CartLineInput = z.infer<typeof cartLineSchema>;

export const addToCartSchema = z.object({
  slug: slugSchema,
  quantity: z.coerce.number().int().min(1).max(10).default(1),
  /** Skip the cart and go straight to checkout (Buy Now). */
  buyNow: z.coerce.boolean().default(false),
});

export const updateCartLineSchema = z.object({
  slug: slugSchema,
  quantity: z.coerce.number().int().min(0).max(10),
});

export const checkoutSchema = z.object({
  fullName: requiredText("Full name", 2, 120),
  email: emailSchema,
  phone: phoneSchema,
  line1: requiredText("Street address", 3, 200),
  line2: optionalText(200).optional(),
  suburb: requiredText("Suburb", 1, 120),
  city: requiredText("City", 1, 120),
  province: provinceSchema,
  postalCode: postalCodeSchema,
  deliveryMethod: shippingMethodSchema,
  pickupPoint: optionalText(300).optional(),
  quotedShippingCents: z.coerce.number().int().min(0).optional(),
  quotedSubtotalCents: z.coerce.number().int().min(0).optional(),
  orderNotes: optionalText(1000).optional(),
  /** Honeypot: real customers never fill this in. */
  website: z.string().max(0, "Rejected").optional().or(z.literal("")),
}).refine((input) => input.deliveryMethod !== "LOCKER" || Boolean(input.pickupPoint?.trim()), { message: "Enter the chosen locker or pickup-point name, location and reference.", path: ["pickupPoint"] });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------------------------------------------------------------------------
// Markup. Inactive until the owner turns it on. 0% is not a hidden default price.
// ---------------------------------------------------------------------------
export const pricingTierSchema = z.object({
  minCostCents: z.number().int().min(0),
  belowCostCents: z.number().int().positive().nullable(),
  markupPercent: z.number().int().min(0).max(500),
});

export const pricingSettingsSchema = z.object({
  isActive: z.coerce.boolean().default(true),
  tiers: z.array(pricingTierSchema).min(1, "Add at least one markup tier"),
  roundingIncrementCents: z.coerce.number().int().min(0).max(100_000).default(1000),
  minPriceCents: z.coerce.number().int().min(0).max(10_000_000).default(0),
  handlingAllowanceCents: z.number().int().min(0).max(10_000_000).default(2500),
  packagingAllowanceCents: z.number().int().min(0).max(10_000_000).default(1500),
  minimumProfitCents: z.number().int().min(0).max(10_000_000).default(7500),
  paymentFeePercent: z.coerce.number().min(0).max(30).default(3),
  paymentFeeFixedCents: z.number().int().min(0).max(100_000).default(0),
  roundingMode: z.enum(["NEAREST", "UP"]).default("UP"),
  targetMarginPercent: z.coerce.number().min(0).max(60).default(25),
});
export type PricingSettingsInput = z.infer<typeof pricingSettingsSchema>;

// ---------------------------------------------------------------------------
// Shipping configuration
// ---------------------------------------------------------------------------
export const shippingSettingsSchema = z.object({
  volumetricDivisor: z.coerce.number().int().min(1000).max(10000).default(5000),
  ratesConfirmed: z.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
  lockerEnabled: z.coerce.boolean().default(true),
  lockerMaxWeightGrams: gramsSchema,
  lockerMaxLengthCm: cmSchema,
  lockerMaxWidthCm: cmSchema,
  lockerMaxHeightCm: cmSchema,
  lockerMaxSumCm: cmSchema,
  courierEnabled: z.coerce.boolean().default(true),
  deliverySurchargeCents: centsSchema.default(0),
  freeShippingAboveCents: centsSchema.default(0),
  handlingFeeCents: centsSchema.default(0),
  dispatchPostalCode: postalCodeSchema,
  dispatchProvince: provinceSchema,
  dispatchCity: requiredText("Dispatch city", 2, 120),
  lockerEtaMinDays: z.coerce.number().int().min(0).max(30).default(1),
  lockerEtaMaxDays: z.coerce.number().int().min(0).max(60).default(3),
  courierEtaMinDays: z.coerce.number().int().min(0).max(30).default(2),
  courierEtaMaxDays: z.coerce.number().int().min(0).max(60).default(5),
});
export type ShippingSettingsInput = z.infer<typeof shippingSettingsSchema>;

export const shippingRuleSchema = z
  .object({
    name: requiredText("Bracket name", 2, 80),
    method: shippingMethodSchema,
    minWeightGrams: gramsSchema,
    maxWeightGrams: gramsSchema,
    priceCents: centsInputSchema,
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
    isActive: z.coerce.boolean().default(true),
    notes: optionalText(500).optional(),
    provinceCodes: z.string().trim().max(100).default("").refine((value) => !value || value.split(",").every((code) => (ZA_PROVINCE_CODES as readonly string[]).includes(code.trim().toUpperCase())), "Enter valid comma-separated province codes"),
    postalCodePrefixes: z.string().trim().max(300).default("").refine((value) => !value || value.split(",").every((prefix) => /^\d{1,4}$/.test(prefix.trim())), "Enter comma-separated postcode prefixes (1–4 digits)"),
  })
  .refine((v) => v.maxWeightGrams === 0 || v.maxWeightGrams > v.minWeightGrams, {
    message: "Maximum weight must be 0 (no limit) or greater than the minimum",
    path: ["maxWeightGrams"],
  }).refine((v) => !v.isActive || v.priceCents > 0, { message: "Active delivery tariffs must have a confirmed positive price.", path: ["priceCents"] });
export type ShippingRuleInput = z.infer<typeof shippingRuleSchema>;

// ---------------------------------------------------------------------------
// Order management (admin)
// ---------------------------------------------------------------------------
export const orderUpdateSchema = z.object({
  orderStatus: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  internalNotes: optionalText(4000).optional(),
  /** Why the order was closed. Shown to the customer on the refund email. */
  cancelReason: optionalText(500).optional(),
});
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;

/**
 * The "the shop no longer has it" flow, which is the single most important
 * admin action in this business: it has to record a reason, cancel the order,
 * return the stock and tell the customer they will be refunded.
 */
export const unavailableItemSchema = z.object({
  orderId: z.string().trim().min(1),
  /** Product ids on this order that are no longer at the shop. */
  productIds: z.array(z.string().trim().min(1)).min(1, "Choose at least one item"),
  reason: requiredText("Reason", 5, 500),
  /** What to do with the money. */
  refund: z.coerce.boolean().default(true),
});
export type UnavailableItemInput = z.infer<typeof unavailableItemSchema>;

export const shipmentUpdateSchema = z.object({
  shipmentId: z.string().trim().min(1),
  courierName: z.string().trim().max(80).optional().or(z.literal("")),
  trackingNumber: z.string().trim().max(80).optional().or(z.literal("")),
  status: shipmentStatusSchema,
  notes: optionalText(1000).optional(),
});
export type ShipmentUpdateInput = z.infer<typeof shipmentUpdateSchema>;

export const addOrderNoteSchema = z.object({
  orderId: z.string().trim().min(1),
  body: requiredText("Note", 1, 2000),
});
export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;

export const addProductNoteSchema = z.object({
  productId: z.string().trim().min(1),
  body: requiredText("Note", 1, 2000),
});
export type AddProductNoteInput = z.infer<typeof addProductNoteSchema>;

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export const adminNoteSchema = z.object({
  body: requiredText("Note", 1, 2000),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export type FieldErrors = Record<string, string[]>;

/** First error message per field, for rendering next to inputs. */
export function flattenErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    if (!out[key]) out[key] = [];
    out[key].push(issue.message);
  }
  return out;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again";
}
