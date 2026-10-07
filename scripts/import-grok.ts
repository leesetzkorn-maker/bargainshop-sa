/** Usage: npm run catalogue:import -- <grok.json> [--apply]. Default is review only. */
import { PrismaClient } from "@prisma/client";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { grokIntakeSchema, grokDraftDescription } from "../src/lib/grok-intake";
import { parsePricingTiers, pricingBreakdown, type PricingSettings } from "../src/lib/pricing";

const db = new PrismaClient();
async function main() {
  const filename = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
  if (!filename) throw new Error("Supply Grok's structured JSON file. See data/internal/grok-intake-format.md.");
  const rows = grokIntakeSchema.parse(JSON.parse(await readFile(filename, "utf8")));
  if (new Set(rows.map((row) => row.itemId)).size !== rows.length) throw new Error("Duplicate item IDs: merge multiple photos into one product review before importing.");
  const saved = await db.pricingSetting.findUniqueOrThrow({ where: { id: 1 } });
  const pricing: PricingSettings = { ...saved, tiers: parsePricingTiers(JSON.parse(saved.tiersJson)), roundingMode: saved.roundingMode === "NEAREST" ? "NEAREST" : "UP" };
  const changes = [];
  for (const row of rows) {
    const product = await db.product.findUniqueOrThrow({ where: { itemId: row.itemId }, include: { images: true } });
    if (product.status !== "DRAFT") throw new Error(`${row.itemId}: only existing drafts can be imported. Review live items in admin.`);
    if (!product.images.length) throw new Error(`${row.itemId}: attach original photos in admin first.`);
    if (row.sourceCostCents != null && product.sourceCostCents != null && row.sourceCostCents !== product.sourceCostCents) throw new Error(`${row.itemId}: Grok cost conflicts with the confirmed owner cost; resolve in admin.`);
    const cost = row.sourceCostCents ?? product.sourceCostCents;
    const recommendation = pricingBreakdown(cost, product.priceCents || null, pricing);
    const identityChanged = row.brand !== product.brand || row.model !== product.model;
    const data = {
      name: row.product, brand: row.brand ?? "", model: row.model ?? "", sourceCostCents: cost,
      condition: row.condition, conditionNote: [row.visibleCondition, row.visibleDamage].filter(Boolean).join(" ").slice(0, 400),
      description: grokDraftDescription(row), status: "DRAFT", itemReviewConfirmed: false, specsConfirmed: false,
      testingStatus: "NOT_TESTED", testedAt: null,
      ...(identityChanged ? { modelSourceUrl: "" } : {}),
      researchNotes: JSON.stringify({ source: "Grok structured observations", originalFilename: row.originalFilename, confidence: row.confidence, accessories: row.accessoriesIncluded, priorResearch: product.researchNotes }, null, 2).slice(0, 4000),
      // Existing owner prices are preserved. A recommendation is never silently made final.
    };
    changes.push({ productId: product.id, itemId: row.itemId, before: product, data, recommendation });
  }
  const reportPath = `data/internal/grok-import-${Date.now()}.json`;
  await writeFile(reportPath, JSON.stringify({ applied: process.argv.includes("--apply"), changes }, null, 2));
  if (process.argv.includes("--apply")) {
    const directory = `data/internal/backups/grok-${Date.now()}`;
    await mkdir(directory, { recursive: true });
    const databases = await db.$queryRawUnsafe<{ file: string }[]>("PRAGMA database_list");
    for (const database of databases) if (database.file) await copyFile(database.file, `${directory}/before.sqlite`);
    await copyFile(reportPath, `${directory}/changes.json`);
    await db.$transaction(changes.map((change) => db.product.update({ where: { id: change.productId }, data: change.data })));
  }
  console.log(`Reviewed ${changes.length} Grok product records. Private report: ${reportPath}. No photos deleted, prices overridden or listings published.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
