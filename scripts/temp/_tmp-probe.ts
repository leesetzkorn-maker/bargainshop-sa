import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { detectPriceTagBoxes, padBox, type DetectOptions } from "../../src/lib/photo-blackout/detect";
import { readText } from "../../src/lib/intake/ocr";
import { parsePrices } from "../../src/lib/intake/price-read";

const targets = [
  "2ds-0089-o-neal-kids-motorbike-boots.webp",
  "2ds-0067-steco-1000w-power-station-with-charger-2.webp",
  "2ds-0077-bosch-cordless-drill-with-extra-battery-and-charger-2.webp",
];

const RELAXED: DetectOptions = {
  minAreaRatio: 0.0004,
  maxAreaRatio: 0.2,
  minFill: 0.25,
  minTextRatio: 0.001,
  maxTextRatio: 0.7,
  minAspect: 0.15,
  maxAspect: 12,
  maxResults: 10,
};

async function boxes(file: string, options: DetectOptions) {
  const local = path.join(process.cwd(), "public", "uploads", "products", file);
  const { data, info } = await sharp(local)
    .resize({ width: 480, fit: "contain", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectPriceTagBoxes(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height,
    info.channels,
    options,
  );
}

function readsAsPrice(text: string) {
  return parsePrices(text).length > 0 || /EZ\s*PAWN/i.test(text);
}

async function probe(file: string) {
  const local = path.join(process.cwd(), "public", "uploads", "products", file);
  const bytes = fs.readFileSync(local);
  console.log(`\n===== ${file} =====`);
  const all = await boxes(file, RELAXED);
  console.log(`  relaxed candidates: ${all.length}`);
  for (const b of all.filter((x) => x.score > 0.4).slice(0, 8)) {
    const crop = await readText(bytes, { box: padBox(b, 0.08) });
    if (crop === null) {
      console.log(`    [score ${b.score.toFixed(2)} textRatio ${b.textRatio.toFixed(3)} fill ${b.fill.toFixed(2)}] (ocr=null)`);
      continue;
    }
    const text = crop.map((l) => l.text).join(" ").trim();
    const ok = readsAsPrice(text);
    console.log(
      `    [score ${b.score.toFixed(2)} textRatio ${b.textRatio.toFixed(3)} fill ${b.fill.toFixed(2)}] ${ok ? "CONFIRM" : "no"} :: ${text.slice(0, 90)}`,
    );
  }
}

async function main() {
  for (const t of targets) await probe(t);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});