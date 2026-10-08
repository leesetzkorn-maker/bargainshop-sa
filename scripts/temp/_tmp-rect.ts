import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { readText } from "../../src/lib/intake/ocr";

const files = [
  "2ds-0089-o-neal-kids-motorbike-boots.webp",
  "2ds-0081-yohe-motorcycle-helmet-size-l.webp",
  "2ds-0081-yohe-motorcycle-helmet-size-l-2.webp",
  "2ds-0082-grey-motorcycle-helmet.webp",
  "2ds-0082-grey-motorcycle-helmet-2.webp",
  "2ds-0083-green-graphic-motorcycle-helmet.webp",
  "2ds-0084-black-off-road-motorcycle-helmet.webp",
  "2ds-0085-vega-motorcycle-helmet-size-xl.webp",
  "2ds-0086-black-motorcycle-helmet.webp",
];

async function blackRectSignature(file: string) {
  const local = path.join(process.cwd(), "public", "uploads", "products", file);
  const { data, info } = await sharp(local).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const black = (x: number, y: number) => {
    const o = (y * W + x) * C;
    return data[o] < 24 && data[o + 1] < 24 && data[o + 2] < 24;
  };
  // Row-wise: largest run of >=90% pure-black pixels; same for columns.
  let bestRowRun = 0;
  let bestColRun = 0;
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) run = black(x, y) ? run + 1 : Math.max(bestRowRun, (bestRowRun = run), 0) && 0;
    // simpler: recompute properly below
  }
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) {
      if (black(x, y)) run++;
      else {
        if (run > bestRowRun) bestRowRun = run;
        run = 0;
      }
    }
    if (run > bestRowRun) bestRowRun = run;
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H; y++) {
      if (black(x, y)) run++;
      else {
        if (run > bestColRun) bestColRun = run;
        run = 0;
      }
    }
    if (run > bestColRun) bestColRun = run;
  }
  const totals = { W, H, rowRun: bestRowRun, colRun: bestColRun, rowFrac: bestRowRun / W, colFrac: bestColRun / H };
  console.log(file, JSON.stringify(totals));
}

async function upscaledOcr(file: string) {
  const local = path.join(process.cwd(), "public", "uploads", "products", file);
  const big = await sharp(local).resize({ width: 1800, withoutEnlargement: false }).webp().toBuffer();
  const lines = await readText(big);
  console.log(`\n== upscaled OCR ${file} ==`);
  if (!lines) {
    console.log("(no OCR)");
    return;
  }
  for (const l of lines) console.log(`  [${Math.round(l.confidence)}%] ${l.text}`);
}

async function main() {
  for (const f of files) await blackRectSignature(f);
  await upscaledOcr("2ds-0089-o-neal-kids-motorbike-boots.webp");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});