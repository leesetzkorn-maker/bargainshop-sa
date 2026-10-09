const path = require('node:path');

const PRODUCTION_DATABASE_URL = 'file:/data/prod.db';
function onRailway(env) {
  return Boolean(env.RAILWAY_SERVICE_ID || env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PROJECT_ID);
}

function configure(env, { runtime = false, cwd = process.cwd() } = {}) {
  env.DATABASE_URL = env.DATABASE_URL?.trim() || PRODUCTION_DATABASE_URL;
  if (runtime && onRailway(env)) {
    if (env.DATABASE_URL !== PRODUCTION_DATABASE_URL) {
      throw new Error('Railway DATABASE_URL must be file:/data/prod.db. Preserve the existing database before changing its path.');
    }
    if (env.RAILWAY_VOLUME_MOUNT_PATH !== '/data') {
      throw new Error('Attach the existing persistent Railway volume to bargainshop-sa at /data. No database was created.');
    }
    env.UPLOADS_DIR = env.UPLOADS_DIR?.trim() || '/data/uploads';
    env.DATA_DIR = env.DATA_DIR?.trim() || '/data/private';
    for (const key of ['UPLOADS_DIR', 'DATA_DIR']) {
      if (!path.posix.resolve(env[key]).startsWith('/data/')) throw new Error(`${key} must stay on the persistent /data volume.`);
    }
  }
  if (!env.DATABASE_URL.startsWith('file:') || env.DATABASE_URL.includes('?')) {
    throw new Error('This store requires a SQLite file DATABASE_URL without query parameters.');
  }
  const filename = env.DATABASE_URL.slice(5);
  if (!filename) throw new Error('DATABASE_URL has no SQLite filename.');
  return path.isAbsolute(filename) ? filename : path.resolve(cwd, 'prisma', filename);
}

module.exports = { configure, onRailway, PRODUCTION_DATABASE_URL };
