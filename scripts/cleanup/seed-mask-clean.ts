/**
 * Seed the mask-editor pristine snapshot for a product image from an existing
 * pre-mask backup.
 *
 * 2DS-0086 was masked by `scripts/audit/check-helmets.ts` before the mask editor existed, so
 * its public copy is already painted and there is no `data/masks-clean/` base
 * yet. Without one, "clear all covers" could never restore the helmet photo.
 * The command that masked it copied the pre-mask public copy to
 * `data/backup/helmets-<timestamp>/`, and that is the file this seeds from.
 *
 *   node scripts/cleanup/seed-mask-clean.ts 2DS-0086
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { ensureMaskClean } from "../../src/lib/product-masks";

const PUBLIC_ROOT = path.join(process.cwd(), "public");

const ITEM_ID = process.argv[2];
if (!ITEM_ID) {
  console.log("Usage: node scripts/cleanup/seed-mask-clean.ts <itemId>");
  process.exit(1);
}

async function main() {
  const product = await prisma.product.findUnique({
    where: { itemId: ITEM_ID },
    select: { id: true, images: { select: { id: true, url: true, coverMode: true } } },
  });
  if (!product) {
    console.error(`No product with itemId ${ITEM_ID}`);
    process.exit(1);
  }

  const backups = fs
    .readdirSync(path.join(process.cwd(), "data", "backup"))
    .filter((name) => fs.statSync(path.join(process.cwd(), "data", "backup", name)).isDirectory())
    .map((dir) => {
      const full = path.join(process.cwd(), "data", "backup", dir);
      return fs
        .readdirSync(full)
        .filter((name) => /\.(webp|png|jpe?g|avif)$/i.test(name))
        .map((name) => ({ name, bytes: fs.readFileSync(path.join(full, name)) }));
    })
    .flat();

  for (const image of product.images) {
    const match = backups.find((backup) => path.basename(image.url) === backup.name);
    let source: Buffer | undefined = match?.bytes;
    if (!source && image.url.startsWith("/uploads/products/")) {
      source = fs.readFileSync(path.join(PUBLIC_ROOT, image.url));
    }
    if (!source) {
      console.log(`${image.url}: no backup match and no readable file — skipped`);
      continue;
    }
    await ensureMaskClean(image.id, image.url, source);
    console.log(`${ITEM_ID} ${image.url} (${image.coverMode ?? "no cover"}): base captured from ${match ? match.name : "current public file"}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});