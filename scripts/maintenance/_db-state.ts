import { prisma } from "../../src/lib/db";

async function main() {
  const products = await prisma.product.findMany({
    where: { itemId: { in: Array.from({ length: 53 }, (_, i) => `2DS-${String(45 + i).padStart(4, "0")}`) } },
    select: {
      itemId: true, name: true, status: true, priceCents: true, sourceCostCents: true,
      priceManualOverride: true, marketFlag: true, disposition: true, recommendedPriceCents: true,
      sourceConfidence: true, testingStatus: true,
      itemReviewConfirmed: true, specsConfirmed: true, categoryId: true,
      measurementSource: true, productWeightGrams: true, packageLengthCm: true, packageWidthCm: true,
      packageHeightCm: true, description: true,
      images: { select: { url: true, coverMode: true, maskBoxes: true } },
    },
    orderBy: { itemId: "asc" },
  });

  for (const p of products) {
    console.log(
      `${p.itemId} | ${p.status} | cost=${p.sourceCostCents ?? "-"} conf=${p.sourceConfidence ?? "-"}` +
      ` | price=${p.priceCents ?? "-"}${p.priceManualOverride ? "*" : ""} rec=${p.recommendedPriceCents ?? "-"}` +
      ` | flag=${p.marketFlag ?? "-"} disp=${p.disposition ?? "-"}` +
      `| ms=${p.measurementSource} w=${p.productWeightGrams ?? "-"} box=${p.packageLengthCm ?? "-"}x${p.packageWidthCm ?? "-"}x${p.packageHeightCm ?? "-"}` +
      ` | review=${p.itemReviewConfirmed} specs=${p.specsConfirmed} tested=${p.testingStatus}` +
      ` | imgs=[${p.images.map((i) => `${i.coverMode}${i.maskBoxes ? ":box" : ""}`).join(",")}] cat=${p.categoryId ?? "-"}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
