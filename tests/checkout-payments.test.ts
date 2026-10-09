import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const WEBHOOK_SECRET =
  "whsec_" + Buffer.from("checkout-payments-test-webhook-key-2026").toString("base64");

test("a Yoco checkout creates one order and a signed webhook settles it once, on an isolated database", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "2de-checkout-test-"));
  const database = path.join(directory, "test.sqlite");
  try {
    await copyFile(path.resolve("prisma/dev.db"), database);
    const result = spawnSync(
      process.execPath,
      ["--require", "./scripts/maintenance/_preload.cjs", "--import", "tsx", "tests/checkout-payments.worker.ts"],
      {
        cwd: process.cwd(), encoding: "utf8", timeout: 90000,
        env: {
          ...process.env,
          DATABASE_URL: `file:${database.replace(/\\/g, "/")}`,
          NODE_ENV: "test",
          PAYMENT_PROVIDER: "yoco",
          YOCO_SECRET_KEY: "sk_test_checkout-payments-simulated-only",
          YOCO_WEBHOOK_SECRET: WEBHOOK_SECRET,
          MAIL_PROVIDER: "disabled",
        },
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS:/);
  } finally {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) await unlink(database + suffix).catch(() => {});
    await rmdir(directory);
  }
});