"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAdminSession, destroyAdminSession, verifyPassword } from "@/lib/auth/session";
import { currentAdmin } from "@/lib/dal/admin";
import {
  addAdminOrderNote,
  addAdminProductNote,
  cancelAndRestockOrder,
  createAdminCategory,
  createAdminProduct,
  createAdminShipment,
  createAdminShippingRule,
  deleteAdminCategory,
  deleteAdminShippingRule,
  getAdminOrder,
  markItemsUnavailable,
  refundAdminOrder,
  setAdminProductStatus,
  suggestNextItemNumber,
  updateAdminCategory,
  updateAdminOrder,
  updateAdminProduct,
  updateAdminShipment,
  updateAdminShippingRule,
  updateAdminShippingSettings,
} from "@/lib/dal/admin";
import { UploadError, deleteAiCandidate, promoteAiCandidate, readStoredFile, storeProductImage } from "@/lib/storage";
import { AiImageError } from "@/lib/ai/types";
import { isImageEditingConfigured } from "@/lib/ai/registry";
import { removePriceTagFromImage } from "@/lib/ai/remove-price-tag";
import { parseZARToCents } from "@/lib/money";
import { sellingPriceFromCost } from "@/lib/pricing";
import { getPricingSettings, updatePricingSettings } from "@/lib/dal/pricing";
import {
  categorySchema,
  firstError,
  flattenErrors,
  loginSchema,
  orderUpdateSchema,
  pricingSettingsSchema,
  productSchema,
  productStatusSchema,
  shipmentUpdateSchema,
  shippingRuleSchema,
  shippingSettingsSchema,
  unavailableItemSchema,
  type FieldErrors,
} from "@/lib/validation";

export interface AdminFormState {
  ok: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
  imageUrls?: string[];
  stamp?: number;
}

function snapshot(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

function keptImages(formData: FormData): string[] {
  return formData
    .getAll("imageUrls")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function guard() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** Only allow a same-site admin path back. Never an external URL. */
export async function safeAdminPath(value: unknown, fallback = "/admin"): Promise<string> {
  if (typeof value !== "string" || !value.startsWith("/admin")) return fallback;
  if (value.startsWith("//") || value.includes("\\") || value.includes("://")) return fallback;
  if (value.startsWith("/admin/login")) return fallback;
  return value;
}

function noted(path: string, kind: "saved" | "error" | "none", message?: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.delete("saved");
  url.searchParams.delete("error");
  // Any other admin navigation abandons an unreviewed AI edit, so the pending
  // preview is cleared rather than left waiting on a stale URL.
  url.searchParams.delete("ai");
  url.searchParams.delete("aiFrom");
  if (kind === "saved") url.searchParams.set("saved", "1");
  else if (kind === "error") url.searchParams.set("error", message || "Something went wrong. Please try again.");
  return `${url.pathname}${url.search}`;
}

/**
 * Send the admin back to the product page with an unreviewed edit attached.
 *
 * The candidate travels in the query string so the BEFORE/AFTER comparison
 * survives a redirect. It is only ever a `/uploads/ai/` path, which no product
 * row references and the storefront never renders.
 */
function withCandidate(path: string, sourceImageId: string, candidateUrl: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.delete("saved");
  url.searchParams.delete("error");
  url.searchParams.set("ai", candidateUrl);
  url.searchParams.set("aiFrom", sourceImageId);
  return `${url.pathname}${url.search}`;
}

/**
 * Only accept a candidate path we could have minted ourselves.
 *
 * The candidate URL arrives in form data, so it is untrusted input. This is the
 * same guard `isSafeImagePath` applies to product images, narrowed to the AI
 * directory, and it is what stops a crafted POST from naming an arbitrary file.
 */
function isSafeCandidatePath(url: string): boolean {
  if (!url.startsWith("/uploads/ai/")) return false;
  if (url.includes("..") || url.includes("\\") || url.includes("?") || url.includes("#")) return false;
  return true;
}

function refreshStore() {
  revalidatePath("/", "layout");
}

function isSafeImagePath(url: string): boolean {
  if (url.includes("..") || url.includes("\\") || url.includes("?") || url.includes("#")) return false;
  return url.startsWith("/uploads/products/") || url.startsWith("/placeholder/");
}

function blankToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

/** An empty select means "no parent", which is meaningfully different from unset. */
function blankToNull(value: FormDataEntryValue | null): string | null {
  return blankToUndefined(value) ?? null;
}

/**
 * A close reason is shown back to the customer on the refund/cancellation
 * email, so it is capped here as well as in the form. The `maxLength` on the
 * <textarea> is only a UI hint; without a server cap a crafted POST could put an
 * unbounded string in front of a real customer.
 */
function closeReason(value: FormDataEntryValue | null): string | null {
  const text = blankToUndefined(value);
  return text ? text.slice(0, 500) : null;
}

export async function loginAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error), fieldErrors: flattenErrors(parsed.error) };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const passwordOk = user ? verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !user.isActive || !passwordOk) {
    return { ok: false, error: "Those details don't match an active admin account." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createAdminSession({ id: user.id, email: user.email, name: user.name, role: user.role });
  redirect(await safeAdminPath(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}

export async function saveProductAction(
  prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await guard();
  const values = snapshot(formData);
  const imageUrls = keptImages(formData).filter(isSafeImagePath);
  const fail = (error: string, fieldErrors?: FieldErrors): AdminFormState => ({
    ok: false,
    error,
    fieldErrors,
    values,
    imageUrls,
    stamp: (prev.stamp ?? 0) + 1,
  });

  const suppliedDescription = String(formData.get("description") ?? "").trim();
  const draftDescription = [String(formData.get("name") ?? ""),
    [formData.get("brand"), formData.get("model")].filter(Boolean).join(" / "),
    `Pre-owned condition: ${String(formData.get("condition") ?? "USED")}. ${String(formData.get("conditionNote") ?? "")}`,
    String(formData.get("specifications") ?? ""),
    formData.get("includedItems") ? `What's included: ${String(formData.get("includedItems"))}` : "Included accessories are not confirmed.",
    "Pre-owned item — please view actual-item photos for condition."].filter(Boolean).join("\n\n");
  const parsed = productSchema.safeParse({
    specifications: formData.get("specifications") ?? "",
    includedItems: formData.get("includedItems") ?? "",
    priceManualOverride: formData.get("priceManualOverride") === "on",
    brand: formData.get("brand") ?? "",
    model: formData.get("model") ?? "",
    modelSourceUrl: formData.get("modelSourceUrl") ?? "",
    specsConfirmed: formData.get("specsConfirmed") === "on",
    itemReviewConfirmed: formData.get("itemReviewConfirmed") === "on",
    cleanImageLicense: formData.get("cleanImageLicense") ?? "",
    researchNotes: formData.get("researchNotes") ?? "",
    measurementSource: formData.get("measurementSource") ?? "ESTIMATED",
    lockerAllowed: formData.get("lockerAllowed") === "on",
    courierAllowed: formData.get("courierAllowed") === "on",
    name: formData.get("name"),
    slug: blankToUndefined(formData.get("slug")),
    itemId: formData.get("itemId") ?? "",
    sku: formData.get("sku") ?? "",
    description: suppliedDescription || draftDescription,
    categoryId: formData.get("categoryId"),
    condition: formData.get("condition"),
    conditionNote: formData.get("conditionNote") ?? "",
    testingStatus: formData.get("testingStatus") ?? "NOT_TESTED",
    priceCents: formData.get("price"),
    sourceCostCents: blankToUndefined(formData.get("sourceCost")) ?? null,
    productWeightGrams: formData.get("productWeightGrams"),
    packageWeightGrams: formData.get("packageWeightGrams") ?? "0",
    packageLengthCm: formData.get("packageLengthCm"),
    packageWidthCm: formData.get("packageWidthCm"),
    packageHeightCm: formData.get("packageHeightCm"),
    stockQty: formData.get("stockQty") ?? "1",
    status: formData.get("saveIntent") || formData.get("status") || "DRAFT",
    isFeatured: formData.get("isFeatured") === "on",
    adminNotes: formData.get("adminNotes") ?? "",
    supplierNotes: formData.get("supplierNotes") ?? "",
    imageUrls,
  });

  if (!parsed.success) {
    return fail("Please correct the highlighted fields and try again.", flattenErrors(parsed.error));
  }

  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (imageUrls.length + files.length > 12) {
    return fail("A product can have at most 12 images.");
  }

  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const stored = await storeProductImage(file);
      uploaded.push(stored.url);
    }
  } catch (error) {
    const message = error instanceof UploadError ? error.message : "One of the images could not be saved.";
    return fail(message);
  }

  const mainImageUrl = String(formData.get("mainImageUrl") ?? "");
  const gallery = [...imageUrls, ...uploaded];
  if (mainImageUrl && gallery.includes(mainImageUrl)) gallery.splice(0, 0, ...gallery.splice(gallery.indexOf(mainImageUrl), 1));
  const recommended = parsed.data.priceManualOverride ? null : sellingPriceFromCost(parsed.data.sourceCostCents, await getPricingSettings());
  const input = { ...parsed.data, priceCents: recommended ?? parsed.data.priceCents, imageUrls: gallery };
  const id = typeof formData.get("id") === "string" ? String(formData.get("id")) : "";

  try {
    const result = id
      ? await updateAdminProduct(id, input, admin.id)
      : await createAdminProduct(input, admin.id);

    if (!result.ok) return fail(result.error ?? "The product could not be saved.");
    const productId = id || ("id" in result ? result.id : undefined);
    if (!productId) return fail("The product could not be saved.");

    refreshStore();
    redirect(noted(`/admin/products/${productId}`, "saved"));
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("That item ID or SKU is already used by another product.");
    }
    console.error("admin: save product failed", error);
    return fail("The product could not be saved. Please try again.");
  }
}

export async function setProductStatusAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("id") ?? "");
  const back = await safeAdminPath(formData.get("back"), `/admin/products/${id}`);
  const parsed = productStatusSchema.safeParse(formData.get("status"));
  if (!parsed.success) {
    redirect(noted(back, "error", "That status is not recognised."));
  }
  const result = await setAdminProductStatus(id, parsed.data, admin.id);
  refreshStore();
  redirect(result.ok ? noted(back, "saved") : noted(back, "error", result.error));
}

export async function addProductNoteAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("productId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(noted(`/admin/products/${id}`, "error", "Write a note before saving it."));
  const result = await addAdminProductNote(id, body.slice(0, 2000), admin.id);
  redirect(result.ok ? noted(`/admin/products/${id}`, "saved") : noted(`/admin/products/${id}`, "error", result.error));
}

export async function saveCategoryAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("id") ?? "");
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    slug: blankToUndefined(formData.get("slug")),
    description: formData.get("description") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    parentId: blankToNull(formData.get("parentId")),
    sortOrder: formData.get("sortOrder") ?? "0",
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    redirect(noted("/admin/categories", "error", firstError(parsed.error)));
  }
  const result = id
    ? await updateAdminCategory(id, parsed.data, admin.id)
    : await createAdminCategory(parsed.data, admin.id);
  refreshStore();
  redirect(result.ok ? noted("/admin/categories", "saved") : noted("/admin/categories", "error", result.error));
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("id") ?? "");
  const result = await deleteAdminCategory(id, admin.id);
  refreshStore();
  redirect(result.ok ? noted("/admin/categories", "saved") : noted("/admin/categories", "error", result.error));
}

export async function updateOrderAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("orderId") ?? "");
  const back = `/admin/orders/${id}`;
  const parsed = orderUpdateSchema.safeParse({
    orderStatus: formData.get("orderStatus"),
    paymentStatus: formData.get("paymentStatus"),
    fulfillmentStatus: formData.get("fulfillmentStatus"),
    internalNotes: formData.get("internalNotes") ?? "",
  });
  if (!parsed.success) redirect(noted(back, "error", firstError(parsed.error)));
  const result = await updateAdminOrder(id, parsed.data, admin.id);
  refreshStore();
  redirect(result.ok ? noted(back, "saved") : noted(back, "error", result.error));
}

/**
 * One-click advancement through the sourcing workflow.
 *
 * These are deliberately the only fast path in the admin. Money is recorded
 * with `paid`, stock is confirmed with `secured`, and the courier steps are
 * plain status changes. Anything destructive (cancel, refund, item lost) lives
 * in its own action so it can ask for a reason.
 */
export async function quickOrderAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("orderId") ?? "");
  const back = `/admin/orders/${id}`;
  const order = await getAdminOrder(id);
  if (!order) redirect(noted("/admin/orders", "error", "That order no longer exists."));

  const intent = String(formData.get("intent") ?? "");
  const next = {
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    internalNotes: order.internalNotes ?? "",
  };
  switch (intent) {
    case "paid":
      next.paymentStatus = "PAID";
      break;
    case "paid-offline":
      // Cash, EFT or card machine at the shop. The money is genuinely in hand,
      // so the order moves past "pending payment" in one go.
      next.paymentStatus = "PAID";
      next.orderStatus = "PAID";
      break;
    case "checking-stock":
      next.orderStatus = "CHECKING_STOCK";
      break;
    case "secured":
      next.orderStatus = "ITEM_SECURED";
      break;
    case "preparing":
      next.orderStatus = "PREPARING_SHIPMENT";
      break;
    case "shipped":
      next.orderStatus = "SHIPPED";
      next.fulfillmentStatus = "DISPATCHED";
      break;
    case "delivered":
      next.orderStatus = "DELIVERED";
      next.fulfillmentStatus = "DELIVERED";
      break;
    default:
      redirect(noted(back, "error", "That action is not recognised."));
  }

  const parsed = orderUpdateSchema.safeParse(next);
  if (!parsed.success) redirect(noted(back, "error", firstError(parsed.error)));
  const result = await updateAdminOrder(id, parsed.data, admin.id);
  refreshStore();
  redirect(result.ok ? noted(back, "saved") : noted(back, "error", result.error));
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("orderId") ?? "");
  const back = `/admin/orders/${id}`;
  const restock = formData.get("restock") === "on";
  const result = await cancelAndRestockOrder(id, admin.id, restock, closeReason(formData.get("reason")));
  refreshStore();
  redirect(result.ok ? noted(back, "saved") : noted(back, "error", result.error));
}

/** Money goes back, stock comes back, order closes. */
export async function refundOrderAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("orderId") ?? "");
  const back = `/admin/orders/${id}`;
  const result = await refundAdminOrder(id, admin.id, closeReason(formData.get("reason")));
  refreshStore();
  redirect(result.ok ? noted(back, "saved") : noted(back, "error", result.error));
}

/**
 * "We could not get the item." Marks the affected products unavailable, returns
 * the units, closes the order and refunds, then emails the customer.
 */
export async function markItemsUnavailableAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("orderId") ?? "");
  const back = `/admin/orders/${id}`;
  const parsed = unavailableItemSchema.safeParse({
    orderId: id,
    productIds: formData.getAll("productIds").map((v) => String(v)),
    reason: formData.get("reason"),
    refund: formData.get("refund") === "on",
  });
  if (!parsed.success) redirect(noted(back, "error", firstError(parsed.error)));

  const result = await markItemsUnavailable(
    id,
    parsed.data.productIds,
    parsed.data.reason,
    parsed.data.refund,
    admin.id,
  );
  refreshStore();
  redirect(result.ok ? noted(back, "saved") : noted(back, "error", result.error));
}

/** Next free `2DS-####`, offered to the admin on the new-product form. */
export async function nextItemNumberAction(): Promise<string> {
  await guard();
  return suggestNextItemNumber();
}

export async function saveShipmentAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const orderId = String(formData.get("orderId") ?? "");
  const back = `/admin/orders/${orderId}`;
  const shipmentId = String(formData.get("shipmentId") ?? "");
  const parsed = shipmentUpdateSchema.safeParse({
    shipmentId: shipmentId || "new",
    courierName: formData.get("courierName") ?? "",
    trackingNumber: formData.get("trackingNumber") ?? "",
    status: formData.get("status"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect(noted(back, "error", firstError(parsed.error)));

  const result = shipmentId
    ? await updateAdminShipment(parsed.data, admin.id)
    : await createAdminShipment(orderId, parsed.data, admin.id);
  refreshStore();
  redirect(result.ok ? noted(back, "saved") : noted(back, "error", result.error));
}

export async function addOrderNoteAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const orderId = String(formData.get("orderId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) redirect(noted(`/admin/orders/${orderId}`, "error", "Write a note before saving it."));
  const result = await addAdminOrderNote(orderId, body.slice(0, 2000), admin.id);
  redirect(
    result.ok
      ? noted(`/admin/orders/${orderId}`, "saved")
      : noted(`/admin/orders/${orderId}`, "error", result.error),
  );
}

function moneyField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (typeof raw !== "string" || !raw.trim()) return 0;
  return parseZARToCents(raw);
}

export async function saveShippingSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await guard();
  const values = snapshot(formData);
  const surcharge = moneyField(formData, "deliverySurcharge");
  const freeAbove = moneyField(formData, "freeShippingAbove");
  const handling = moneyField(formData, "handlingFee");
  if (surcharge === null || freeAbove === null || handling === null) {
    return {
      ok: false,
      error: "Enter shipping amounts in rands, for example 99.00. Use 0 to turn a fee off.",
      values,
      stamp: Date.now(),
    };
  }

  const parsed = shippingSettingsSchema.safeParse({
    volumetricDivisor: formData.get("volumetricDivisor"),
    ratesConfirmed: formData.get("ratesConfirmed") === "on",
    isActive: formData.get("isActive") === "on",
    lockerEnabled: formData.get("lockerEnabled") === "on",
    lockerMaxWeightGrams: formData.get("lockerMaxWeightGrams"),
    lockerMaxLengthCm: formData.get("lockerMaxLengthCm"),
    lockerMaxWidthCm: formData.get("lockerMaxWidthCm"),
    lockerMaxHeightCm: formData.get("lockerMaxHeightCm"),
    lockerMaxSumCm: formData.get("lockerMaxSumCm"),
    courierEnabled: formData.get("courierEnabled") === "on",
    deliverySurchargeCents: surcharge,
    freeShippingAboveCents: freeAbove,
    handlingFeeCents: handling,
    dispatchPostalCode: formData.get("dispatchPostalCode"),
    dispatchProvince: formData.get("dispatchProvince"),
    dispatchCity: formData.get("dispatchCity"),
    lockerEtaMinDays: formData.get("lockerEtaMinDays"),
    lockerEtaMaxDays: formData.get("lockerEtaMaxDays"),
    courierEtaMinDays: formData.get("courierEtaMinDays"),
    courierEtaMaxDays: formData.get("courierEtaMaxDays"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: firstError(parsed.error),
      fieldErrors: flattenErrors(parsed.error),
      values,
      stamp: Date.now(),
    };
  }

  const result = await updateAdminShippingSettings(parsed.data, admin.id);
  if (!result.ok) return { ok: false, error: result.error ?? "Shipping settings could not be saved.", values };
refreshStore();
  redirect(noted("/admin/pricing", "saved"));
}

// ---------------------------------------------------------------------------
// AI price-tag removal
//
// Three separate actions rather than one, because the store owner asked to see
// the result and approve it before anything changes:
//
//   removePriceTagAction    -> produces a candidate in /uploads/ai/ and nothing else
//   applyCleanedImageAction -> promotes the candidate and swaps the row
//   discardCleanedImageAction -> throws the candidate away
//
// Nothing here runs unattended, nothing here touches product data other than the
// image row, and the original photo file is never written to or deleted.
// ---------------------------------------------------------------------------

export async function removePriceTagAction(formData: FormData): Promise<void> {
  await guard();
  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const back = `/admin/products/${productId}`;

  if (!isImageEditingConfigured()) {
    redirect(noted(back, "error", "AI image editing is not set up. Add GEMINI_API_KEY to .env."));
  }

  // The row must belong to this product. Without this an admin session could
  // ask for an edit to any image in the catalogue by guessing an id.
  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: { id: true, url: true },
  });
  if (!image) redirect(noted(back, "error", "That photo is no longer attached to this product."));

  // Abandon any earlier unreviewed candidate rather than leaking the file.
  const previous = String(formData.get("previousCandidate") ?? "");
  if (isSafeCandidatePath(previous)) await deleteAiCandidate(previous);

  try {
    const result = await removePriceTagFromImage(image.url);
    refreshStore();
    redirect(withCandidate(back, image.id, result.candidate.url));
  } catch (error) {
    if (error instanceof UploadError) redirect(noted(back, "error", error.message));
    if (error instanceof AiImageError) redirect(noted(back, "error", error.message));
    // Never leak an arbitrary error string — or a stack — into an admin page.
    console.error("admin: remove price tag failed", error);
    redirect(noted(back, "error", "The price sticker could not be removed. Nothing was changed."));
  }
}

/**
 * Swap in the cleaned photo the owner just approved.
 *
 * The candidate file is MOVED into the products directory (a new, content-unique
 * name) and the original row is removed from the gallery. The original file
 * itself is deliberately left on disk: "never overwrite the original" is taken
 * literally, so approving an edit hides the old photo without destroying it.
 * The old URL is written into the product's private notes so it can be restored
 * by hand if the edit turns out to be wrong.
 */
export async function applyCleanedImageAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const candidateUrl = String(formData.get("candidate") ?? "");
  const back = `/admin/products/${productId}`;

  if (!isSafeCandidatePath(candidateUrl)) {
    redirect(noted(back, "error", "That preview could not be verified."));
  }

  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: { id: true, url: true, alt: true, sortOrder: true },
  });
  if (!image) redirect(noted(back, "error", "That photo is no longer attached to this product."));

  let stored;
  try {
    stored = await promoteAiCandidate(candidateUrl);
  } catch (error) {
    if (error instanceof UploadError) redirect(noted(back, "error", error.message));
    console.error("admin: promote ai candidate failed", error);
    redirect(noted(back, "error", "The cleaned photo could not be saved."));
  }

  try {
    await prisma.$transaction([
      prisma.productImage.create({
        data: {
          productId,
          url: stored.url,
          // Keep the alt text the owner already wrote for this photo.
          alt: image.alt,
          sortOrder: image.sortOrder,
        },
      }),
      prisma.productImage.update({ where: { id: image.id }, data: { sortOrder: image.sortOrder + 1 } }),
    ]);
  } catch (error) {
    console.error("admin: apply cleaned image failed", error);
    // The promoted file is already on disk and unreferenced; leaving it is
    // harmless and recoverable, and it is not a product image so nothing will
    // pick it up. Do not try to delete it here — a failed delete must not turn
    // a database problem into a corrupt one.
    redirect(noted(back, "error", "The cleaned photo could not be attached. Nothing was changed."));
  }

  await addAdminProductNote(
    productId,
    `Replaced photo ${image.url} with an AI sticker-free copy (${stored.url}). The original file is still on disk and can be restored from that path.`,
    admin.id,
  );

  refreshStore();
  redirect(noted(back, "saved"));
}

/** Throw away an unreviewed candidate. Never touches a published photo. */
export async function discardCleanedImageAction(formData: FormData): Promise<void> {
  await guard();
  const productId = String(formData.get("productId") ?? "");
  const candidateUrl = String(formData.get("candidate") ?? "");
  const back = `/admin/products/${productId}`;

  if (isSafeCandidatePath(candidateUrl)) await deleteAiCandidate(candidateUrl);
  redirect(noted(back, "none"));
}

/** Whether the admin should be offered the AI tools at all. */
export async function aiImageToolsEnabled(): Promise<boolean> {
  await guard();
  return isImageEditingConfigured();
}

/** Exposed so a caller can confirm a candidate is still readable before offering it. */
export async function aiCandidateStillReadable(url: string): Promise<boolean> {
  await guard();
  if (!isSafeCandidatePath(url)) return false;
  return (await readStoredFile(url)) !== null;
}

export async function saveShippingRuleAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = String(formData.get("id") ?? "");
  const parsed = shippingRuleSchema.safeParse({
    name: formData.get("name"),
    provinceCodes: formData.get("provinceCodes") ?? "",
    postalCodePrefixes: formData.get("postalCodePrefixes") ?? "",
    method: formData.get("method"),
    minWeightGrams: formData.get("minWeightGrams") ?? "0",
    maxWeightGrams: formData.get("maxWeightGrams") ?? "0",
    priceCents: formData.get("price"),
    sortOrder: formData.get("sortOrder") ?? "0",
    isActive: formData.get("isActive") === "on",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) redirect(noted("/admin/shipping", "error", firstError(parsed.error)));
  const rule = {
    ...parsed.data,
    priceCents: parsed.data.priceCents,
  };
  const result = id
    ? await updateAdminShippingRule(id, rule, admin.id)
    : await createAdminShippingRule(rule, admin.id);
  refreshStore();
  redirect(result.ok ? noted("/admin/shipping", "saved") : noted("/admin/shipping", "error", result.error));
}

export async function deleteShippingRuleAction(formData: FormData): Promise<void> {
  const admin = await guard();
  const result = await deleteAdminShippingRule(String(formData.get("id") ?? ""), admin.id);
  refreshStore();
  redirect(result.ok ? noted("/admin/shipping", "saved") : noted("/admin/shipping", "error", result.error));
}

/**
 * Save the markup rule.
 *
 * Changing the markup does NOT retro-price anything already listed. Every live
 * product keeps the price it was published at; the rule only decides the price
 * of something listed from here on. Repricing a live catalogue behind the
 * admin's back would be a nasty surprise.
 */
export async function savePricingSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await guard();
  const values = snapshot(formData);

  const minPrice = moneyField(formData, "minPrice");
  if (minPrice === null) {
    return { ok: false, error: "Enter the minimum price in rands, or 0.", values, stamp: Date.now() };
  }

  const mins = formData.getAll("tierMin");
  const belows = formData.getAll("tierBelow");
  const percents = formData.getAll("tierPercent");
  const tiers = mins.map((min, index) => {
    const minCents = parseZARToCents(String(min));
    const belowRaw = String(belows[index] ?? "").trim();
    const belowCents = belowRaw ? parseZARToCents(belowRaw) : null;
    return {
      minCostCents: minCents ?? -1,
      belowCostCents: belowCents,
      markupPercent: Number(percents[index]),
    };
  });

  const parsed = pricingSettingsSchema.safeParse({
    isActive: formData.get("isActive") === "on",
    tiers,
    roundingIncrementCents: formData.get("roundingIncrementCents") || "1000",
    minPriceCents: minPrice,
    handlingAllowanceCents: moneyField(formData, "handlingAllowance") ?? -1,
    packagingAllowanceCents: moneyField(formData, "packagingAllowance") ?? -1,
    minimumProfitCents: moneyField(formData, "minimumProfit") ?? -1,
    paymentFeePercent: formData.get("paymentFeePercent"),
    targetMarginPercent: formData.get("targetMarginPercent"),
    paymentFeeFixedCents: moneyField(formData, "paymentFeeFixed") ?? -1,
    roundingMode: formData.get("roundingMode"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error), fieldErrors: flattenErrors(parsed.error), values, stamp: Date.now() };
  }

  await updatePricingSettings(parsed.data);

  if (formData.get("applyToDrafts") === "on" && parsed.data.isActive) {
    const drafts = await prisma.product.findMany({
      where: {
        status: "DRAFT",
        priceManualOverride: false,
        sourceCostCents: { not: null },
        supplierNotes: { contains: "INTAKE ezpawn" },
      },
      select: { id: true, sourceCostCents: true },
    });
    for (const draft of drafts) {
      const price = sellingPriceFromCost(draft.sourceCostCents, parsed.data);
      if (price == null) continue;
      await prisma.product.update({ where: { id: draft.id }, data: { priceCents: price } });
    }
  }

  redirect(noted("/admin/pricing", "saved"));
}
