/**
 * Apply data/internal/ezpawn-intake.json to the matching drafts.
 *
 * Testing is set to TESTED_AND_WORKING because the owner confirmed these units
 * were tested and working before the photos were taken.
 *
 * Selling prices are calculated only when sourceCostCents is a real number AND
 * the saved markup rule is switched on. No cost is invented. No markup is invented.
 * Nothing is published.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  parsePricingTiers,
  sellingPriceFromCost,
  tierForCost,
  type PricingSettings,
} from "../src/lib/pricing";

const prisma = new PrismaClient();

const BLOCKED_COST = new Set(["2DS-0056", "2DS-0059"]);

/** Owner-set selling prices, in cents. These are not the tier calculation. */
const OWNER_SELLING_PRICE = new Map<string, number>([["2DS-0045", 65_000]]);

const PUBLIC: Record<string, { description: string; conditionNote: string }> = {
  "2DS-0045": {
    conditionNote: "Used — scratches and scuffs are visible on the red lid. Tested and confirmed working before listing.",
    description:
      "A used red canister vacuum with a hose and a silver handle. Scratches and scuffs are visible on the lid. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
  "2DS-0046": {
    conditionNote: "Used — fingerprints and light wear on the back. Tested and confirmed working before listing.",
    description:
      "A used Redmi A3X, 64GB, black. Fingerprints and light wear are visible on the back. A charger was not in the photo. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new. 2DE-STORE is not affiliated with the phone brand.",
  },
  "2DS-0047": {
    conditionNote: "Used — scuffs on the aluminium back. It powers on, but it is iCloud locked.",
    description:
      "A used silver iPad marked 16GB on the back. Scuffs are visible. It powers on, but it is iCloud locked, so a new Apple ID cannot be added until the previous owner removes the lock. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
  "2DS-0048": {
    conditionNote: "Used — the controller is worn. Tested and confirmed working before listing.",
    description:
      "A used black PlayStation 4 with one black controller. The controller shows wear. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new. 2DE-STORE is not affiliated with Sony.",
  },
  "2DS-0049": {
    conditionNote: "Good — boxed set with shelf wear on the carton. Tested and confirmed working before listing.",
    description:
      "A boxed Titan set: a PS4 wireless controller and a wired gaming headset, as printed on the box. The box shows shelf wear. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
  "2DS-0050": {
    conditionNote: "Good — retail box is creased. Tested and confirmed working before listing.",
    description:
      "An Xbox One S All Digital console in its retail box. The box is creased. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new. 2DE-STORE is not affiliated with Microsoft.",
  },
  "2DS-0051": {
    conditionNote: "Used — the skin and the controller are heavily worn. Tested and confirmed working before listing.",
    description:
      "A used PlayStation 4 with a black-and-white portrait skin and one controller. The skin and the controller are heavily worn, and that wear is part of the item. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new. 2DE-STORE is not affiliated with Sony.",
  },
  "2DS-0052": {
    conditionNote: "Used — scratches on the console and wear on both controllers. Tested and confirmed working before listing.",
    description:
      "A used black Xbox One with two controllers, one grey and one with a decorative shell. Scratches on the console are visible and are part of the item. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new. 2DE-STORE is not affiliated with Microsoft.",
  },
  "2DS-0053": {
    conditionNote: "Good — boxed, with light scuffs on the carton. Tested and confirmed working before listing.",
    description:
      "A PlayStation Pulse 3D wireless headset in its retail box. The carton has light scuffs. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new. 2DE-STORE is not affiliated with Sony.",
  },
  "2DS-0054": {
    conditionNote: "Good — carton is creased and torn at the top. Tested and confirmed working before listing.",
    description:
      "A Vankyo Leisure 495W projector in its retail box. The box is creased and torn at the top. The box prints 220 lumen brightness and 1080p. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
  "2DS-0055": {
    conditionNote: "Used — dust and wear on the keyboard and palm rest. Tested and confirmed working before listing.",
    description:
      "A used Dell Latitude E7470 laptop. Dust and wear on the keyboard and palm rest are visible. Battery health was not measured as a percentage. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
  "2DS-0056": {
    conditionNote: "Used — grease and scuffs on the lid. Tested and confirmed working before listing.",
    description:
      "A used George Foreman Lean Mean Fat Grilling Machine. Grease and scuffs on the lid are visible and are part of the item. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
  "2DS-0057": {
    conditionNote: "Used — scratches and dust on the top. Tested and confirmed working before listing.",
    description:
      "A used red and black Bosch capsule coffee machine. Scratches and dust are visible. The exact model number was not readable on the photo. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
  "2DS-0058": {
    conditionNote: "Used — marks on the handle. Tested and confirmed working before listing.",
    description:
      "A used silver folding knife with a textured handle. Marks on the handle are visible. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
  "2DS-0059": {
    conditionNote: "Used — marks on the glass. Tested and confirmed working before listing.",
    description:
      "A used black Puma wristwatch on a black strap. Marks on the glass are visible. Tested and confirmed working before listing. Second-hand, not refurbished, not professionally serviced, and not new.",
  },
};

interface Draft {
  itemId: string;
  sourceCostCents: number | null;
  weightGrams: number | null;
  weightNote: string;
  shipping: string;
  sellingPriceCents: number;
  customerTotal: string;
  testing: string;
  status: string;
  markup: string;
  [key: string]: unknown;
}

async function main() {
  const path = join(process.cwd(), "data", "internal", "ezpawn-intake.json");
  const intake = JSON.parse(await readFile(path, "utf8")) as { drafts: Draft[] };
  const ids = intake.drafts.map((draft) => draft.itemId);
  if (ids.join(",") !== "2DS-0045,2DS-0046,2DS-0047,2DS-0048,2DS-0049,2DS-0050,2DS-0051,2DS-0052,2DS-0053,2DS-0054,2DS-0055,2DS-0056,2DS-0057,2DS-0058,2DS-0059") {
    throw new Error(`Unexpected item ids: ${ids.join(",")}`);
  }

  const pricingRow = await prisma.pricingSetting.findUnique({ where: { id: 1 } });
  const savedTiers = pricingRow ? parsePricingTiers(JSON.parse(pricingRow.tiersJson || "[]")) : [];
  const settings: PricingSettings | null = pricingRow
    ? {
        ...pricingRow,
        roundingMode: pricingRow.roundingMode === "NEAREST" ? "NEAREST" : "UP",
        isActive: pricingRow.isActive,
        // Saved tier JSON is the rule. An empty list keeps the stored legacy percent
        // as one open band so a missing tier file does not invent the house bands.
        tiers:
          savedTiers.length > 0
            ? savedTiers
            : [{ minCostCents: 0, belowCostCents: null, markupPercent: pricingRow.markupPercent }],
        roundingIncrementCents: pricingRow.roundingIncrementCents,
        minPriceCents: pricingRow.minPriceCents,
      }
    : null;

  const priced: string[] = [];
  const costBlocked: string[] = [];
  const shippingBlocked: string[] = [];

  for (const draft of intake.drafts) {
    const product = await prisma.product.findUnique({
      where: { itemId: draft.itemId },
      select: { id: true, sourceCostCents: true, supplierNotes: true, adminNotes: true, status: true },
    });
    if (!product) throw new Error(`Missing product ${draft.itemId}`);
    if (product.sourceCostCents !== draft.sourceCostCents) {
      throw new Error(`${draft.itemId} cost mismatch db=${product.sourceCostCents} json=${draft.sourceCostCents}`);
    }

    const copy = PUBLIC[draft.itemId];
    if (!copy) throw new Error(`No public copy for ${draft.itemId}`);

    const costKnown = draft.sourceCostCents != null && !BLOCKED_COST.has(draft.itemId);
    const ownerPrice = OWNER_SELLING_PRICE.get(draft.itemId);
    const selling =
      ownerPrice != null ? ownerPrice : costKnown && settings ? sellingPriceFromCost(draft.sourceCostCents, settings) : null;

    if (!costKnown) costBlocked.push(draft.itemId);
    shippingBlocked.push(draft.itemId);

    const shippingInternal = draft.weightGrams == null
      ? "Shipping not calculated. No measured weight. Locker delivery is not promised. Flagged for courier or admin review once it is weighed and measured."
      : `Weight ${draft.weightGrams}g is an estimate, not a measurement. Locker delivery is not promised from this estimate. ${draft.shipping}`;

    if (selling != null) {
      priced.push(`${draft.itemId} ${selling}`);
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        status: "DRAFT",
        testingStatus: "TESTED_AND_WORKING",
        testedAt: new Date("2026-09-28T00:00:00.000Z"),
        description: copy.description,
        conditionNote: copy.conditionNote,
        priceCents: selling ?? 0,
        adminNotes: [
          product.adminNotes ?? "",
          "Owner confirmed this unit was tested and working before the photos were taken.",
          "Public wording: Tested and confirmed working before listing. Not refurbished, not professionally serviced, not new.",
          selling == null
            ? "Selling price not calculated. Markup rule is not saved, or the acquisition cost is unconfirmed."
            : ownerPrice != null
              ? `Selling price set by the owner: ${selling} cents. Shop price stays internal.`
              : `Selling price calculated from the saved markup rule: ${selling} cents.`,
          shippingInternal,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });

    const tier =
      settings && draft.sourceCostCents != null ? tierForCost(draft.sourceCostCents, settings.tiers) : null;
    draft.testing = "TESTED & WORKING";
    draft.status = "DRAFT";
    draft.markup =
      ownerPrice != null
        ? "Owner set the selling price. Not the saved tier."
        : settings?.isActive && tier
          ? `${tier.markupPercent}% saved rule`
          : "not applied — no saved markup rule is switched on";
    draft.sellingPriceCents = selling ?? 0;
    draft.customerTotal = "not calculated — selling price or confirmed shipping is missing";
    draft.shipping = shippingInternal;
  }

  await writeFile(path, JSON.stringify(intake, null, 2) + "\n");
  console.log("markup", JSON.stringify(settings));
  console.log("priced", priced.length ? priced.join(" | ") : "none");
  console.log("costBlocked", costBlocked.join(","));
  console.log("shippingBlocked", shippingBlocked.join(","));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
