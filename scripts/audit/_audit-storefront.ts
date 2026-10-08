import { readFile } from "node:fs/promises";
import { prisma } from "../../src/lib/db";

async function main() {
  const grok = JSON.parse(await readFile("data/internal/ezpawn-source-catalogue.json", "utf8")) as {
    products: Array<{ productId: string; productName: string; reviewStatus: string; key?: string; originalImages?: string[] }>;
  };
  const grokById = new Map(grok.products.map((r) => [r.productId, r]));
  const grokIds = new Set(grok.products.map((r) => r.productId));

  const products = await prisma.product.findMany({
    select: {
      itemId: true, name: true, status: true, categoryId: true, priceCents: true, sourceCostCents: true,
      createdAt: true, updatedAt: true, slug: true,
      category: { select: { name: true, slug: true } },
      images: { select: { url: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { itemId: "asc" },
  });

  const rows = [];
  for (const p of products) {
    const inGrok = grokIds.has(p.itemId);
    const g = inGrok ? grokById.get(p.itemId) : null;
    rows.push({
      itemId: p.itemId,
      status: p.status,
      name: p.name,
      grok: inGrok ? g!.productName : "-",
      grokStatus: inGrok ? g!.reviewStatus : "-",
      category: p.category?.slug ?? "-",
      price: p.priceCents,
      cost: p.sourceCostCents,
      images: p.images.length,
      photoKeys: p.images.map((i) => i.url.split("/").pop()),
      updated: p.updatedAt.toISOString().slice(0, 10),
    });
  }

  let active = 0, draft = 0, archived = 0;
  for (const r of rows) (r.status === "ACTIVE" ? active++ : r.status === "DRAFT" ? draft++ : archived++);

  console.log(`TOTAL ${rows.length}  ACTIVE=${active} DRAFT=${draft} ARCHIVED=${archived}`);
  console.log("\n== PUBLIC STOREFRONT (ACTIVE) ==");
  for (const r of rows.filter((x) => x.status === "ACTIVE"))
    console.log(`${r.itemId} | ${r.name} | grok="${r.grok}" | cost=${r.cost} price=${r.price} imgs=${r.images} ${r.photoKeys.join(", ")}`);

  console.log("\n== DRAFT ==");
  for (const r of rows.filter((x) => x.status === "DRAFT"))
    console.log(`${r.itemId} | ${r.grok !== "-" ? "GROK" : "???GROK-MISSING???"} ${r.grokStatus} | db="${r.name}" | grok="${r.grok}" | ${r.category} cost=${r.cost} price=${r.price} imgs=${r.images}`);

  console.log("\n== ARCHIVED ==");
  for (const r of rows.filter((x) => x.status === "ARCHIVED"))
    console.log(`${r.itemId} | ${r.grok !== "-" ? "CONTINUES-IN-GROK" : "OLD/NOT-IN-GROK"} | "${r.name}" | ${r.category} cost=${r.cost} price=${r.price} imgs=${r.images} upd=${r.updated}`);

  console.log("\n== CATEGORY COUNT ==");
  const byCat = new Map<string, number>();
  for (const r of rows.filter((x) => x.status !== "ARCHIVED")) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
  console.log([...byCat.entries()].map(([k, v]) => `${k}=${v}`).join("\n"));

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });