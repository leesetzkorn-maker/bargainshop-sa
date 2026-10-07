/**
 * Inspect (and optionally fix) the six helmet listings:
 *
 *   node scripts/check-helmets.ts          report price / status / images / tag detection
 *   node scripts/check-helmets.ts --apply  set R799, qty 1, black out detected tags, activate
 *
 * The originals are never touched: before anything is written the current
 * public copy is copied to data/backup/helmets-<timestamp>/.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "../src/lib/db";
import { detectPriceTagBoxes, padBox, type PriceTagBox } from "../src/lib/photo-blackout/detect";
import { renderBlackout } from "../src/lib/photo-blackout/render";
import { readText } from "../src/lib/intake/ocr";

const ITEM_IDS = ["2DS-0081", "2DS-0082", "2DS-0083", "2DS-0084", "2DS-0085", "2DS-0086"];
const HELMET_PRICE_CENTS = 79900;
const PUBLIC_ROOT = path.join(process.cwd(), "public");

/**
 * A price reads as a number: 395, 395.00, R 799. Scattered noise digits that
 * OCR invents over a busy surface do not. A candidate is only masked when the
 * crop reads like that — the difference between a sticker and a white patch of
 * background. When the engine cannot say, nothing is painted.
 */
function looksLikePrice(text: string): boolean {
  return /\d{2,}(\.\d{2})?/.test(text);
}

async function isPriceSticker(file: string, box: ReturnType<typeof padBox>): Promise<boolean | null> {
  const lines = await readText(fs.readFileSync(file), { box: padBox(box, 0.06) });
  if (lines === null) return null;
  const text = lines.map((line) => line.text).join(" ");
  const verdict = looksLikePrice(text);
  console.log(`    read "${text.slice(0, 80)}" -> ${verdict ? "price sticker" : "not a sticker"}`);
  return verdict;
}

interface Analysis {
  boxes: ReturnType<typeof detectPriceTagBoxes>;
  width: number;
  height: number;
}

async function analyse(file: string): Promise<Analysis> {
  const { data, info } = await sharp(file)
    .resize({ width: 480, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    boxes: detectPriceTagBoxes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, info.channels),
    width: info.width,
    height: info.height,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const products = await prisma.product.findMany({
    where: { itemId: { in: ITEM_IDS } },
    include: { images: { orderBy: { sortOrder: "asc" } } },
    orderBy: { itemId: "asc" },
  });

  if (products.length === 0) {
    console.log("No helmet products found.");
    return;
  }

  for (const product of products) {
    console.log(
      `\n${product.itemId}  ${product.name}` +
        `\n  status=${product.status} price=${product.priceCents / 100} qty=${product.stockQty}` +
        ` sourceCost=${product.sourceCostCents != null ? product.sourceCostCents / 100 : "-"}` +
        ` images=${product.images.length}`,
    );

    for (const image of product.images) {
      const file = path.join(PUBLIC_ROOT, image.url.replace(/^\//, ""));
      if (!fs.existsSync(file)) {
        console.log(`  ${image.url}: FILE MISSING`);
        continue;
      }
      const { boxes } = await analyse(file);
      const mask = image.maskBoxes ? JSON.parse(image.maskBoxes) : null;
      const found =
        boxes.length === 0
          ? "none"
          : boxes
              .map(
                (b) =>
                  "[" +
                  pct(b.x0) +
                  "," +
                  pct(b.y0) +
                  " -> " +
                  pct(b.x1) +
                  "," +
                  pct(b.y1) +
                  "] score=" +
                  b.score.toFixed(2) +
                  " fill=" +
                  b.fill.toFixed(2) +
                  " text=" +
                  b.textRatio.toFixed(3),
              )
              .join(" ");
      console.log(
        "  " +
          image.url +
          "  coverMode=" +
          (image.coverMode ?? "-") +
          " savedMask=" +
          (mask ? JSON.stringify(mask) : "-") +
          " detection=" +
          found,
      );

      if (process.argv.includes("--ocr")) {
        const whole = await readText(fs.readFileSync(file));
        console.log(
          "    whole image: " +
            (whole === null ? "(engine unavailable)" : `"${whole.map((line) => line.text).join(" ").slice(0, 160)}"`),
        );
        for (const [index, box] of boxes.slice(0, 4).entries()) {
          console.log(`    box${index}:`);
          await isPriceSticker(file, padBox(box, 0.01));
        }
      }
    }
  }

  if (!apply) {
    console.log("\nRead-only pass. Re-run with --apply to write the fix.");
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(process.cwd(), "data", "backup", `helmets-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  for (const product of products) {
    let needsReview = false;

    for (const image of product.images) {
      const file = path.join(PUBLIC_ROOT, image.url.replace(/^\//, ""));
      if (!fs.existsSync(file)) continue;

      const { boxes } = await analyse(file);

      // Read the whole photo first: a price that detection never boxed is the
      // leak that matters most.
      const whole = await readText(fs.readFileSync(file));
      const wholeText = whole === null ? null : whole.map((line) => line.text).join(" ");
      const priceVisible = wholeText !== null && looksLikePrice(wholeText);
      if (wholeText !== null) console.log(`    whole image: "${wholeText.slice(0, 160)}"`);

      // Only regions that can actually be read as a price get painted.
      const confirmed: PriceTagBox[] = [];
      for (const box of boxes.slice(0, 4)) {
        const verdict = await isPriceSticker(file, padBox(box, 0.01));
        if (verdict) confirmed.push(padBox(box, 0.01));
      }

      const engineDown = whole === null;
      const before = fs.readFileSync(file);

      if (confirmed.length > 0) {
        fs.copyFileSync(file, path.join(backupDir, path.basename(file)));
        const after = await renderBlackout(before, confirmed);
        fs.writeFileSync(file, after);
        await prisma.productImage.update({
          where: { id: image.id },
          data: { coverMode: "AUTO_MASK", maskBoxes: JSON.stringify(confirmed) },
        });
        console.log(`${product.itemId} ${image.url}: masked ${confirmed.length} confirmed region(s)`);
      } else if (engineDown) {
        needsReview = true;
        console.log(`${product.itemId} ${image.url}: OCR unavailable — needs a manual mask decision`);
      } else if (priceVisible || boxes.length > 0) {
        // A price is readable somewhere, or there is an unconfirmed candidate:
        // a person has to decide before this photo can go public.
        needsReview = true;
        console.log(
          `${product.itemId} ${image.url}: ` +
            (priceVisible
              ? "a price reads in the photo but no candidate covered it — needs a manual mask"
              : "candidates could not be read as a price — needs a manual mask decision"),
        );
      } else {
        console.log(`${product.itemId} ${image.url}: no price text and no candidate — safe as it is`);
      }
    }

    if (needsReview) {
      console.log(`${product.itemId}: LEFT AS DRAFT until the photo(s) are masked in admin`);
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        priceCents: HELMET_PRICE_CENTS,
        priceManualOverride: true,
        stockQty: 1,
        status: "ACTIVE",
        disposition: "PUBLISH",
      },
    });
    console.log(
      `${product.itemId}: price → R${HELMET_PRICE_CENTS / 100}, qty 1, status ACTIVE` +
        `${product.priceCents === HELMET_PRICE_CENTS ? " (price was already R799)" : ` (was R${product.priceCents / 100})`}`,
    );
  }

  console.log(`\nOriginals of the public copies backed up to ${backupDir}`);
  await prisma.$disconnect();
  // The cached OCR worker holds the event loop open on its own.
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
