"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { addAdminProductNote, createAdminProduct, currentAdmin, listAdminCategories } from "@/lib/dal/admin";
import { getPricingSettings } from "@/lib/dal/pricing";
import { analysePhotoBytes, type PhotoAnalysis } from "@/lib/intake/analyse";
import { decidePrice } from "@/lib/intake/draft";
import { classifyMarket } from "@/lib/intake/market";
import { buildPublicPhoto, type MaskBox } from "@/lib/intake/photos";
import {
  deletePendingOriginal,
  isSafeOriginalKey,
  promoteOriginal,
  readPendingOriginal,
  storePendingOriginal,
} from "@/lib/intake/private-store";
import { storeProductImageBytes } from "@/lib/photo-blackout";
import { parseZARToCents } from "@/lib/money";
import {
  COVER_MODES,
  DISPOSITIONS,
  MAX_INTAKE_PHOTOS,
  type CoverMode,
  type Disposition,
} from "@/lib/intake/constants";
import { ALLOWED_IMAGE_TYPES, flattenErrors, productSchema, type FieldErrors } from "@/lib/validation";
import type { PriceRead } from "@/lib/intake/price-read";

/**
 * Smart Product Intake — the server side of "add stock in a minute or two".
 *
 * Uploads are staged outside `public/` (a fetchable photo of the retailer's
 * tag is the private source cost), analysed without ever guessing, and turned
 * into a DRAFT listing. Nothing here publishes: the last step is always Lee
 * reviewing the product page.
 */

export interface IntakePhotoView {
  key: string;
  /** Admin-only view of the untouched upload. Never a `/uploads/...` path. */
  url: string;
  width: number;
  height: number;
  /** Candidate tag regions from the detector; these seed the mask. */
  tagBoxes: MaskBox[];
  price: PriceRead | null;
  /** True when the text read could not run at all. */
  ocrUnavailable: boolean;
  /** True when this photo was never sent for a text read (another one was). */
  ocrSkipped: boolean;
  brand: { brand: string; confidence: string; all: string[] } | null;
  productType: string | null;
  category: { id: string; name: string; score: number } | null;
  text: string;
}

export interface IntakeUploadState {
  ok: boolean;
  error?: string;
  photos?: IntakePhotoView[];
}

export interface IntakeSaveState {
  ok: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

async function guard() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

function extFor(type: string): string | null {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return null;
  }
}

function toView(key: string, analysis: PhotoAnalysis, ocrSkipped: boolean): IntakePhotoView {
  return {
    key,
    url: `/admin/photo/${key}`,
    width: analysis.width,
    height: analysis.height,
    tagBoxes: analysis.tagBoxes,
    price: analysis.price,
    ocrUnavailable: analysis.ocrUnavailable,
    ocrSkipped,
    brand: analysis.brand,
    productType: analysis.productType,
    category: analysis.category,
    text: analysis.text,
  };
}

/**
 * Stage a batch of photos and analyse them.
 *
 * Detection runs on every photo (it is cheap). The text read runs on at most
 * two — the first one that shows a tag, or the first photo when none does —
 * because the batch is one physical item and one clear tag is enough.
 */
export async function uploadIntakePhotosAction(
  _prev: IntakeUploadState,
  formData: FormData,
): Promise<IntakeUploadState> {
  await guard();

  const files = formData
    .getAll("photos")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length === 0) {
    return { ok: false, error: "Choose at least one photo to upload." };
  }
  if (files.length > MAX_INTAKE_PHOTOS) {
    return { ok: false, error: `A product can have at most ${MAX_INTAKE_PHOTOS} photos.` };
  }

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { ok: false, error: `"${file.name}" is not a JPEG, PNG, WebP or AVIF image.` };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: `"${file.name}" is larger than 8 MB.` };
    }
  }

  try {
    const categories = (await listAdminCategories()).map((category) => ({
      id: category.id,
      name: category.name,
    }));

    const staged: Array<{ key: string; bytes: Buffer; analysis: PhotoAnalysis }> = [];
    for (const file of files) {
      const ext = extFor(file.type);
      if (!ext) return { ok: false, error: `"${file.name}" is not a supported image.` };
      const bytes = Buffer.from(await file.arrayBuffer());
      const key = await storePendingOriginal(bytes, ext);
      const analysis = await analysePhotoBytes(bytes, [], { withOcr: false });
      staged.push({ key, bytes, analysis });
    }

    // Read the tag off at most two photos: one that shows a tag, or the first.
    const withTag = staged.filter((entry) => entry.analysis.tagBoxes.length > 0);
    const targets = new Set((withTag.length > 0 ? withTag : staged.slice(0, 1)).slice(0, 2).map((entry) => entry.key));

    // The client derives its batch from this state, so every photo uploaded
    // so far rides along with each new one.
    const photos: IntakePhotoView[] = _prev.ok && Array.isArray(_prev.photos) ? [..._prev.photos] : [];
    for (const entry of staged) {
      let analysis = entry.analysis;
      if (targets.has(entry.key)) {
        analysis = await analysePhotoBytes(entry.bytes, categories, { withOcr: true });
      }
      photos.push(toView(entry.key, analysis, !targets.has(entry.key)));
    }

    return { ok: true, photos };
  } catch (error) {
    console.error("intake: upload failed", error);
    return { ok: false, error: "The photos could not be saved. Please try again." };
  }
}

/** Drop a staged photo. Never touches an original that has been archived. */
export async function deleteIntakePhotoAction(formData: FormData): Promise<{ ok: boolean }> {
  await guard();
  const key = String(formData.get("key") ?? "");
  if (isSafeOriginalKey(key)) await deletePendingOriginal(key);
  return { ok: true };
}

interface PhotoPayload {
  key: string;
  boxes: MaskBox[];
  coverMode: CoverMode;
}

function parsePhotoPayload(raw: string | null): PhotoPayload[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_INTAKE_PHOTOS) return null;

  const out: PhotoPayload[] = [];
  for (const entry of parsed) {
    const row = entry as Partial<PhotoPayload>;
    if (typeof row?.key !== "string" || !isSafeOriginalKey(row.key)) return null;
    const boxes = Array.isArray(row.boxes) ? (row.boxes as MaskBox[]) : [];
    const coverMode = (COVER_MODES as readonly string[]).includes(String(row.coverMode))
      ? (row.coverMode as CoverMode)
      : boxes.length > 0
        ? "MANUAL_MASK"
        : "NONE";
    out.push({ key: row.key, boxes, coverMode });
  }
  return out;
}

/**
 * Turn the reviewed intake into a DRAFT product.
 *
 * Deliberate limits: the status is forced to DRAFT unless Lee asked to publish
 * AND the listing clears the same readiness bar as any other publish, the
 * selling price is the engine's recommendation unless Lee typed one, and the
 * market verdict is stored so a LOW MARGIN buy is visible on the product page.
 */
export async function saveIntakeAction(
  prev: IntakeSaveState,
  formData: FormData,
): Promise<IntakeSaveState> {
  const admin = await guard();
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }

  const fail = (error: string, fieldErrors?: FieldErrors): IntakeSaveState => ({
    ok: false,
    error,
    fieldErrors,
    values,
  });

  const photos = parsePhotoPayload(String(formData.get("photos") ?? ""));
  if (!photos) {
    return fail("Upload at least one photo before saving.");
  }

  const parsed = productSchema.safeParse({
    specifications: formData.get("specifications") ?? "",
    includedItems: formData.get("includedItems") ?? "",
    priceManualOverride: true,
    brand: formData.get("brand") ?? "",
    model: formData.get("model") ?? "",
    modelSourceUrl: "",
    specsConfirmed: false,
    itemReviewConfirmed: false,
    cleanImageLicense: "",
    researchNotes: "",
    measurementSource: formData.get("measurementSource") ?? "ESTIMATED",
    lockerAllowed: formData.get("lockerAllowed") === "on",
    courierAllowed: formData.get("courierAllowed") === "on",
    name: formData.get("name"),
    itemId: "",
    sku: "",
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    condition: formData.get("condition"),
    conditionNote: formData.get("conditionNote") ?? "",
    testingStatus: formData.get("testingStatus") ?? "NOT_TESTED",
    priceCents: formData.get("price"),
    sourceCostCents: String(formData.get("sourceCost") ?? "").trim() || null,
    productWeightGrams: formData.get("productWeightGrams"),
    packageWeightGrams: formData.get("packageWeightGrams") ?? "0",
    packageLengthCm: formData.get("packageLengthCm"),
    packageWidthCm: formData.get("packageWidthCm"),
    packageHeightCm: formData.get("packageHeightCm"),
    stockQty: formData.get("stockQty") ?? "1",
    status: "DRAFT",
    isFeatured: false,
    adminNotes: formData.get("adminNotes") ?? "",
    supplierNotes: formData.get("supplierNotes") ?? "",
    imageUrls: [],
  });

  if (!parsed.success) {
    return fail("Please correct the highlighted fields and try again.", flattenErrors(parsed.error));
  }

  const settings = await getPricingSettings();
  const sourceCostCents = parseZARToCents(String(formData.get("sourceCost") ?? "")) ?? null;
  const manualPriceCents = parseZARToCents(String(formData.get("price") ?? "")) ?? null;
  const decision = decidePrice({ sourceCostCents, manualPriceCents, settings });

  if (decision.priceCents <= 0) {
    return fail("Enter a selling price, or a source cost so one can be recommended.", {
      price: ["Enter a selling price, or a source cost so one can be recommended."],
    });
  }

  const dispositionRaw = String(formData.get("disposition") ?? "HOLD");
  const disposition: Disposition = (DISPOSITIONS as readonly string[]).includes(dispositionRaw)
    ? (dispositionRaw as Disposition)
    : "HOLD";

  const verdict = classifyMarket({
    sourceCostCents,
    sellingPriceCents: decision.priceCents,
    settings,
    marketCeilingCents: parseZARToCents(String(formData.get("marketCeiling") ?? "")) ?? null,
    hasComparableResearch: formData.get("comparableResearch") === "on",
  });

  const sourceConfirmed = formData.get("sourceConfirmed") === "on";
  const sourceConfidence = sourceCostCents == null ? "NONE" : sourceConfirmed ? "CONFIRMED" : "NEEDS_CONFIRMATION";

  // --- Photos: public copy from the untouched original ---------------------
  const name = parsed.data.name;
  const imageUrls: string[] = [];
  const imageMeta: Array<{ url: string; originalKey: string; coverMode: string; maskBoxes: string; alt: string }> = [];

  for (const photo of photos) {
    const original = await readPendingOriginal(photo.key);
    if (!original) {
      return fail("One of the photos is no longer available. Upload the batch again.");
    }

    const publicBytes = await buildPublicPhoto(original, { boxes: photo.boxes });
    const url = await storeProductImageBytes(publicBytes);
    await promoteOriginal(photo.key);

    imageUrls.push(url);
    imageMeta.push({
      url,
      originalKey: photo.key,
      coverMode: photo.boxes.length > 0 ? photo.coverMode : "NONE",
      maskBoxes: JSON.stringify(photo.boxes),
      alt: photo.boxes.length > 0 ? `${name} — retailer price tag covered` : name,
    });
  }

  // --- Product --------------------------------------------------------------
  try {
    const wantsPublish = disposition === "PUBLISH";
    let result = await createAdminProduct(
      { ...parsed.data, priceCents: decision.priceCents, priceManualOverride: decision.priceManualOverride, imageUrls },
      admin.id,
    );
    let published = false;

    if (!result.ok && wantsPublish) {
      // Publish was asked for but the readiness bar was not met: keep the work
      // as a draft rather than losing it, and say what stopped it.
      result = await createAdminProduct(
        { ...parsed.data, status: "DRAFT", priceCents: decision.priceCents, priceManualOverride: decision.priceManualOverride, imageUrls },
        admin.id,
      );
      if (result.ok) {
        await addAdminProductNote(
          result.id!,
          `Not published from intake. The listing must clear the readiness checks on the product page first.`,
          admin.id,
        );
      }
    } else if (result.ok && wantsPublish) {
      published = true;
    }

    if (!result.ok) return fail(result.error ?? "The product could not be saved.");
    const productId = result.id;
    if (!productId) return fail("The product could not be saved.");

    // Attach the private provenance to the image rows the DAL just created.
    for (const meta of imageMeta) {
      await prisma.productImage.updateMany({
        where: { productId, url: meta.url },
        data: { originalKey: meta.originalKey, coverMode: meta.coverMode, maskBoxes: meta.maskBoxes, alt: meta.alt },
      });
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        sourceConfidence,
        marketFlag: verdict.flag,
        disposition,
        recommendedPriceCents: decision.recommendedPriceCents,
      },
    });

    const noteParts = [
      `Intake: source cost ${sourceCostCents != null ? `R${(sourceCostCents / 100).toFixed(2)}` : "not set"} (${sourceConfidence.toLowerCase().replace("_", " ")}).`,
      decision.recommendedPriceCents != null
        ? `Engine recommended R${(decision.recommendedPriceCents / 100).toFixed(2)}; sold at R${(decision.priceCents / 100).toFixed(2)}${decision.priceManualOverride ? " (manual override)" : ""}.`
        : "",
      `Market verdict: ${verdict.label}.`,
      `Originals archived outside public/ for ${imageMeta.length} photo${imageMeta.length === 1 ? "" : "s"}.`,
    ].filter(Boolean);
    await addAdminProductNote(productId, noteParts.join(" "), admin.id);

    revalidatePath("/", "layout");
    const suffix = published ? "&published=1" : "";
    redirect(`/admin/products/${productId}?saved=1${suffix}`);
  } catch (error) {
    unstable_rethrow(error);
    console.error("intake: save failed", error);
    return fail("The product could not be saved. Please try again.");
  }
}
