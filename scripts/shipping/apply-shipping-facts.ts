/**
 * Apply data/internal/shipping-facts.json to the photographed intake stock.
 *
 * WHY THIS EXISTS
 *
 * The shipping engine prices a parcel from weight and size. Those two fields are
 * also the reason an item cannot be sold at all: `productReadinessIssues` blocks
 * a listing that has no measurements, because a customer who can add an item to
 * the cart but cannot get a delivery quote reaches a dead end at checkout.
 *
 * The intake sheet has owner-weighed figures for a handful of small items and
 * nothing for the rest. Leaving them at zero means the shop is empty of anything
 * heavy, which is most of it. The alternative — a number typed straight into the
 * column with no record of where it came from — is how a store ends up quoting a
 * customer R75 of locker delivery for a parcel that needs a van.
 *
 * So the figures are applied with their provenance attached:
 *
 *   basis OWNER_WEIGHED -> stored as MEASURED. The owner used a scale.
 *   basis ESTIMATED      -> stored as ESTIMATED, after a safety uplift.
 *
 * The uplift is the whole safety mechanism. A South African courier bills the
 * greater of actual weight and volumetric weight, so both the mass and the box
 * are pushed UP, never down, before anything is written. An estimate therefore
 * can only ever quote more delivery than the parcel is likely to cost, never
 * less. Getting this wrong in the other direction is what actually loses money.
 *
 * NEVER OVERWRITES A REAL MEASUREMENT. A row whose weight or box size is already
 * set is skipped, so re-running this after someone has been in with a tape
 * measure cannot quietly undo their work. Pass --force to do that on purpose.
 *
 * Usage:
 *   npx tsx scripts/shipping/apply-shipping-facts.ts           # fill in the blanks only
 *   npx tsx scripts/shipping/apply-shipping-facts.ts --force   # overwrite everything
 *   npx tsx scripts/shipping/apply-shipping-facts.ts --dry-run # print, write nothing
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Safety uplift applied to an ESTIMATED figure before it is stored.
 *
 * Weight: +15%, rounded up to the next 50 g. These are real products, so the
 * published specification is close, but "close" is not a promise a courier will
 * honour — a saw that weighs 10% more than quoted still gets billed on 10% more.
 *
 * Box: +2 cm on every side, rounded up to an even number. Bulky tools and
 * appliances get a box with corner protection, so the retail carton is normally
 * not the parcel. Volumetric weight is charged on the outer box, and for a large
 * item that is the number the courier actually bills, so this is the field that
 * most needs the buffer.
 */
const ESTIMATED_WEIGHT_UPLIFT = 1.15;
const ESTIMATED_WEIGHT_ROUND_TO = 50;
const ESTIMATED_BOX_BUFFER_CM = 2;

type Basis = "OWNER_WEIGHED" | "ESTIMATED";

interface ShippingFact {
  itemId: string;
  productGrams: number;
  packagingGrams: number;
  boxCm: [number, number, number];
  basis: Basis;
  note: string;
}

const MARKER = "[shipping-facts]";

function roundUp(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function applyUplift(fact: ShippingFact) {
  if (fact.basis === "OWNER_WEIGHED") {
    return {
      measurementSource: "MEASURED" as const,
      productWeightGrams: Math.round(fact.productGrams),
      packageWeightGrams: Math.round(fact.packagingGrams),
      packageLengthCm: fact.boxCm[0],
      packageWidthCm: fact.boxCm[1],
      packageHeightCm: fact.boxCm[2],
      basis: fact.basis,
    };
  }

  const u = ESTIMATED_WEIGHT_UPLIFT;
  const buffer = ESTIMATED_BOX_BUFFER_CM;
  return {
    measurementSource: "ESTIMATED" as const,
    productWeightGrams: roundUp(fact.productGrams * u, ESTIMATED_WEIGHT_ROUND_TO),
    packageWeightGrams: roundUp(fact.packagingGrams * u, ESTIMATED_WEIGHT_ROUND_TO),
    // Longest side first, which is how a box is labelled and how the locker
    // size limit is checked.
    packageLengthCm: roundUp(fact.boxCm[0] + buffer, 2),
    packageWidthCm: roundUp(fact.boxCm[1] + buffer, 2),
    packageHeightCm: roundUp(fact.boxCm[2] + buffer, 2),
    basis: fact.basis,
  };
}

/**
 * Replace any previous run's note instead of stacking a second copy on top.
 *
 * The note is one paragraph starting with the marker, so the existing block is
 * located by its leading marker line and dropped whole.
 */
function replaceMarkedNote(existing: string | null, note: string): string {
  const lines = (existing ?? "").split("\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.startsWith(MARKER)) {
      skipping = true;
      continue;
    }
    // The previous note was a single joined paragraph, so it ends at the first
    // blank line. Everything after it is untouched admin text.
    if (skipping && line.trim() === "") {
      skipping = false;
      continue;
    }
    if (!skipping) kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
  return kept.length > 0 ? `${kept.join("\n")}\n\n${note}` : note;
}

async function main() {
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");

  const path = join(process.cwd(), "data", "internal", "shipping-facts.json");
  const file = JSON.parse(await readFile(path, "utf8")) as { items: ShippingFact[] };

  const applied: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  for (const fact of file.items) {
    const product = await prisma.product.findUnique({
      where: { itemId: fact.itemId },
      select: {
        id: true,
        itemId: true,
        productWeightGrams: true,
        packageLengthCm: true,
        packageWidthCm: true,
        packageHeightCm: true,
        measurementSource: true,
        adminNotes: true,
      },
    });

    if (!product) {
      missing.push(fact.itemId);
      continue;
    }

    const hasRealMeasurement =
      product.productWeightGrams > 0 &&
      product.packageLengthCm > 0 &&
      product.packageWidthCm > 0 &&
      product.packageHeightCm > 0;

    if (hasRealMeasurement && !force) {
      skipped.push(`${fact.itemId} (already ${product.measurementSource})`);
      continue;
    }

    const next = applyUplift(fact);
    const note = [
      MARKER,
      `Packed shipping facts applied from data/internal/shipping-facts.json.`,
      `Basis: ${fact.basis}.`,
      fact.basis === "ESTIMATED"
        ? `Safety uplift applied before storing: weight +${Math.round((ESTIMATED_WEIGHT_UPLIFT - 1) * 100)}%, box +${ESTIMATED_BOX_BUFFER_CM}cm per side. An estimate can only ever quote more delivery than the parcel should cost, never less.`
        : "Owner weighed this item. Stored as measured, with no uplift.",
      `Why these figures: ${fact.note}`,
      `Stored: item ${next.productWeightGrams}g, packaging ${next.packageWeightGrams}g, box ${next.packageLengthCm} x ${next.packageWidthCm} x ${next.packageHeightCm} cm, source ${next.measurementSource}.`,
      `To correct: open this product, replace the weight and box size with the measured numbers, set Measurement source to Measured, and delete this line.`,
    ].join(" ");

    applied.push(
      `${fact.itemId} ${next.productWeightGrams + next.packageWeightGrams}g ` +
        `${next.packageLengthCm}x${next.packageWidthCm}x${next.packageHeightCm}cm ${next.measurementSource}`,
    );

    if (dryRun) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        productWeightGrams: next.productWeightGrams,
        packageWeightGrams: next.packageWeightGrams,
        packageLengthCm: next.packageLengthCm,
        packageWidthCm: next.packageWidthCm,
        packageHeightCm: next.packageHeightCm,
        measurementSource: next.measurementSource,
        adminNotes: replaceMarkedNote(product.adminNotes, note),
      },
    });
  }

  console.log(`shipping facts: ${file.items.length} in file`);
  console.log(`applied: ${applied.length}`);
  for (const line of applied) console.log(`  + ${line}`);
  if (skipped.length) {
    console.log(`skipped (already measured): ${skipped.length}`);
    for (const line of skipped) console.log(`  = ${line}`);
  }
  if (missing.length) console.log(`MISSING in database: ${missing.join(", ")}`);
  if (dryRun) console.log("dry run — nothing written");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
