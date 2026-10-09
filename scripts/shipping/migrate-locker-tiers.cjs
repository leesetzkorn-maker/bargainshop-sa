// Self-contained, additive, idempotent migration for the Courier Guy locker
// tariff model. Runs on the Railway container with the app's own Prisma client.
//
//   node /data/private/migrate-locker-tiers.cjs file:/data/prod.db
//
// Safe to run more than once and safe against a live SQLite file: it only ADDs
// the new column/table and seeds the tariff card, so existing products, orders
// and the ShippingSetting row are left alone apart from turning shipping on.

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const app = fs.existsSync("/app/package.json") ? "/app" : process.cwd();
const { PrismaClient } = createRequire(path.join(app, "package.json"))("@prisma/client");

const datasourceUrl = process.argv[2] || process.env.DATABASE_URL;
if (!datasourceUrl) {
  console.error("usage: node migrate-locker-tiers.cjs <sqlite-datasource-url>");
  process.exit(1);
}
const db = new PrismaClient({ datasourceUrl });

const TIERS = [
  { code: "XS", name: "Extra small", sortOrder: 10, maxLengthCm: 60, maxWidthCm: 17, maxHeightCm: 8, maxWeightGrams: 2000, lockerToLockerCents: 5900, lockerToDoorCents: 7900, lockerToKioskCents: 6900, kioskToDoorCents: 9300 },
  { code: "S", name: "Small", sortOrder: 20, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 8, maxWeightGrams: 5000, lockerToLockerCents: 6900, lockerToDoorCents: 8900, lockerToKioskCents: 7900, kioskToDoorCents: 10500 },
  { code: "M", name: "Medium", sortOrder: 30, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 19, maxWeightGrams: 10000, lockerToLockerCents: 7900, lockerToDoorCents: 11900, lockerToKioskCents: 8900, kioskToDoorCents: 13500 },
  { code: "L", name: "Large", sortOrder: 40, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 41, maxWeightGrams: 15000, lockerToLockerCents: 10900, lockerToDoorCents: 17600, lockerToKioskCents: 12900, kioskToDoorCents: 21000 },
  { code: "XL", name: "Extra large", sortOrder: 50, maxLengthCm: 60, maxWidthCm: 41, maxHeightCm: 69, maxWeightGrams: 20000, lockerToLockerCents: 14900, lockerToDoorCents: 23900, lockerToKioskCents: 16900, kioskToDoorCents: 28000 },
];

async function columns(table) {
  return (await db.$queryRawUnsafe(`PRAGMA table_info("${table}")`)).map((r) => r.name);
}

async function addColumnIfMissing(table, column, definition) {
  if ((await columns(table)).includes(column)) return false;
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  return true;
}

(async () => {
  console.log(`migrate-locker-tiers against ${datasourceUrl}`);

  const added = [];
  if (await addColumnIfMissing("ShippingSetting", "doorFuelSurchargePercent", "REAL NOT NULL DEFAULT 0")) added.push("doorFuelSurchargePercent");
  if (await addColumnIfMissing("ShippingSetting", "etaMinDays", "INTEGER NOT NULL DEFAULT 1")) added.push("etaMinDays");
  if (await addColumnIfMissing("ShippingSetting", "etaMaxDays", "INTEGER NOT NULL DEFAULT 3")) added.push("etaMaxDays");
  console.log(added.length ? `added columns: ${added.join(", ")}` : "columns already present");

  await db.$executeRawUnsafe(`
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
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ShippingTier_code_key" ON "ShippingTier"("code")`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ShippingTier_isActive_sortOrder_idx" ON "ShippingTier"("isActive", "sortOrder")`);

  for (const t of TIERS) {
    await db.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ShippingTier"
        ("id","code","name","sortOrder","isActive","maxLengthCm","maxWidthCm","maxHeightCm","maxWeightGrams","lockerToLockerCents","lockerToDoorCents","lockerToKioskCents","kioskToDoorCents","notes","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      `tier-${t.code.toLowerCase()}`, t.code, t.name, t.sortOrder, 1,
      t.maxLengthCm, t.maxWidthCm, t.maxHeightCm, t.maxWeightGrams,
      t.lockerToLockerCents, t.lockerToDoorCents, t.lockerToKioskCents, t.kioskToDoorCents,
      "Seeded from The Courier Guy locker tariff card effective 2026-09-01 (incl. VAT).",
    );
  }

  const count = await db.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "ShippingSetting" WHERE "id" = 1`);
  if (Number(count[0].n) === 0) {
    await db.$executeRawUnsafe(
      `INSERT INTO "ShippingSetting" ("id","isActive","ratesConfirmed","doorFuelSurchargePercent","dispatchPostalCode","dispatchProvince","dispatchCity","etaMinDays","etaMaxDays","createdAt","updatedAt")
       VALUES (1,1,1,0,'2000','GP','Johannesburg',1,3,datetime('now'),datetime('now'))`,
    );
    console.log("created ShippingSetting row id=1");
  } else {
    await db.$executeRawUnsafe(`UPDATE "ShippingSetting" SET "isActive" = 1, "ratesConfirmed" = 1, "etaMinDays" = 1, "etaMaxDays" = 3 WHERE "id" = 1`);
    console.log("activated ShippingSetting row id=1 (door surcharge left as stored)");
  }

  const tiers = await db.$queryRawUnsafe(`SELECT "code","isActive" FROM "ShippingTier" ORDER BY "sortOrder"`);
  console.log(`ShippingTier rows: ${tiers.map((t) => t.code).join(", ")}`);
  const settings = await db.$queryRawUnsafe(`SELECT "isActive","ratesConfirmed","doorFuelSurchargePercent" FROM "ShippingSetting" WHERE "id" = 1`);
  console.log(`ShippingSetting: ${JSON.stringify(settings[0])}`);
})()
  .catch((e) => { console.error("ERR " + e.message); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
