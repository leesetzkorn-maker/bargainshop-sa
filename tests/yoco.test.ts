import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  YOCO_WEBHOOK_TOLERANCE_SECONDS,
  yocoCredentialsFrom,
  yocoExpectedSignature,
  yocoSignedContent,
  yocoSignaturesMatch,
  yocoTimestampIsFresh,
} from "../src/lib/payments/providers/yoco-core";

/**
 * The known vector below was produced independently of this module — HMAC-SHA256
 * over the base64-decoded key, computed with .NET's HMACSHA256 — so a bug in
 * `yocoExpectedSignature` cannot make the test agree with itself.
 */
const SECRET = "whsec_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=";
const WEBHOOK_ID = "msg_2Zt9Y";
const TIMESTAMP = "1720000000";
const BODY = '{"type":"payment.succeeded","payload":{"amount":15750,"currency":"ZAR"}}';
const EXPECTED_SIGNATURE = "2Bbl9Q9G3sZS5Pzqh1KmYXUEs+7+m7xF4tpgVXp8bqE=";
const SOME_OTHER_SIGNATURE = "565vjEpoQ/FXXDPjHgs3Hwfl8ViYOmwHXwfy5uUXiRY=";

describe("yocoSignedContent", () => {
  it("joins id, timestamp and the untouched raw body with full stops", () => {
    assert.equal(
      yocoSignedContent(WEBHOOK_ID, TIMESTAMP, BODY),
      `msg_2Zt9Y.1720000000.${BODY}`,
    );
  });

  it("keeps the body byte for byte, including its spaces", () => {
    assert.equal(yocoSignedContent("a", "1", ' {"b": 2} '), 'a.1. {"b": 2} ');
  });
});

describe("yocoExpectedSignature", () => {
  const signed = yocoSignedContent(WEBHOOK_ID, TIMESTAMP, BODY);

  it("matches the independently computed vector", () => {
    assert.equal(yocoExpectedSignature(SECRET, signed), EXPECTED_SIGNATURE);
  });

  it("is stable and depends on the secret", () => {
    assert.equal(yocoExpectedSignature(SECRET, signed), yocoExpectedSignature(SECRET, signed));
    assert.notEqual(
      yocoExpectedSignature(SECRET, signed),
      yocoExpectedSignature("whsec_" + Buffer.from("a different key entirely").toString("base64"), signed),
    );
  });

  it("changes when any signed byte changes", () => {
    assert.notEqual(
      yocoExpectedSignature(SECRET, signed),
      yocoExpectedSignature(SECRET, yocoSignedContent(WEBHOOK_ID, TIMESTAMP, BODY + " ")),
    );
    assert.notEqual(
      yocoExpectedSignature(SECRET, signed),
      yocoExpectedSignature(SECRET, yocoSignedContent(WEBHOOK_ID, "1720000001", BODY)),
    );
  });

  it("returns null when there is no key at all after the prefix", () => {
    assert.equal(yocoExpectedSignature("whsec_", signed), null);
    assert.equal(yocoExpectedSignature("", signed), null);
  });

  it("produces a signature that matches nothing when the key is malformed", () => {
    // Node's base64 decoder is lenient, so garbage still yields some key. That
    // is safe — the resulting signature simply never matches a real delivery —
    // and the test pins it so nobody later assumes an undecodable secret is
    // treated as "unconfigured" rather than as "wrong".
    const malformed = yocoExpectedSignature("whsec_!!!not-base64!!!", signed);
    assert.ok(malformed);
    assert.equal(yocoSignaturesMatch(malformed, `v1,${EXPECTED_SIGNATURE}`), false);
  });
});

describe("yocoSignaturesMatch", () => {
  it("accepts the version-prefixed form Yoco actually sends", () => {
    assert.equal(yocoSignaturesMatch(EXPECTED_SIGNATURE, `v1,${EXPECTED_SIGNATURE}`), true);
  });

  it("accepts a bare signature with no version prefix", () => {
    assert.equal(yocoSignaturesMatch(EXPECTED_SIGNATURE, EXPECTED_SIGNATURE), true);
  });

  it("accepts when any one of several signatures matches", () => {
    const header = `v1,${SOME_OTHER_SIGNATURE} v1,${EXPECTED_SIGNATURE}`;
    assert.equal(yocoSignaturesMatch(EXPECTED_SIGNATURE, header), true);
  });

  it("rejects a wrong signature", () => {
    assert.equal(yocoSignaturesMatch(EXPECTED_SIGNATURE, `v1,${SOME_OTHER_SIGNATURE}`), false);
  });

  it("rejects a missing header or an empty expectation", () => {
    assert.equal(yocoSignaturesMatch(EXPECTED_SIGNATURE, null), false);
    assert.equal(yocoSignaturesMatch(EXPECTED_SIGNATURE, ""), false);
    assert.equal(yocoSignaturesMatch("", EXPECTED_SIGNATURE), false);
  });
});

describe("yocoTimestampIsFresh", () => {
  const now = 1_720_000_000;

  it("accepts a timestamp inside the 3 minute window", () => {
    assert.equal(yocoTimestampIsFresh("1720000000", now), true);
    assert.equal(yocoTimestampIsFresh(String(now - YOCO_WEBHOOK_TOLERANCE_SECONDS), now), true);
    assert.equal(yocoTimestampIsFresh(String(now + YOCO_WEBHOOK_TOLERANCE_SECONDS), now), true);
  });

  it("rejects anything outside it", () => {
    assert.equal(
      yocoTimestampIsFresh(String(now - YOCO_WEBHOOK_TOLERANCE_SECONDS - 1), now),
      false,
    );
    assert.equal(
      yocoTimestampIsFresh(String(now + YOCO_WEBHOOK_TOLERANCE_SECONDS + 1), now),
      false,
    );
  });

  it("rejects values that are not a unix timestamp", () => {
    assert.equal(yocoTimestampIsFresh(null, now), false);
    assert.equal(yocoTimestampIsFresh("", now), false);
    assert.equal(yocoTimestampIsFresh("   ", now), false);
    assert.equal(yocoTimestampIsFresh("soon", now), false);
    assert.equal(yocoTimestampIsFresh("1720000000.5", now), false);
  });
});

describe("yocoCredentialsFrom", () => {
  it("is not configured until both the secret key and the webhook secret exist", () => {
    assert.equal(yocoCredentialsFrom(undefined, undefined), null);
    assert.equal(yocoCredentialsFrom(SECRET, undefined), null);
    assert.equal(yocoCredentialsFrom(undefined, SECRET), null);
    assert.equal(yocoCredentialsFrom("   ", "whsec_x"), null);
    assert.equal(yocoCredentialsFrom("sk_test_1", "   "), null);
  });

  it("trims both values", () => {
    const creds = yocoCredentialsFrom(`  ${SECRET}\n`, `  ${SECRET}  `);
    assert.equal(creds?.secretKey, SECRET);
    assert.equal(creds?.webhookSecret, SECRET);
  });

  it("takes the mode from the key itself, so a live key cannot run in test mode", () => {
    assert.equal(yocoCredentialsFrom("sk_test_abc", "whsec_x")?.mode, "test");
    assert.equal(yocoCredentialsFrom("sk_live_abc", "whsec_x")?.mode, "live");
    assert.equal(yocoCredentialsFrom("something-else", "whsec_x")?.mode, "test");
  });
});
