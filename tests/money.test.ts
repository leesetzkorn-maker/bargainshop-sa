import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { centsToInput, formatWeight, formatZAR, parseZARToCents } from "../src/lib/money";

describe("money", () => {
  it("parses grouped Rand amounts exactly and rejects trailing junk", () => {
    assert.equal(parseZARToCents("R1,499.00"), 149900);
    assert.equal(parseZARToCents("R1.499,50"), 149950);
    assert.equal(parseZARToCents("1 499,00"), 149900);
    assert.equal(parseZARToCents("1,499"), 149900);
    assert.equal(parseZARToCents("150abc"), null);
    assert.equal(parseZARToCents("0.995"), null);
    assert.equal(parseZARToCents(1.499), 150);
  });
  it("formats cents as South African rand", () => {
    const formatted = formatZAR(149900);
    assert.match(formatted, /R/);
    assert.match(formatted, /1[\s\u00a0\u202f]?499/);
  });

  it("parses rand typed by a person into cents", () => {
    assert.equal(parseZARToCents("R1 499.00"), 149900);
    assert.equal(parseZARToCents("1,499"), 149900);
    assert.equal(parseZARToCents("1499.50"), 149950);
    assert.equal(parseZARToCents(""), null);
    assert.equal(parseZARToCents("-5"), null);
    assert.equal(parseZARToCents("free"), null);
  });

  it("turns cents back into an input value", () => {
    assert.equal(centsToInput(149900), "1499.00");
    assert.equal(centsToInput(null), "");
  });

  it("formats weight without inventing kilograms for small parcels", () => {
    assert.equal(formatWeight(500), "500 g");
    assert.match(formatWeight(1500), /kg/);
    assert.equal(formatWeight(0), "—");
  });
});
