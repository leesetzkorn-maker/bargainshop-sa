/** Evidence-led catalogue pass. Defaults to read-only; never publishes products. */
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { catalogueFlags, productReadinessIssues } from "../src/lib/product-readiness";
import { DELIVERY_ESTIMATE } from "../src/lib/shipping/policy";
import { pricingBreakdown, parsePricingTiers, type PricingSettings } from "../src/lib/pricing";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
interface Research {
  itemId: string; brand: string; model: string; source: string; additionalSources?: string[];
  specifications: string; dimensions: string; weight: string; compatibility: string;
  originalAccessories: string; packaged: string; reviewed: boolean; remaining?: string;
}
async function main() {
  const research = JSON.parse(await readFile("data/internal/manufacturer-research.json", "utf8")) as { items: Research[]; unresolvedExactModels: { itemId: string; model: string; reason: string }[] };
  const releases = JSON.parse(await readFile("data/internal/photo-release.json", "utf8")) as { records: { itemId: string; originalUrl: string; originalSha256: string; newUrl: string }[] };
  const products = await db.product.findMany({ where: { status: { not: "ARCHIVED" }, images: { some: { url: { startsWith: "/uploads/" } } } }, include: { images: { orderBy: { sortOrder: "asc" } } }, orderBy: { itemId: "asc" } });
  const settings = await db.pricingSetting.findUniqueOrThrow({ where: { id: 1 } });
  const pricing: PricingSettings = { ...settings, tiers: parsePricingTiers(JSON.parse(settings.tiersJson)), roundingMode: settings.roundingMode === "NEAREST" ? "NEAREST" : "UP" };
  const before = { products, pricing: settings, shipping: await db.shippingSetting.findMany(), rules: await db.shippingRule.findMany() };
  if (apply) {
    const dir = `data/internal/backups/launch-${Date.now()}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/before.json`, JSON.stringify(before, null, 2));
    const databases = await db.$queryRawUnsafe<{ file: string }[]>("PRAGMA database_list");
    for (const database of databases) if (database.file) await copyFile(database.file, `${dir}/before.sqlite`);
  }
  const rows = [];
  for (const product of products) {
    const r = research.items.find((row) => row.itemId === product.itemId);
    const unresolved = research.unresolvedExactModels.find((row) => row.itemId === product.itemId);
    const originalImages: string[] = [];
    const acceptedOwnedEdit = releases.records.some((entry) => entry.itemId === product.itemId && product.images.some((image) => image.url === entry.newUrl));
    for (const entry of releases.records.filter((row) => row.itemId === product.itemId)) {
      if (product.images.some((image) => image.url === entry.originalUrl)) continue;
      const file = path.resolve("public", entry.originalUrl.replace(/^\//, ""));
      if (!file.startsWith(path.resolve("public/uploads/products") + path.sep)) throw new Error("Unexpected original image path");
      await access(file);
      const hash = createHash("sha256").update(await readFile(file)).digest("hex");
      if (hash !== entry.originalSha256) throw new Error(`Original photo hash differs: ${product.itemId}`);
      originalImages.push(entry.originalUrl);
    }
    const disclaimer = "Pre-owned item — please view actual-item photos for condition.";
    // Retain the recorded actual-item overview and condition; no new image interpretation.
    const prior = product.description.split("\n\nProduct details:")[0].split("\n\nVerified catalogue details:")[0].split("\n\nBrand:")[0].split("\n\nExact manufacturer specifications,")[0]
      .replace(/\n\nDelivery:[\s\S]*$/, "").replace(/\n\nPre-owned item[^\n]*/g, "");
    const description = [prior, "Product details:",
      r ? `Brand: ${r.brand}\nModel: ${r.model}\n\nManufacturer specifications: ${r.specifications}\n\nProduct dimensions: ${r.dimensions}\n\nProduct weight: ${r.weight}\n\nCompatibility: ${r.compatibility}\n\nFactory accessories (reference only): ${r.originalAccessories}\n\nPackaged specifications: ${r.packaged}` : "Exact manufacturer specifications, product dimensions and net weight: not yet verified. Existing parcel figures are operational entries, not confirmed product specifications.",
      "What's included: Only the accessories recorded in this listing and confirmed for the actual item. Factory accessories are reference information, not a promise of inclusion.",
      disclaimer, `Delivery: ${DELIVERY_ESTIMATE} Processing time may apply before dispatch.`].join("\n\n");
    const data = {
      description,
      ...(acceptedOwnedEdit && !product.cleanImageLicense ? { cleanImageLicense: "Owner-supplied actual-item photograph; previously authorized price-label edit recorded in data/internal/photo-release.json. Original condition photographs retained in this gallery; reconstructed label areas disclosed." } : {}),
      ...(r ? { brand: r.brand, model: r.model, modelSourceUrl: r.source, specsConfirmed: r.reviewed,
        researchNotes: JSON.stringify({ checkedOn: "2026-10-07", source: r.source, additionalSources: r.additionalSources ?? [], remaining: r.remaining ?? "Actual unit, accessories and parcel still need checking", image: "No manufacturer asset reuse permission established. NEEDS IMAGE EDIT if no accepted owned edit exists." }, null, 2) } :
        unresolved ? { researchNotes: `2026-10-07: ${unresolved.reason}`, specsConfirmed: false } : {}),
    };
    const final = { ...product, ...data, imageCount: product.images.length + originalImages.length };
    const flags = catalogueFlags(final);
    const estimate = pricingBreakdown(product.sourceCostCents, product.priceCents, pricing);
    rows.push({ itemId: product.itemId, name: product.name, flags, issues: productReadinessIssues(final), manufacturerSource: r?.source ?? null, originalImagesRestored: originalImages, sourceCostCents: product.sourceCostCents, sellingPriceCents: product.priceCents, ...estimate });
    if (apply) await db.$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data });
      for (const [index, url] of originalImages.entries()) await tx.productImage.create({ data: { productId: product.id, url, sortOrder: product.images.length + index, alt: "Original actual-item photograph — view for condition; any edited image is shown separately." } });
      for (const image of product.images.filter((image) => /-clean-/.test(image.url))) await tx.productImage.update({ where: { id: image.id }, data: { alt: "Edited actual-item photograph — price-label area reconstructed. See original photographs for condition." } });
    });
  }
  if (apply) await db.shippingSetting.update({ where: { id: 1 }, data: { courierEtaMinDays: 1, courierEtaMaxDays: 3, freeShippingAboveCents: 0 } });
  const counts: Record<string, number> = { "TOTAL PRODUCTS": rows.length, READY: 0, "NEEDS REVIEW": 0, "NEEDS IMAGE": 0, "NEEDS SPECS": 0, "NEEDS PRICE": 0 };
  for (const row of rows) for (const flag of row.flags) counts[flag]++;
  const report = { checkedOn: "2026-10-07", applied: apply, counts, flagsOverlap: true, manufacturerEntriesResearched: research.items.length, products: rows };
  await writeFile("data/internal/launch-catalogue.json", JSON.stringify(report, null, 2) + "\n");
  await writeFile("data/internal/launch-catalogue.md", ["# Launch catalogue — 7 October 2026", "", "Private operational report. Flags overlap. No listings published; final selling prices retained. Clean-image flags require exact-model reusable assets or accepted owned edits. Actual photographs are retained.", "", ...Object.entries(counts).map(([key, count]) => `- ${key}: ${count}`), "", "| Item | Product | Flags | Manufacturer evidence |", "| --- | --- | --- | --- |", ...rows.map((row) => `| ${row.itemId} | ${row.name} | ${row.flags.join(", ")} | ${row.manufacturerSource ? `[Source](${row.manufacturerSource})` : "Exact model / source needed"} |`)].join("\n") + "\n");
  console.log(JSON.stringify({ apply, counts, manufacturerEntriesResearched: research.items.length, originalGalleryPhotosRestored: rows.reduce((sum, row) => sum + row.originalImagesRestored.length, 0) }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
