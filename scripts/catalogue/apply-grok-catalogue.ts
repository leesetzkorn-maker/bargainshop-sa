/**
 * Reconcile Grok's FINAL structured source catalogue with the store database.
 *
 * Scope (locked to the review rows Lee accepted):
 *   - update the 52 EXISTING products that Grok's catalogue also lists
 *     (2DS-0045..2DS-0097 minus items the catalogue does not reference),
 *   - NEVER create the proposed 2DS-0098+ rows (Xbox games, extra drills);
 *     the catalogue itself says those drafts must not be minted until the
 *     review rows are accepted, and they have no public photographs yet,
 *   - NEVER touch photos, originals, descriptions, statuses, testing records,
 *     item review/specs flags, measurements or the two live ACTIVE listings,
 *   - a source cost already in the DB is authoritative: a DIFFERENT Grok cost
 *     is a conflict (recorded, skipped) not an overwrite,
 *   - identity fields (name, brand, model, condition, accessories) are applied
 *     only for rows Grok marks reviewStatus OK,
 *   - the pricing engine (same code path as intake) sets recommendations and
 *     market verdicts for every product with a confirmed source cost, and
 *     fills a missing selling price from the recommendation.
 *
 * Usage:
 *   tsx --require ./scripts/maintenance/_preload.cjs scripts/catalogue/apply-grok-catalogue.ts        # dry run
 *   tsx --require ./scripts/maintenance/_preload.cjs scripts/catalogue/apply-grok-catalogue.ts --apply
 */
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import {
  parsePricingTiers,
  sellingPriceFromCost,
  type PricingSettings,
} from "../../src/lib/pricing";
import { classifyMarket } from "../../src/lib/intake/market";
import { SOURCE_CONFIDENCES, type SourceConfidence } from "../../src/lib/intake/constants";

const prisma = new PrismaClient();

interface GrokRow {
  productId: string;
  productName: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  condition: string | null;
  conditionNotes: string | null;
  includedAccessories?: string[] | null;
  reviewStatus: string;
  sourceCost?: {
    source?: string | null;
    sourceCostCents?: number | null;
    confidence?: string | null;
  } | null;
  ownerSellingPriceOverride?: number | null;
  ownerSellingPriceOverrideUnit?: string | null;
}

interface Change {
  itemId: string;
  name?: string;
  brand?: string;
  model?: string;
  condition?: string;
  conditionNote?: string;
  includedItems?: string;
  sourceCostCents?: number;
  sourceConfidence?: SourceConfidence;
  priceCents?: number;
  priceManualOverride?: boolean;
  recommendedPriceCents?: number;
  marketFlag?: string | null;
  notes?: string[];
}

const APPLY = process.argv.includes("--apply");

async function loadPricingSettings(): Promise<PricingSettings> {
  const row = await prisma.pricingSetting.findUnique({ where: { id: 1 } });
  if (!row) throw new Error("pricingSetting id=1 is missing; open Admin → Pricing first.");
  const savedTiers = parsePricingTiers(JSON.parse(row.tiersJson || "[]"));
  return {
    isActive: row.isActive,
    tiers:
      savedTiers.length > 0
        ? savedTiers
        : [{ minCostCents: 0, belowCostCents: null, markupPercent: row.markupPercent }],
    roundingIncrementCents: row.roundingIncrementCents,
    minPriceCents: row.minPriceCents,
    handlingAllowanceCents: row.handlingAllowanceCents,
    packagingAllowanceCents: row.packagingAllowanceCents,
    minimumProfitCents: row.minimumProfitCents,
    paymentFeePercent: row.paymentFeePercent,
    paymentFeeFixedCents: row.paymentFeeFixedCents,
    roundingMode: row.roundingMode === "NEAREST" ? "NEAREST" : "UP",
    targetMarginPercent: row.targetMarginPercent,
  };
}

function confidenceFromGrok(confidence: string | null | undefined): SourceConfidence {
  if (confidence === "high") return "CONFIRMED";
  if (confidence === "medium") return "NEEDS_CONFIRMATION";
  return "NEEDS_CONFIRMATION";
}

async function main() {
  const grok = JSON.parse(
    await readFile("data/internal/ezpawn-source-catalogue.json", "utf8"),
  ) as { products: GrokRow[] };

  const settings = await loadPricingSettings();
  console.log("pricing", JSON.stringify({ isActive: settings.isActive, rounding: settings.roundingIncrementCents, tiers: settings.tiers.map((t) => `${t.markupPercent}%`).join(",") }));

  const byId = new Map(grok.products.map((row) => [row.productId, row]));
  const dbProducts = await prisma.product.findMany({
    select: {
      id: true, itemId: true, name: true, status: true, priceCents: true, sourceCostCents: true,
      priceManualOverride: true, brand: true, model: true, condition: true, conditionNote: true,
      includedItems: true, marketFlag: true, disposition: true, recommendedPriceCents: true,
      sourceConfidence: true, adminNotes: true,
    },
    orderBy: { itemId: "asc" },
  });

  const changes: Change[] = [];
  const conflicts: Array<{ itemId: string; db: number; grok: number }> = [];
  const identityDiscrepancies: Array<{ itemId: string; stored: { name: string; brand: string | null }; catalogue: { name: string; brand: string | null; model: string | null } }> = [];
  const costsApplied: string[] = [];
  const priced: string[] = [];
  const lowMargin: string[] = [];
  const notTouched: string[] = [];

  for (const product of dbProducts) {
    const row = byId.get(product.itemId);
    if (!row) {
      if (product.status !== "ARCHIVED") notTouched.push(`${product.itemId} (not in catalogue, ${product.status})`);
      continue;
    }

    const change: Change = { itemId: product.itemId };
    const noteParts: string[] = [];
    const live = product.status === "ACTIVE";

    // ---- source cost -----------------------------------------------------
    const grokCost = row.sourceCost?.sourceCostCents ?? null;
    if (product.sourceCostCents == null && grokCost != null) {
      change.sourceCostCents = grokCost;
      change.sourceConfidence = confidenceFromGrok(row.sourceCost?.confidence);
      costsApplied.push(`${product.itemId} R${(grokCost / 100).toFixed(2)}`);
      noteParts.push(`Source cost set from the final Grok catalogue: R${(grokCost / 100).toFixed(2)} (${row.sourceCost?.source}: ${row.sourceCost?.confidence}).`);
    } else if (product.sourceCostCents != null && grokCost != null && product.sourceCostCents !== grokCost) {
      // The DB value is authoritative; a different Grok read is a conflict to keep for Lee.
      if (product.itemId !== "2DS-0045") conflicts.push({ itemId: product.itemId, db: product.sourceCostCents, grok: grokCost });
      noteParts.push(`Catalogue cost R${(grokCost / 100).toFixed(2)} differs from stored R${(product.sourceCostCents / 100).toFixed(2)}; stored value kept for manual review.`);
    } else if (product.sourceCostCents == null && grokCost == null && product.sourceConfidence !== "NONE") {
      change.sourceConfidence = "NONE";
    }

    // Confidence for rows that already carry a mature cost read from Grok.
    if (product.sourceConfidence == null && product.sourceCostCents != null) {
      change.sourceConfidence = confidenceFromGrok(row.sourceCost?.confidence);
      if (!change.sourceCostCents) noteParts.push(`Source cost confidence recorded from the catalogue: ${change.sourceConfidence}.`);
    }

    // ---- identity, only for what Grok confirms (reviewStatus OK) ----------
    /**
     * Names, brands and models are NOT overwritten. The store rows were already
     * curated from the earlier review (many carry more detail than the catalogue
     * title, e.g. included accessories), and Grok's own "OK" rows can disagree
     * with the stored identity (2DS-0063 reads Bosch in the catalogue but the
     * store row says Ryobi). Mismatches are recorded in the report for Lee; the
     * catalogue is never allowed to erase a newer, more detailed listing.
     */
    if (row.reviewStatus === "OK") {
      const brandDiffers = row.brand && product.brand && row.brand !== product.brand;
      const nameDiffers = row.productName && product.name && row.productName !== product.name;
      if (brandDiffers || nameDiffers) {
        identityDiscrepancies.push({
          itemId: product.itemId,
          stored: { name: product.name, brand: product.brand },
          catalogue: { name: row.productName, brand: row.brand, model: row.model },
        });
      }
    }

    // ---- pricing engine ---------------------------------------------------
    const effectiveCost = change.sourceCostCents ?? product.sourceCostCents;
    if (effectiveCost != null) {
      const recommended = sellingPriceFromCost(effectiveCost, settings);
      if (recommended !== null) change.recommendedPriceCents = recommended;
      const ownerRand = row.ownerSellingPriceOverride;
      const ownerCents = typeof ownerRand === "number" && Number.isInteger(ownerRand) && ownerRand > 0 ? ownerRand * 100 : null;
      const currentPrice = product.priceCents > 0 ? product.priceCents : ownerCents ?? recommended ?? 0;
      const verdict = classifyMarket({
        sourceCostCents: effectiveCost,
        sellingPriceCents: currentPrice,
        settings,
        marketCeilingCents: null,
        hasComparableResearch: false,
      });
      change.marketFlag = verdict.flag;
      noteParts.push(
        recommended != null ? `Engine recommended R${(recommended / 100).toFixed(2)}; market verdict: ${verdict.label}.` : `Market verdict: ${verdict.label}.`,
      );

      if (product.priceCents <= 0 && ownerCents != null) {
        change.priceCents = ownerCents;
        change.priceManualOverride = true;
        priced.push(`${product.itemId} R${(ownerCents / 100).toFixed(2)} owner price; engine was not used`);
        noteParts.push("Owner selling price kept. Shipping is not included.");
      } else if (product.priceCents <= 0 && recommended != null) {
        change.priceCents = recommended;
        priced.push(`${product.itemId} R${(recommended / 100).toFixed(2)} from cost R${(effectiveCost / 100).toFixed(2)}`);
      } else if (ownerCents != null && product.priceCents === ownerCents) {
        noteParts.push("Owner selling price kept. Shipping is not included.");
      }
      if (verdict.flag === "LOW_MARGIN") lowMargin.push(product.itemId);
    }

    if (noteParts.length) change.notes = noteParts;
    if (Object.keys(change).some((key) => key !== "itemId" && key !== "notes")) changes.push(change);

    // Log the joined line summarising everything, so the dry run is self-reviewable.
    console.log(
      `${product.itemId} ${product.status} cost ${product.sourceCostCents ?? "-"}->${change.sourceCostCents ?? "="}` +
      ` price ${product.priceCents ?? "-"}->${change.priceCents ?? "="} rec=${change.recommendedPriceCents ?? product.recommendedPriceCents ?? "-"}` +
      ` flag ${product.marketFlag ?? "-"}->${change.marketFlag ?? "="}` +
      `${row.reviewStatus === "OK" ? " [OK]" : ""}${live ? " [LIVE]" : ""}`,
    );
  }

  // ---- never-create list (the proposed 2DS-0098+ rows) ---------------------
  const notCreated = grok.products
    .filter((row) => !dbProducts.some((p) => p.itemId === row.productId))
    .map((row) => ({ productId: row.productId, productName: row.productName, reviewStatus: row.reviewStatus, sourceCostCents: row.sourceCost?.sourceCostCents ?? null }));

  const summary = {
    applied: APPLY,
    at: new Date().toISOString(),
    totalDbProducts: dbProducts.length,
    changes: changes.length,
    conflicts,
    identityDiscrepancies,
    costsApplied,
    priced,
    lowMargin,
    notTouched,
    notCreatedCount: notCreated.length,
    notCreated: notCreated.slice(0, 60),
    helmets: dbProducts.filter((p) => p.itemId >= "2DS-0081" && p.itemId <= "2DS-0086").map((p) => ({ itemId: p.itemId, status: p.status, priceCents: p.priceCents, priceManualOverride: p.priceManualOverride })),
  };

  const reportPath = `data/internal/grok-catalogue-reconcile-${Date.now()}.json`;
  await writeFile(reportPath, JSON.stringify(summary, null, 2));

  if (!APPLY) {
    console.log(`\nDRY RUN — ${changes.length} product(s) would change. Report: ${reportPath}`);
    console.log(`conflicts=${conflicts.length} identityDiscrepancies=${identityDiscrepancies.length} costs=${costsApplied.length} priced=${priced.length} lowMargin=[${lowMargin.join(",")}]`);
    console.log(`notCreated=${notCreated.length} (${notCreated.map((r) => r.productId).join(",")})`);
    return;
  }

  // ---- apply ---------------------------------------------------------------
  const directory = `data/internal/backups/grok-catalogue-${Date.now()}`;
  await mkdir(directory, { recursive: true });
  const databases = await prisma.$queryRawUnsafe<{ file: string }[]>("PRAGMA database_list");
  for (const database of databases) if (database.file) await copyFile(database.file, `${directory}/before.sqlite`);
  await copyFile(reportPath, `${directory}/report.json`);

  await prisma.$transaction(
    changes.map((change) => {
      const prior = dbProducts.find((p) => p.itemId === change.itemId);
      return prisma.product.update({
        where: { itemId: change.itemId },
        data: {
          name: change.name,
          brand: change.brand,
          model: change.model,
          condition: change.condition,
          conditionNote: change.conditionNote,
          includedItems: change.includedItems,
          sourceCostCents: change.sourceCostCents,
          sourceConfidence: change.sourceConfidence,
          priceCents: change.priceCents,
          priceManualOverride: change.priceManualOverride,
          recommendedPriceCents: change.recommendedPriceCents,
          marketFlag: change.marketFlag,
          adminNotes: change.notes?.length
            ? [prior?.adminNotes ?? "", `Grok catalogue (${new Date().toISOString().slice(0, 10)}):`, ...change.notes]
                .filter(Boolean)
                .join("\n")
            : undefined,
        },
      });
    }),
  );

  console.log(`\nAPPLIED — ${changes.length} product(s) updated. Backup: ${directory}`);
  console.log(`conflicts=${conflicts.length} identityDiscrepancies=${identityDiscrepancies.length} costs=${costsApplied.length} priced=${priced.length} lowMargin=[${lowMargin.join(",")}]`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
