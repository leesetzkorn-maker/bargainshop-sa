const { spawnSync } = require('node:child_process');
const { loadEnvConfig } = require('@next/env');
const { configure } = require('./config.cjs');

process.env.NODE_ENV = 'production';
loadEnvConfig(process.cwd());
configure(process.env); // Prisma sees a valid URL even without a deployed .env.
for (const args of [
  [require.resolve('prisma/build/index.js'), 'generate'],
  [require.resolve('next/dist/bin/next'), 'build'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
