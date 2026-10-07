/**
 * Remove the pawn shop's price stickers from the real product photos.
 *
 * WHY A BATCH RUN EXISTS
 *
 * The admin screen removes one sticker at a time, on purpose: a human looks at
 * the before/after pair and approves it. That is the right way to handle a photo
 * of a specific physical item, and it does not scale to a catalogue that was
 * photographed in one sitting — 53 products, 79 photos, every frame carrying
 * the shop's own sticker and, worse, the shop's own price.
 *
 * This script runs exactly the same code path as the admin button
 * (`removePriceTagFromImage`), so the safety properties are identical:
 *
 *   - the original file is opened read-only and never written or deleted,
 *   - pixels outside the detected sticker are the untouched original,
 *   - a photo with no sticker is left completely alone and reported as such,
 *   - nothing is promoted to a product image without `--apply`.
 *
 * TWO PHASES, ON PURPOSE
 *
 *   1. `npm run photos:clean` writes a candidate per photo to /uploads/ai/ and a
 *      report to data/internal/price-tag-cleanup.json. The storefront is
 *      untouched. Look at the candidates first.
 *   2. `npm run photos:clean -- --apply` promotes those candidates into
 *      /uploads/products/ with fresh content-unique keys and points the
 *      ProductImage row at the new file.
 *
 * The original photo file stays on disk after promotion, and the report records
 * the old URL, so a bad result is always reversible.
 *
 * Run it with the preload that maps `server-only` to an empty module:
 *   tsx --require ./scripts/maintenance/_preload.cjs scripts/cleanup/remove-price-tags.ts
 *
 * FLAGS
 *   --apply           promote each candidate and update the database
 *   --only=<ids>      comma separated itemIds, e.g. --only=2DS-0045,2DS-0046
 *   --limit=<n>       stop after n photos (useful for a first run)
 *   --report=<path>   default data/internal/price-tag-cleanup.json
 *   --include-cleaned re-run photos that a previous run already cleaned
 *
 * It costs one vision call and one image call per photo, so re-running a whole
 * catalogue is not free. The report is what stops a second paid run: without
 * --include-cleaned, an image that already has a result recorded is skipped.
 */
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { removePriceTagFromImage } from "@/lib/ai/remove-price-tag";
import { AiImageError } from "@/lib/ai/types";
import { isImageEditingConfigured } from "@/lib/ai/registry";
import { deleteAiCandidate, promoteAiCandidate } from "@/lib/storage";

const prisma = new PrismaClient();

const UPLOAD_PREFIX = "/uploads/products/";

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
};

const APPLY = flag("apply");
const ONLY = (value("only") ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const LIMIT = Number(value("limit") ?? "0") || 0;
const INCLUDE_CLEANED = flag("include-cleaned");
const REPORT_PATH = value("report") ?? "data/internal/price-tag-cleanup.json";

/** Messages that mean "there was simply no sticker here", not a failure. */
const NO_STICKER = /No pawn shop price sticker|not a sticker big enough/i;

/**
 * .env is loaded by hand because tsx does not, and the key must be in
 * process.env before `isImageEditingConfigured()` reads it. Missing values are
 * left alone: a real environment always wins over the file.
 */
async function loadDotEnv(): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(".env", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, name, rest] = match;
    let content = rest.trim();
    if (
      (content.startsWith('"') && content.endsWith('"')) ||
      (content.startsWith("'") && content.endsWith("'"))
    ) {
      content = content.slice(1, -1);
    }
    if (content.length > 0 && !process.env[name!]) process.env[name!] = content;
  }
}

interface PhotoRecord {
  imageId: string;
  itemId: string;
  originalUrl: string;
  outcome: "staged" | "applied" | "no-sticker" | "failed";
  stickers?: number;
  notes?: string[];
  candidateUrl?: string;
  newUrl?: string;
  error?: string;
  at: string;
}

interface Report {
  startedAt: string;
  updatedAt: string;
  records: PhotoRecord[];
}

async function loadReport(): Promise<Report> {
  try {
    const parsed = JSON.parse(await readFile(REPORT_PATH, "utf8")) as Report;
    return { startedAt: parsed.startedAt, updatedAt: parsed.updatedAt, records: parsed.records ?? [] };
  } catch {
    return { startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), records: [] };
  }
}

/** Clean up candidates that will never be promoted, on request. */
async function discardStaged(report: Report): Promise<void> {
  for (const record of report.records) {
    if (record.outcome === "staged" && record.candidateUrl) {
      await deleteAiCandidate(record.candidateUrl);
      console.log(`discarded ${record.candidateUrl}`);
    }
  }
}

async function main(): Promise<void> {
  await loadDotEnv();

  if (!isImageEditingConfigured()) {
    console.error("GEMINI_API_KEY is not set. Add it to .env before running this.");
    process.exitCode = 1;
    return;
  }

  const report = await loadReport();

  if (flag("discard-staged")) {
    await discardStaged(report);
    return;
  }

  const doneUrls = new Set(
    report.records
      .filter((record) => record.outcome === "applied" || record.outcome === "no-sticker")
      .flatMap((record) => [record.originalUrl, ...(record.newUrl ? [record.newUrl] : [])]),
  );

  const products = await prisma.product.findMany({
    where: {
      ...(ONLY.length > 0 ? { itemId: { in: ONLY } } : {}),
      images: { some: { url: { startsWith: UPLOAD_PREFIX } } },
    },
    orderBy: { itemId: "asc" },
    select: { itemId: true, images: { where: { url: { startsWith: UPLOAD_PREFIX } }, orderBy: { sortOrder: "asc" } } },
  });

  const queue = products.flatMap((product) =>
    product.images.map((image) => ({ itemId: product.itemId, image })),
  );

  console.log(
    `${APPLY ? "applying" : "staging"}: ${queue.length} photo(s) across ${products.length} product(s)`,
  );

  let handled = 0;
  for (const { itemId, image } of queue) {
    if (!INCLUDE_CLEANED && doneUrls.has(image.url)) {
      console.log(`skip  ${itemId} ${image.url} (already in the report)`);
      continue;
    }
    const staged = !INCLUDE_CLEANED
      ? report.records.find((record) => record.imageId === image.id && record.originalUrl === image.url && record.outcome === "staged")
      : undefined;
    if (staged && !APPLY) {
      console.log(`skip  ${itemId} ${image.url} (candidate waiting for review)`);
      continue;
    }
    if (LIMIT > 0 && handled >= LIMIT) {
      console.log(`stop  reached --limit=${LIMIT}`);
      break;
    }
    handled += 1;

    const record: PhotoRecord = {
      imageId: image.id,
      itemId,
      originalUrl: image.url,
      outcome: "failed",
      at: new Date().toISOString(),
    };

    try {
      // --apply consumes the reviewed candidate; never pay to regenerate it.
      if (APPLY && staged?.candidateUrl) {
        const promoted = await promoteAiCandidate(staged.candidateUrl);
        await prisma.productImage.update({ where: { id: image.id }, data: { url: promoted.url } });
        Object.assign(record, staged, { outcome: "applied", newUrl: promoted.url, at: new Date().toISOString() });
        console.log(`done  ${itemId} reviewed candidate -> ${promoted.url}`);
      } else {
      const result = await removePriceTagFromImage(image.url);
      record.stickers = result.removedCount;
      record.notes = result.notes;

      if (APPLY) {
        const promoted = await promoteAiCandidate(result.candidate.url);
        await prisma.productImage.update({ where: { id: image.id }, data: { url: promoted.url } });
        record.outcome = "applied";
        record.newUrl = promoted.url;
        console.log(`done  ${itemId} ${image.url} -> ${promoted.url} (${result.removedCount} sticker(s))`);
      } else {
        record.outcome = "staged";
        record.candidateUrl = result.candidate.url;
        console.log(`stage ${itemId} ${image.url} -> ${result.candidate.url} (${result.removedCount} sticker(s))`);
      }
      }
    } catch (error) {
      if (error instanceof AiImageError) {
        record.outcome = NO_STICKER.test(error.message) ? "no-sticker" : "failed";
        record.error = error.message;
        console.log(`note  ${itemId} ${image.url} :: ${error.message}`);
      } else {
        record.error = error instanceof Error ? error.message : String(error);
        console.error(`fail  ${itemId} ${image.url}`, error);
      }
    }

    report.records = report.records.filter((entry) => entry.imageId !== record.imageId);
    report.records.push(record);
    report.updatedAt = new Date().toISOString();
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  }

  // A staged run leaves candidates behind for review; say so rather than leaving
  // files nobody knows about.
  if (!APPLY) {
    const staged = report.records.filter((record) => record.outcome === "staged");
    if (staged.length > 0) {
      console.log(
        `\n${staged.length} candidate(s) waiting under public/uploads/ai/. Re-run with --apply to promote them.`,
      );
    }
  }

  const failed = report.records.filter((record) => record.outcome === "failed");
  const noSticker = report.records.filter((record) => record.outcome === "no-sticker");
  console.log(
    `\napplied=${report.records.filter((r) => r.outcome === "applied").length}` +
      ` staged=${report.records.filter((r) => r.outcome === "staged").length}` +
      ` no-sticker=${noSticker.length}` +
      ` failed=${failed.length}`,
  );
  if (failed.length > 0) {
    console.log("failures:");
    for (const record of failed) console.log(`  ${record.itemId} ${record.originalUrl} :: ${record.error}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
