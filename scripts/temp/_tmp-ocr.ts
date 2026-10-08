import fs from "node:fs";
import path from "node:path";
import { readText } from "../../src/lib/intake/ocr";

const images = [
  "/uploads/products/2ds-0089-o-neal-kids-motorbike-boots.webp",
  "/uploads/products/2ds-0067-steco-1000w-power-station-with-charger-2.webp",
  "/uploads/products/2ds-0077-bosch-cordless-drill-with-extra-battery-and-charger-2.webp",
  "/uploads/products/2ds-0082-grey-motorcycle-helmet.webp",
  "/uploads/products/2ds-0086-black-motorcycle-helmet.webp",
];

async function main() {
  for (const url of images) {
    const local = path.join(process.cwd(), "public", url.replace(/^\//, ""));
    const bytes = fs.readFileSync(local);
    const lines = await readText(bytes);
    console.log(`\n===== ${url} =====`);
    if (!lines) {
      console.log("(no OCR result)");
      continue;
    }
    for (const l of lines) {
      console.log(`  [${l.confidence != null ? Math.round(l.confidence) : "?"}%] ${l.text}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});