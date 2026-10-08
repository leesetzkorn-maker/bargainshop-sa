// Fail early with actionable messages before Prisma touches the database.
// Do not create or replace databases here.
const fs = require("node:fs");
const path = require("node:path");

const url = process.env.DATABASE_URL;
if (!url || !url.startsWith("file:")) {
  console.error("STARTUP BLOCKED: DATABASE_URL must be set to a SQLite file URL (Railway: file:/data/prod.db).");
  process.exit(1);
}
if (url.startsWith("file:/data/")) {
  const dir = "/data";
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error("STARTUP BLOCKED: /data is missing. Attach the existing Railway volume at /data before deploying.");
    process.exit(1);
  }
  // Railway volume mount verification is a separate infrastructure step.
  // An existing directory alone does not prove persistent storage.
}
console.log("SQLite startup configuration checked. Database migrations will run next; seeding is manual.");
