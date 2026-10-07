"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { addAdminProductNote, currentAdmin } from "@/lib/dal/admin";
import { deleteStoredFile, readStoredFile } from "@/lib/storage";
import { ensureMaskClean, readMaskClean } from "@/lib/product-masks";
import { BlackoutError, normaliseBoxes, renderBlackout, storeProductImageBytes } from "@/lib/photo-blackout";

/**
 * Mask editor for EXISTING listings.
 *
 * Intake masks a photo while the upload is still private. Listings that were
 * created before intake need the same treatment once Lee lands on a tag that
 * slipped through, so this action reuses the exact same render pipeline on the
 * public copy:
 *
 *   - the first mask on a photo captures a pristine snapshot of the public file
 *     (`data/masks-clean/`) and every save renders from that snapshot, so a
 *     second mask never compounds on top of an earlier one;
 *   - saving paints a NEW content-unique file and updates the row's URL — the
 *     original archive in `data/intake/` or `data/internal/photo-originals/`
 *     is never read or written here;
 *   - saving an empty box set "resets": the pristine copy is promoted back out
 *     as a fresh URL and the cover flags are cleared.
 */

interface MaskOutcome {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function saveProductMasksAction(formData: FormData): Promise<MaskOutcome> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Sign in first." };

  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const boxesRaw = String(formData.get("boxes") ?? "");
  if (!productId || !imageId) return { ok: false, error: "Missing product or photo." };

  let boxes: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  try {
    boxes = JSON.parse(boxesRaw);
  } catch {
    return { ok: false, error: "The mask coordinates could not be read." };
  }

  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: { url: true },
  });
  if (!image) return { ok: false, error: "That photo no longer belongs to this product." };
  if (!image.url.startsWith("/uploads/products/")) {
    return { ok: false, error: "That photo does not live in the products store." };
  }

  try {
    // Pristine base: the first-ever snapshot for this photo, or the current
    // public copy captured as the snapshot.
    let base = await readMaskClean(imageId, image.url);
    if (!base) {
      const current = await readStoredFile(image.url);
      if (!current) {
        return { ok: false, error: "The photo file could not be read from disk." };
      }
      base = current;
      await ensureMaskClean(imageId, image.url, current);
    }

    const resetting = !Array.isArray(boxes) || boxes.length === 0;
    let bytes = base;
    let coverMode: string = "NONE";
    let maskBoxes: string | null = null;
    if (!resetting) {
      const normalised = normaliseBoxes(boxes);
      bytes = await renderBlackout(base, normalised);
      coverMode = "MANUAL_MASK";
      maskBoxes = JSON.stringify(normalised);
    }

    const newUrl = await storeProductImageBytes(bytes);
    const oldUrl = image.url;

    await prisma.productImage.updateMany({
      where: { id: imageId, productId },
      data: { url: newUrl, coverMode, maskBoxes },
    });

    // Only throw the old file away once the new one is fully recorded. On the
    // local driver this keeps the store directory from accumulating painted
    // copies, and it is safe even when the delete is skipped.
    await deleteStoredFile(oldUrl);

    await addAdminProductNote(
      productId,
      resetting
        ? `Mask editor: restored the pristine photo (${imageId}) and cleared its covers.`
        : `Mask editor: painted ${boxes.length} cover${boxes.length === 1 ? "" : "s"} over the price tag on ${imageId} (manual mask).`,
      admin.id,
    );

    revalidatePath("/", "layout");
    return { ok: true, url: newUrl };
  } catch (err) {
    if (err instanceof BlackoutError) return { ok: false, error: err.message };
    console.error("Mask save failed", err);
    return { ok: false, error: "The mask could not be saved. Try again." };
  }
}