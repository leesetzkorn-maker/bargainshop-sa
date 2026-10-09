const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadEnvConfig } = require('@next/env');
const { configure, onRailway } = require('./config.cjs');

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
    let stopping = false;
    const forward = signal => { stopping = true; child.kill(signal); };
    const term = () => forward('SIGTERM'), interrupt = () => forward('SIGINT');
    process.once('SIGTERM', term); process.once('SIGINT', interrupt);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.removeListener('SIGTERM', term); process.removeListener('SIGINT', interrupt);
      if (stopping) process.exit(0);
      if (code === 0) resolve(); else reject(new Error(`Startup command failed (${signal || code}).`));
    });
  });
}

async function main() {
  process.env.NODE_ENV = 'production';
  loadEnvConfig(process.cwd());
  const database = configure(process.env, { runtime: true });
  if (!fs.existsSync(database) || fs.statSync(database).size === 0) {
    throw new Error(`Existing SQLite database missing at ${database}. Restore the existing database to the persistent volume; refusing to create an empty replacement.`);
  }
  fs.accessSync(database, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(path.dirname(database), fs.constants.W_OK);
  if (onRailway(process.env) && process.platform === 'linux') {
    const mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    if (!mounts.split('\n').some(line => line.split(' ')[4] === '/data')) {
      throw new Error('/data is not a mounted volume. Refusing to migrate on ephemeral storage.');
    }
  }
  for (const key of ['AUTH_SECRET', 'CART_SECRET']) {
    if (!process.env[key]?.trim()) throw new Error(`Missing ${key}; set the existing service secret before starting.`);
  }
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    const integrity = await db.$queryRawUnsafe('PRAGMA quick_check');
    if (integrity.some(row => Object.values(row)[0] !== 'ok')) throw new Error('SQLite integrity check failed; restore from backup, do not reset.');
    let applied;
    try {
      applied = await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations');
    } catch {
      throw new Error('Existing database has no readable Prisma migration history. Review and baseline that database before deploying; never reset or replace it.');
    }
    if (applied.some(m => !m.finished_at && !m.rolled_back_at)) throw new Error('A previous migration failed. Resolve it from a backup after review; startup will not reset data.');
    const completed = new Set(applied.filter(m => m.finished_at && !m.rolled_back_at).map(m => m.migration_name));
    const migrations = fs.readdirSync('prisma/migrations', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
    if (migrations.some(name => !completed.has(name))) {
      const backupDir = path.join(path.dirname(database), 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const backup = path.join(backupDir, `before-migrate-${Date.now()}.db`);
      // SQLite's own consistent snapshot includes WAL data. Never copy an open
      // database file or replace the live database with a bundled development DB.
      await db.$executeRawUnsafe(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
      console.log(`Pending migrations: consistent backup saved to ${backup}`);
    }
  } finally { await db.$disconnect(); }
  await run([require.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
  await run([require.resolve('tsx/cli'), 'prisma/seed.ts']);
  console.log(`Persistent SQLite ready: ${database}`);
  await run([require.resolve('next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', process.env.PORT || '3000']);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
