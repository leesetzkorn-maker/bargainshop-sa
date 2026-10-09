import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { configure } from "../scripts/runtime/config.cjs";

test("missing Railway DATABASE_URL is set before Prisma runs", () => {
  const env: Record<string, string> = { RAILWAY_SERVICE_ID: "test", RAILWAY_VOLUME_MOUNT_PATH: "/data" };
  configure(env, { runtime: true });
  assert.equal(env.DATABASE_URL, "file:/data/prod.db");
  assert.equal(env.UPLOADS_DIR, "/data/uploads");
  assert.equal(env.DATA_DIR, "/data/private");
});

test("build does not require the runtime volume", () => {
  const env: Record<string, string> = { RAILWAY_SERVICE_ID: "test" };
  configure(env);
  assert.equal(env.DATABASE_URL, "file:/data/prod.db");
});

test("Railway refuses ephemeral DB paths and missing volume metadata", () => {
  assert.throws(() => configure({ RAILWAY_SERVICE_ID: "test", DATABASE_URL: "file:./dev.db" }, { runtime: true }), /must be/);
  assert.throws(() => configure({ RAILWAY_SERVICE_ID: "test" }, { runtime: true }), /existing persistent/);
  assert.throws(() => configure({ RAILWAY_SERVICE_ID: "test", RAILWAY_VOLUME_MOUNT_PATH: "/data", DATA_DIR: "/data/../../app/private" }, { runtime: true }), /persistent/);
});

test("local production testing retains an explicitly selected existing DB", () => {
  const env = { DATABASE_URL: "file:./dev.db" };
  assert.equal(configure(env, { runtime: true, cwd: process.cwd() }), path.resolve("prisma/dev.db"));
  assert.equal(env.DATABASE_URL, "file:./dev.db");
});
