import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("checkout prevents double purchase and charges shipping, using an isolated database", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "2de-stock-test-"));
  const database = path.join(directory, "test.sqlite");
  try {
    await copyFile(path.resolve("prisma/dev.db"), database);
    const result = spawnSync(process.execPath, ["--require", "./scripts/maintenance/_preload.cjs", "--import", "tsx", "tests/orders-stock.worker.ts"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 60000,
      env: { ...process.env, DATABASE_URL: `file:${database.replace(/\\/g, "/")}`, PAYMENT_PROVIDER: "offline", NODE_ENV: "test" },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS:/);
  } finally {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) await unlink(database + suffix).catch(() => {});
    await rmdir(directory);
  }
});
