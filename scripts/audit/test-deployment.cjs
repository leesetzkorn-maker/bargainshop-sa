// Production startup regression on a disposable consistent copy. No live data,
// Railway API, customer orders, external payments or owner's files are changed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const removed = {
  Product: ['sourceConfidence', 'marketFlag', 'disposition', 'recommendedPriceCents'],
  ProductImage: ['originalKey', 'coverMode', 'maskBoxes'],
};
async function snapshot(db, omitNewFields = true) {
  const tables = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name");
  const result = {};
  for (const { name } of tables) {
    const rows = await db.$queryRawUnsafe(`SELECT * FROM "${name.replaceAll('"', '""')}"`);
    result[name] = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !omitNewFields || !(removed[name] || []).includes(key)))).map(row => JSON.stringify(row, (_, value) => typeof value === 'bigint' ? value.toString() : value)).sort();
  }
  return result;
}
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '2de-deployment-test-'));
  const database = path.join(directory, 'existing.db');
  const source = new PrismaClient();
  const originalBefore = await snapshot(source, false);
  await source.$executeRawUnsafe(`VACUUM INTO '${database.replaceAll("'", "''")}'`);
  await source.$disconnect();
  const db = new PrismaClient({ datasourceUrl: `file:${database.replaceAll('\\', '/')}` });
  let server;
  const baseEnv = { ...process.env, NODE_ENV: 'production', DATABASE_URL: `file:${database.replaceAll('\\', '/')}`, PORT: '3181', AUTH_SECRET: 'test-only-persistent-auth-secret-123456', CART_SECRET: 'test-only-persistent-cart-secret-123456', ADMIN_EMAIL: 'do-not-create-extra-owner@example.invalid', ADMIN_PASSWORD: '', MAIL_PROVIDER: 'disabled', RAILWAY_SERVICE_ID: '', RAILWAY_ENVIRONMENT_ID: '', RAILWAY_PROJECT_ID: '' };
  async function start() {
    let output = '';
    server = spawn(process.execPath, ['scripts/runtime/start.cjs'], { env: baseEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', chunk => output += chunk); server.stderr.on('data', chunk => output += chunk);
    for (let i = 0; i < 150; i++) {
      if (server.exitCode !== null || server.signalCode !== null) throw new Error(output);
      try { if ((await fetch('http://127.0.0.1:3181/api/health')).status === 200) return output; } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`Startup timeout: ${output}`);
  }
  async function stop() {
    if (!server || server.exitCode !== null || server.signalCode !== null) return;
    const done = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM'); await done;
    // Signal propagation closes Next, not only the wrapper.
    for (let i = 0; i < 50; i++) {
      try { await fetch('http://127.0.0.1:3181/api/health'); } catch { return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Next process was left running after shutdown.');
  }
  try {
    // Simulate an existing populated database one additive migration behind.
    // These DROP operations affect only this newly minted test clone.
    for (const [table, columns] of Object.entries(removed)) for (const column of columns) await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
    await db.$executeRawUnsafe("DELETE FROM _prisma_migrations WHERE migration_name='20261007193000_intake_fields'");
    const before = await snapshot(db);
    const logs = await start();
    assert.match(logs, /consistent backup saved/);
    assert.equal((await fetch('http://127.0.0.1:3181/shop')).status, 200);
    assert.deepEqual(await snapshot(db), before, 'Migration/seed altered existing records.');
    await stop();
    const backups = fs.readdirSync(path.join(directory, 'backups'));
    assert.equal(backups.length, 1);
    const backup = new PrismaClient({ datasourceUrl: `file:${path.join(directory, 'backups', backups[0]).replaceAll('\\', '/')}` });
    assert.deepEqual(await snapshot(backup), before, 'Migration backup omitted existing data.');
    await backup.$disconnect();
    const nextLogs = await start();
    assert.doesNotMatch(nextLogs, /consistent backup saved/);
    assert.deepEqual(await snapshot(db), before, 'Repeated startup reseeded or reset existing data.');
    await stop();
    const missing = path.join(directory, 'absent.db');
    const child = spawn(process.execPath, ['scripts/runtime/start.cjs'], { env: { ...baseEnv, DATABASE_URL: `file:${missing.replaceAll('\\', '/')}` }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let failure = ''; child.stderr.on('data', chunk => failure += chunk);
    const exit = await new Promise(resolve => child.once('exit', resolve));
    assert.equal(exit, 1); assert.match(failure, /refusing to create an empty replacement/);
    assert.equal(fs.existsSync(missing), false);
    const originalAfter = new PrismaClient();
    try { assert.deepEqual(await snapshot(originalAfter, false), originalBefore, 'Owner database changed during isolated verification.'); }
    finally { await originalAfter.$disconnect(); }
    console.log('PASS: pending migration backup, records preserved, two production startups, health/shop, shutdown, idempotent seed and missing-DB protection.');
  } finally {
    await stop(); await db.$disconnect();
    console.log(`Private disposable deployment test artifacts: ${directory}`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
