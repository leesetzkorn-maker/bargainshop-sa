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


// Make one consistent, daily recovery copy of the *existing* SQLite database
// before migrations or seed activity. SQLite VACUUM INTO includes WAL changes;
// copying the live .db file directly would not be safe.
async function makeRecoveryBackup(db, database) {
  const folder = path.join(path.dirname(database), 'backups');
  fs.mkdirSync(folder, { recursive: true });
  const destination = path.join(folder, `recovery-${new Date().toISOString().slice(0, 10)}.db`);
  const headerIsValid = file => {
    if (!fs.existsSync(file) || fs.statSync(file).size < 4096) return false;
    const fd = fs.openSync(file, 'r');
    try {
      const header = Buffer.alloc(16);
      return fs.readSync(fd, header, 0, 16, 0) === 16 &&
        header.equals(Buffer.from('SQLite format 3' + String.fromCharCode(0)));
    } finally { fs.closeSync(fd); }
  };
  if (fs.existsSync(destination)) {
    if (!headerIsValid(destination)) throw new Error('Existing recovery backup failed header/size verification; refusing to overwrite it.');
    console.log(`Recovery SQLite backup already present and readable: ${destination}`);
    return;
  }
  const space = fs.statfsSync(folder);
  const available = Number(space.bavail) * Number(space.bsize);
  if (available < fs.statSync(database).size * 2 + 8 * 1024 * 1024) {
    throw new Error('Insufficient free persistent storage for a safe SQLite recovery backup.');
  }
  const temporary = path.join(folder, `.recovery-${Date.now()}-${process.pid}.tmp`);
  try {
    await db.$executeRawUnsafe(`VACUUM INTO '${temporary.replaceAll("'", "''")}'`);
    if (!headerIsValid(temporary)) throw new Error('New recovery SQLite backup failed header/size verification.');
    fs.renameSync(temporary, destination);
    console.log(`Recovery SQLite backup created and verified: ${destination} (${fs.statSync(destination).size} bytes)`);
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}


/**
 * Keep recovery copies current even when there are no new deployments.
 * The first copy is taken synchronously at startup; repeat every six hours
 * so a running service makes one verified copy for each UTC calendar day.
 * The snapshots remain on /data and are NOT a substitute for an external
 * full-volume backup of photos, uploads and the database.
 */
function scheduleRecoveryBackups(database) {
  if (!onRailway(process.env)) return;
  const { PrismaClient } = require('@prisma/client');
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void (async () => {
      const client = new PrismaClient();
      try {
        const integrity = await client.$queryRawUnsafe('PRAGMA quick_check');
        if (integrity.some(row => Object.values(row)[0] !== 'ok')) {
          throw new Error('Live SQLite integrity check failed; backup skipped.');
        }
        await makeRecoveryBackup(client, database);
      } catch (error) {
        console.error('PERIODIC RECOVERY BACKUP FAILED: ' + (error?.message || String(error)));
      } finally {
        await client.$disconnect().catch(error => console.error('Backup client disconnect failed: ' + error.message));
        running = false;
      }
    })();
  }, 6 * 60 * 60 * 1000);
  timer.unref();
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
    // Do not put the store at risk if the snapshot fails: report it, then
    // keep existing startup safeguards and the migration-specific backup.
    try { await makeRecoveryBackup(db, database); }
    catch (error) { console.error('RECOVERY BACKUP FAILED: ' + error.message); }
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
  scheduleRecoveryBackups(database);
  // Run safe, non-blocking cleanup of the obsolete Yoco subscription. Payment
  // startup never depends on Yoco's management API being available.
  void require('./retire-legacy-yoco-webhook.cjs').retireLegacyYocoWebhook()
    .catch(error => console.warn('Yoco webhook cleanup skipped: ' + error.message));
  await run([require.resolve('next/dist/bin/next'), 'start', '--hostname', '0.0.0.0', '--port', process.env.PORT || '3000']);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
