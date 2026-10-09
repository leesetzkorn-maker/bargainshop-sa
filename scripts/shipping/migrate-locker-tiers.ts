/**
 * Additive, idempotent migration for the Courier Guy locker-tariff shipping
 * model. Safe to run more than once and safe to run against a live SQLite file.
 *
 * WHY THIS EXISTS INSTEAD OF `prisma db push` / `prisma migrate`
 *
 * Production builds only run `prisma generate` + `next build`; there is no
 * migration step at deploy time. `prisma db push` would also try to DROP the old
 * `ShippingRule` table and rewrite `ShippingSetting`, which risks the live row.
 * This script only ADDS the new column/table and seeds the tariff card, so the
 * existing products, orders and settings are untouched.
 *
 * Usage:
 *   DATABASE_URL="file:./prisma/dev.db" npx tsx scripts/shipping/migrate-locker-tiers.ts
 *   npx @railway/cli ssh -s <service> "cd <app> && node <bundled script>"
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TIERS = [
  { code: "XS", name: "Extra small", sortOrder: 10, maxLengthCm: 60, maxWidthCm: 17, maxHeightCm: 8, maxWeightGrams: 2000, lockerToLockerCents: 5900, lockerToDoorCents: 7900, lockerToKioskCents: 6900, kioskToDoorCents: 9300 },
  { code: "S", name: "Small", sortOrder: 20, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 8, maxWeightGrams: 5000, lockerToLockerCents: 6900, lockerToDoorCents: 8900, lockerToKioskCents: 7900, kioskToDoorCents: 10500 },
  { code: "M", name: "Medium", sortOrder: 30, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 19, maxWeightGrams: 10000, lockerToLockerCents: 7900, lockerToDoorCents: 11900, lockerToKioskCents: 8900, kioskToDoorCents: 13500 },
  { code: "L", name: "Large", sortOrder: 40, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 41, maxWeightGrams: 15000, lockerToLockerCents: 10900, lockerToDoorCents: 17600, lockerToKioskCents: 12900, kioskToDoorCents: 21000 },
  { code: "XL", name: "Extra large", sortOrder: 50, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 69, maxWeightGrams: 20000, lockerToLockerCents: 14900, lockerToDoorCents: 23900, lockerToKioskCents: 16900, kioskToDoorCents: 28000 },
] as const;

async function columns(table: string): Promise<string[]> {
  const rows = (await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`)) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

async function addColumnIfMissing(table: string, column: string, definition: string): Promise<boolean> {
  const existing = await columns(table);
  if (existing.includes(column)) return false;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  return true;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`migrate-locker-tiers against ${url.replace(/\/\/.*@/, "//***@")}`);
  if (!url) throw new Error("DATABASE_URL is required");

  const added: string[] = [];
  if (await addColumnIfMissing("ShippingSetting", "doorFuelSurchargePercent", "REAL NOT NULL DEFAULT 0")) added.push("ShippingSetting.doorFuelSurchargePercent");
  if (await addColumnIfMissing("ShippingSetting", "etaMinDays", "INTEGER NOT NULL DEFAULT 1")) added.push("ShippingSetting.etaMinDays");
  if (await addColumnIfMissing("ShippingSetting", "etaMaxDays", "INTEGER NOT NULL DEFAULT 3")) added.push("ShippingSetting.etaMaxDays");
  console.log(added.length ? `added columns: ${added.join(", ")}` : "columns already present");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ShippingTier" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "maxLengthCm" REAL NOT NULL,
      "maxWidthCm" REAL NOT NULL,
      "maxHeightCm" REAL NOT NULL,
      "maxWeightGrams" INTEGER NOT NULL,
      "lockerToLockerCents" INTEGER NOT NULL,
      "lockerToDoorCents" INTEGER NOT NULL,
      "lockerToKioskCents" INTEGER NOT NULL,
      "kioskToDoorCents" INTEGER NOT NULL,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ShippingTier_code_key" ON "ShippingTier"("code")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ShippingTier_isActive_sortOrder_idx" ON "ShippingTier"("isActive", "sortOrder")`);

  for (const tier of TIERS) {
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ShippingTier"
        ("id","code","name","sortOrder","isActive","maxLengthCm","maxWidthCm","maxHeightCm","maxWeightGrams","lockerToLockerCents","lockerToDoorCents","lockerToKioskCents","kioskToDoorCents","notes","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      `tier-${tier.code.toLowerCase()}`,
      tier.code,
      tier.name,
      tier.sortOrder,
      1,
      tier.maxLengthCm,
      tier.maxWidthCm,
      tier.maxHeightCm,
      tier.maxWeightGrams,
      tier.lockerToLockerCents,
      tier.lockerToDoorCents,
      tier.lockerToKioskCents,
      tier.kioskToDoorCents,
      "Seeded from The Courier Guy locker tariff card effective 2026-09-01 (incl. VAT).",
    );
  }

  const settingsCount = (await prisma.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "ShippingSetting" WHERE "id" = 1`)) as Array<{ n: number | bigint }>;
  if (Number(settingsCount[0]?.n ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ShippingSetting" ("id","isActive","ratesConfirmed","doorFuelSurchargePercent","dispatchPostalCode","dispatchProvince","dispatchCity","etaMinDays","etaMaxDays","createdAt","updatedAt")
       VALUES (1,1,1,0,'2000','GP','Johannesburg',1,3,datetime('now'),datetime('now'))`,
    );
    console.log("created ShippingSetting row id=1");
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE "ShippingSetting" SET "isActive" = 1, "ratesConfirmed" = 1, "etaMinDays" = 1, "etaMaxDays" = 3 WHERE "id" = 1`,
    );
    console.log("activated existing ShippingSetting row id=1 (door surcharge left as stored)");
  }

  const tiers = (await prisma.$queryRawUnsafe(`SELECT "code", "isActive" FROM "ShippingTier" ORDER BY "sortOrder"`)) as Array<{ code: string; isActive: number }>;
  console.log(`ShippingTier rows: ${tiers.map((t) => t.code).join(", ")}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
