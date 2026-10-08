import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { productImageKey } from "../../src/lib/storage-keys";
import { renderReviewedTags, type TagPolygon } from "../../src/lib/photo-blackout/reviewed";
import { ensureMaskClean } from "../../src/lib/product-masks";

/** Dry run by default. Only hash-matched, visually reviewed retailer tag outlines
 * may be applied. OCR suggestions are never permission to paint a photograph.
 * No source file is overwritten or deleted; only ProductImage rows are changed.
 * Reports are checkpointed before/after each mutation for recovery and review.
 */
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const reviewPath = "data/internal/public-photo-tag-review.json";
interface Review {
  imageId: string; itemId: string; url: string; sha256: string;
  decision: "mask" | "clean" | "needs-review";
  polygons: TagPolygon[]; note?: string; manualReview?: string;
}
interface Outcome {
  imageId: string; itemId: string; url: string; sourceHash?: string;
  outcome: "masked" | "would-mask" | "clean" | "needs-review" | "file-missing";
  newUrl?: string; outputHash?: string; reason?: string;
  manualReview?: string;
}
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  const reviews = JSON.parse(fs.readFileSync(reviewPath, "utf8")) as { images: Review[] };
  const byId = new Map(reviews.images.map(r => [r.imageId, r]));
  if (byId.size !== reviews.images.length) throw new Error("Duplicate review image IDs.");
  // Includes archived/sold listings reachable through old product links, as well
  // as all prepared drafts, without changing visibility or publication status.
  const products = await prisma.product.findMany({
    where: { images: { some: { url: { startsWith: "/uploads/products/" } } } },
    include: { images: { orderBy: { sortOrder: "asc" } } }, orderBy: { itemId: "asc" },
  });
  const stamp = Date.now();
  const reportPath = `data/internal/public-photo-cleanup-${stamp}.json`;
  const report = { checkedOn: new Date().toISOString(), applied: apply, reviewPath, outcomes: [] as Outcome[] };
  const checkpoint = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const backupDir = path.resolve("data/backup", `public-photo-cleanup-${stamp}`);
  if (apply) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, "image-rows.json"), JSON.stringify(products.map(p => ({ itemId: p.itemId, images: p.images })), null, 2));
  }
  for (const product of products) for (const image of product.images) {
    const result: Outcome = { imageId: image.id, itemId: product.itemId, url: image.url, outcome: "needs-review" };
    report.outcomes.push(result);
    const key = productImageKey(image.url);
    if (!key) { result.reason = "Non-local photo; review without downloading or editing."; checkpoint(); continue; }
    const local = path.resolve("public/uploads/products", key);
    if (!fs.existsSync(local)) { result.outcome = "file-missing"; checkpoint(); continue; }
    const bytes = fs.readFileSync(local);
    result.sourceHash = hash(bytes);
    const review = byId.get(image.id);
    if (!review || review.itemId !== product.itemId) {
      result.reason = "No visual tag review for this image."; checkpoint(); continue;
    }
    // Deterministic content URLs make repeated runs safe even after repointing.
    if (review.decision === "mask") {
      result.manualReview = review.manualReview;
      const sourceKey = productImageKey(review.url);
      if (!sourceKey) throw new Error("Invalid reviewed source URL.");
      const source = fs.readFileSync(path.resolve("public/uploads/products", sourceKey));
      if (hash(source) !== review.sha256) throw new Error(`Reviewed source changed: ${review.url}`);
      const after = await renderReviewedTags(source, review.polygons);
      result.outputHash = hash(after);
      result.newUrl = `/uploads/products/${product.itemId.toLowerCase()}-tags-${result.outputHash.slice(0, 24)}.webp`;
      if (image.url === result.newUrl && result.sourceHash === result.outputHash) {
        result.outcome = review.manualReview ? "needs-review" : "clean";
        result.reason = review.manualReview ?? "Reviewed tag masks already applied.";
        checkpoint(); continue;
      }
      if (image.url !== review.url || result.sourceHash !== review.sha256) {
        result.reason = "Image changed since review; left untouched."; checkpoint(); continue;
      }
      result.outcome = "would-mask"; checkpoint();
      if (apply) {
        fs.copyFileSync(local, path.join(backupDir, `${image.id}-${key}`));
        await ensureMaskClean(image.id, image.url, source);
        const output = path.resolve("public/uploads/products", productImageKey(result.newUrl)!);
        if (fs.existsSync(output)) {
          if (hash(fs.readFileSync(output)) !== result.outputHash) throw new Error("Output filename collision.");
        } else fs.writeFileSync(output, after, { flag: "wx" });
        const bounds = review.polygons.map(points => ({
          x0: Math.min(...points.map(p => p[0])), y0: Math.min(...points.map(p => p[1])),
          x1: Math.max(...points.map(p => p[0])), y1: Math.max(...points.map(p => p[1])),
        }));
        const changed = await prisma.productImage.updateMany({
          where: { id: image.id, url: review.url },
          data: { url: result.newUrl, coverMode: "MANUAL_MASK", maskBoxes: JSON.stringify(bounds) },
        });
        if (changed.count !== 1) throw new Error("Image row changed during cleanup; not overwritten.");
        result.outcome = "masked";
      }
    } else if (image.url !== review.url || result.sourceHash !== review.sha256) {
      result.reason = "Image changed since review; left untouched.";
    } else {
      result.outcome = review.decision; result.reason = review.note;
    }
    checkpoint();
  }
  checkpoint();
  console.log(JSON.stringify({ reportPath, products: products.length, images: report.outcomes.length,
    manualReviewImages: report.outcomes.filter(o => o.outcome === "needs-review" || o.manualReview).length,
    counts: report.outcomes.reduce((counts, o) => ({ ...counts, [o.outcome]: (counts[o.outcome] ?? 0) + 1 }), {} as Record<string, number>) }, null, 2));
  if (!apply) console.log("DRY RUN: no files or database rows changed.");
  if (report.outcomes.some(o => o.outcome === "file-missing")) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
