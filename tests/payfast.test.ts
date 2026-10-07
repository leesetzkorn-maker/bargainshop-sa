import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  payfastAmount,
  payfastEncode,
  payfastParameterString,
  payfastSignature,
  payfastSignaturesMatch,
} from "../src/lib/payments/providers/payfast-signature";

/**
 * The encoder is the part that silently breaks signatures, so it is pinned
 * against PHP's urlencode() rules rather than against encodeURIComponent().
 */
describe("payfastEncode", () => {
  it("leaves the unreserved set alone", () => {
    assert.equal(payfastEncode("aZ09-_. "), "aZ09-_.+");
  });

  it("encodes a space as + and an apostrophe as %27", () => {
    assert.equal(payfastEncode("Pieter's drill"), "Pieter%27s+drill");
  });

  it("encodes the characters encodeURIComponent leaves raw", () => {
    assert.equal(payfastEncode("a!b~c*d(e)"), "a%21b%7Ec%2Ad%28e%29");
  });

  it("uppercases percent triplets and UTF-8 encodes non-ASCII", () => {
    assert.equal(payfastEncode("R290 / 50%"), "R290+%2F+50%25");
    assert.equal(payfastEncode("café"), "caf%C3%A9");
  });
});

describe("payfastParameterString", () => {
  it("sorts keys, drops blanks and skips the signature field", () => {
    const result = payfastParameterString({
      merchant_key: "abc",
      signature: "should-not-appear",
      amount: "100.00",
      email: "",
      name: "A B",
    });
    assert.equal(result, "amount=100.00&merchant_key=abc&name=A+B");
  });

  it("trims values before encoding", () => {
    assert.equal(payfastParameterString({ name: "  Ann  " }), "name=Ann");
  });

  it("appends the passphrase last when one is set", () => {
    const result = payfastParameterString({ amount: "1.00" }, "secret word");
    assert.equal(result, "amount=1.00&passphrase=secret+word");
  });

  it("omits the passphrase when it is blank", () => {
    assert.equal(payfastParameterString({ amount: "1.00" }, "   "), "amount=1.00");
  });
});

describe("payfastSignature", () => {
  it("is a lowercase 32-character md5", () => {
    const sig = payfastSignature({ amount: "100.00", merchant_id: "10000100" }, "pass");
    assert.match(sig, /^[0-9a-f]{32}$/);
  });

  it("is stable and depends on the passphrase", () => {
    const fields = { amount: "100.00", merchant_id: "10000100" };
    assert.equal(payfastSignature(fields, "pass"), payfastSignature(fields, "pass"));
    assert.notEqual(payfastSignature(fields, "pass"), payfastSignature(fields, "other"));
  });

  it("changes when any signed value changes", () => {
    const base = { amount: "100.00", merchant_id: "10000100" };
    const raised = { amount: "1.00", merchant_id: "10000100" };
    assert.notEqual(payfastSignature(base), payfastSignature(raised));
  });
});

describe("payfastSignaturesMatch", () => {
  const signature = payfastSignature({ amount: "1.00" }, "pass");

  it("accepts case-insensitive whitespace-padded input", () => {
    assert.equal(payfastSignaturesMatch(signature, ` ${signature.toUpperCase()} `), true);
  });

  it("rejects a missing or wrong signature", () => {
    assert.equal(payfastSignaturesMatch(signature, undefined), false);
    assert.equal(payfastSignaturesMatch(signature, "0".repeat(32)), false);
  });
});

describe("payfastAmount", () => {
  it("renders cents as a fixed 2-decimal string without float drift", () => {
    assert.equal(payfastAmount(100), "1.00");
    assert.equal(payfastAmount(89_900), "899.00");
    assert.equal(payfastAmount(1), "0.01");
    assert.equal(payfastAmount(129_95), "129.95");
  });
});
