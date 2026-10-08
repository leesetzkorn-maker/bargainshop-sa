import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { detectPriceTagBoxes, type PriceTagBox, type DetectOptions } from "../../src/lib/photo-blackout/detect";

const prisma = new PrismaClient();
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

async function relaxed(file: string): Promise<PriceTagBox[]> {
  const { data, info } = await sharp(file)
    .resize({ width: 480, fit: "contain", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectPriceTagBoxes(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height,
    info.channels,
    RELAXED,
  );
}

async function main() {
  const items = await prisma.product.findMany({
    where: { itemId: { gte: "2DS-0045", lte: "2DS-0097" }, status: { not: "ARCHIVED" } },
    select: { images: { select: { url: true } } },
  });
  const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)) * 1000) / 1000;
  const rows: Array<{ url: string; boxes: number; score: number; tr: number; fill: number }> = [];
  for (const it of items) {
    for (const im of it.images) {
      const local = path.join(process.cwd(), "public", im.url.replace(/^\//, ""));
      if (!fs.existsSync(local)) continue;
      const boxes = await relaxed(local);
      if (boxes.length === 0) continue;
      rows.push({
        url: im.url,
        boxes: boxes.length,
        score: avg(boxes.map((b) => b.score)),
        tr: avg(boxes.map((b) => b.textRatio)),
        fill: avg(boxes.map((b) => b.fill)),
      });
    }
  }
  rows.sort((a, b) => b.score - a.score);
  console.log("top score per image (relaxed):");
  for (const r of rows.slice(0, 100)) {
    console.log(`  ${r.score} textRatio ${r.tr} fill ${r.fill} boxes ${r.boxes} :: ${r.url}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});