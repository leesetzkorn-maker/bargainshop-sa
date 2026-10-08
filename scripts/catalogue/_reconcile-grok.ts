/**
 * TEMP reconciliation report: Grok's final source catalogue (v2) vs the store DB.
 * Read-only. Prints a per-item joined table plus unmatched sets.
 */
import { readFile } from "node:fs/promises";
import { prisma } from "../../src/lib/db";

type GrokRow = {
  productId: string;
  productName: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  reviewStatus: string;
  sourceCost?: {
    source?: string;
    sourceCostCents?: number | null;
    amountRand?: number | null;
    confidence?: string;
    printedRand?: number | null;
    handwrittenRand?: number | null;
  } | null;
  ownerSellingPriceOverride?: number | null;
  ownerSellingPriceOverrideUnit?: string | null;
  condition?: string | null;
  conditionNotes?: string | null;
  includedAccessories?: string[] | null;
  exactModelConfirmed?: boolean | null;
  notes?: string | null;
  key?: string | null;
};

async function main() {
  const grok = JSON.parse(
    await readFile("data/internal/ezpawn-source-catalogue.json", "utf8"),
  ) as { products: GrokRow[] };

  const products = await prisma.product.findMany({
    select: {
      itemId: true, name: true, status: true, priceCents: true, sourceCostCents: true,
      brand: true, model: true, description: true, categoryId: true,
      measurementSource: true, productWeightGrams: true,
      packageLengthCm: true, packageWidthCm: true, packageHeightCm: true,
      itemReviewConfirmed: true, specsConfirmed: true, cleanImageLicense: true,
      priceManualOverride: true, disposition: true, marketFlag: true,
      _count: { select: { images: true } },
    },
    orderBy: { itemId: "asc" },
  });

  const byItem = new Map(products.map((p) => [p.itemId, p]));
  const dbItemIds = new Set(products.map((p) => p.itemId));

  interface Row {
    itemId: string; grokStatus: string; grokCost: number | null; grokSource: string | null;
    dbStatus: string; dbCost: number | null; dbPrice: number | null; dbOverride: boolean;
    nameMatch: boolean; category: string | null; helmetOverride: number | null;
  }
  const table: Row[] = [];
  const grokWithoutDb: IncludeRow[] = [];

  for (const row of grok.products) {
    const db = byItem.get(row.productId);
    if (!db) { grokWithoutDb.push(row); continue; }
    table.push({
      itemId: row.productId,
      grokStatus: row.reviewStatus,
      grokCost: row.sourceCost?.sourceCostCents ?? null,
      grokSource: row.sourceCost?.source ?? null,
      dbStatus: db.status,
      dbCost: db.sourceCostCents,
      dbPrice: db.priceCents,
      dbOverride: db.priceManualOverride,
      nameMatch: db.name.toLowerCase() === (row.productName ?? "").toLowerCase(),
      category: row.category,
      helmetOverride: row.ownerSellingPriceOverride ?? null,
    });
  }

  const dbWithoutGrok = products.filter((p) => !grok.products.some((r) => r.productId === p.itemId)).map((p) => ({
    itemId: p.itemId, name: p.name, status: p.status, priceCents: p.priceCents, cost: p.sourceCostCents,
  }));

  console.log("=== joined rows (grok vs db) ===");
  for (const r of table) {
    console.log(
      `${r.itemId} | grok:${r.grokStatus} cost=${r.grokCost ?? "-"} (${r.grokSource ?? "-"})` +
      ` | db:${r.dbStatus} cost=${r.dbCost ?? "-"} price=${r.dbPrice ?? "-"}${r.dbOverride ? "*" : ""}` +
      ` | nameMatch=${r.nameMatch} cat=${r.category ?? "-"}` +
      (r.helmetOverride ? ` HELMET_OVERRIDE=${r.helmetOverride}` : ""),
    );
  }

  console.log("\n=== grok rows with NO db product ===");
  for (const r of grokWithoutDb) console.log(`${r.productId} | ${r.productName} | ${r.reviewStatus} | cost=${r.sourceCost?.sourceCostCents ?? "-"}`);

  console.log("\n=== db products with NO grok row ===");
  for (const r of dbWithoutGrok) console.log(`${r.itemId} | ${r.name} | ${r.status} | price=${r.priceCents} cost=${r.cost}`);

  const helmet = table.filter((r) => r.helmetOverride);
  const xbox = table.filter((r) => r.grokSource === "owner confirmed");
  console.log(`\njoined=${table.length} grokOnly=${grokWithoutDb.length} dbOnly=${dbWithoutGrok.length}`);
  console.log(`helmets=${helmet.length} xboxRows=${xbox.length} okRows=${table.filter((r) => r.grokStatus === "OK").length}`);
  await prisma.$disconnect();
}

type IncludeRow = GrokRow;

main().catch((e) => { console.error(e); process.exit(1); });
