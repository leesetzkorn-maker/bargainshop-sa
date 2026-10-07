/**
 * Save the tiered markup and recalculate eligible EZ Pawn drafts.
 * Does not change acquisition costs and does not publish anything.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_PRICING_SETTINGS, sellingPriceFromCost, tierForCost } from "../src/lib/pricing";

const prisma = new PrismaClient();

async function main() {
  const settings = DEFAULT_PRICING_SETTINGS;
  await prisma.pricingSetting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      isActive: true,
      markupPercent: settings.tiers[0].markupPercent,
      tiersJson: JSON.stringify(settings.tiers),
      roundingIncrementCents: settings.roundingIncrementCents,
      minPriceCents: 0,
      autoApplyToDrafts: false,
    },
    update: {
      isActive: true,
      markupPercent: settings.tiers[0].markupPercent,
      tiersJson: JSON.stringify(settings.tiers),
      roundingIncrementCents: settings.roundingIncrementCents,
      minPriceCents: 0,
    },
  });

  const drafts = await prisma.product.findMany({
    where: {
      status: "DRAFT",
      supplierNotes: { contains: "INTAKE ezpawn" },
    },
    select: { id: true, itemId: true, name: true, sourceCostCents: true, priceCents: true, adminNotes: true },
    orderBy: { itemId: "asc" },
  });

  const priced: string[] = [];
  const blocked: string[] = [];

  for (const draft of drafts) {
    const price = sellingPriceFromCost(draft.sourceCostCents, settings);
    if (price == null) {
      blocked.push(draft.itemId);
      continue;
    }
    const tier = tierForCost(draft.sourceCostCents as number, settings.tiers);
    await prisma.product.update({
      where: { id: draft.id },
      data: {
        priceCents: price,
        status: "DRAFT",
        adminNotes: [
          draft.adminNotes ?? "",
          `Selling price recalculated from the tiered markup (${tier?.markupPercent}%). Shipping is not included. Acquisition cost stays internal.`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });
    priced.push(`${draft.itemId}\tR${(price / 100).toFixed(2)}\t${tier?.markupPercent}%\t${draft.name}`);
  }

  const path = join(process.cwd(), "data", "internal", "ezpawn-intake.json");
  const intake = JSON.parse(await readFile(path, "utf8")) as {
    drafts: Array<{ itemId: string; sourceCostCents: number | null; sellingPriceCents: number; markup: string; customerTotal: string }>;
  };
  const costsBefore = intake.drafts.map((draft) => draft.sourceCostCents);
  for (const draft of intake.drafts) {
    const price = sellingPriceFromCost(draft.sourceCostCents, settings);
    const tier = draft.sourceCostCents == null ? null : tierForCost(draft.sourceCostCents, settings.tiers);
    draft.sellingPriceCents = price ?? 0;
    draft.markup = tier ? `${tier.markupPercent}% tier, rounded to the nearest R10` : "not applied — acquisition cost is not confirmed";
    draft.customerTotal = "not calculated — shipping has not been confirmed";
  }
  const costsAfter = intake.drafts.map((draft) => draft.sourceCostCents);
  if (JSON.stringify(costsBefore) !== JSON.stringify(costsAfter)) {
    throw new Error("Acquisition costs changed. Aborting the JSON write.");
  }
  await writeFile(path, JSON.stringify(intake, null, 2) + "\n");

  console.log("PRICED");
  console.log(priced.join("\n") || "(none)");
  console.log("BLOCKED");
  console.log(blocked.join("\n") || "(none)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
