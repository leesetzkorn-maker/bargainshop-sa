import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  combinePriceReads,
  parsePrices,
  parseStockRef,
  readPriceTag,
  toCents,
  type PriceRead,
} from "../src/lib/intake/price-read";

/**
 * The handwritten markdown rule, pinned down.
 *
 * A printed original price together with a lower reduced price means the
 * reduced price is what the shop paid. Anything the reader is not sure about
 * must come back as NEEDS_CONFIRMATION rather than as a plausible-looking
 * number, because a guessed source cost silently becomes a public price.
 */

describe("toCents", () => {
  it("reads South African price formats", () => {
    assert.equal(toCents("1 299"), 129900);
    assert.equal(toCents("1,299.00"), 129900);
    assert.equal(toCents("495,00"), 49500);
    assert.equal(toCents("799"), 79900);
    assert.equal(toCents("1.299,00"), 129900);
  });

  it("refuses anything that is not a plain number", () => {
    assert.equal(toCents("abc"), null);
    assert.equal(toCents(""), null);
    assert.equal(toCents("12.345.678"), null);
  });
});

describe("parsePrices", () => {
  it("finds R-prefixed prices", () => {
    const prices = parsePrices("Original R1 299");
    assert.equal(prices.length, 1);
    assert.equal(prices[0]!.cents, 129900);
  });

  it("finds grouped numbers without the R", () => {
    const prices = parsePrices("1 299");
    assert.equal(prices.length, 1);
    assert.equal(prices[0]!.cents, 129900);
  });

  it("does not read a stock number as a price", () => {
    assert.deepEqual(parsePrices("S029164A"), []);
    assert.deepEqual(parsePrices("2DS-0081"), []);
  });
});

describe("parseStockRef", () => {
  it("reads a pawn ticket reference", () => {
    assert.equal(parseStockRef("stock S029164A on file"), "S029164A");
  });

  it("reads an item code", () => {
    assert.equal(parseStockRef("ref 2DS-0081"), "2DS0081");
  });

  it("returns null when there is no reference", () => {
    assert.equal(parseStockRef("a helmet with scratches"), null);
  });
});

describe("readPriceTag", () => {
  it("uses the handwritten reduced price as the source cost", () => {
    const read = readPriceTag([
      { text: "Original R1 299", confidence: 92 },
      { text: "R495", confidence: 88 },
    ]);
    assert.equal(read.printedPriceCents, 129900);
    assert.equal(read.markdownPriceCents, 49500);
    assert.equal(read.sourceCostCents, 49500);
    assert.equal(read.confidence, "CONFIRMED");
  });

  it("does not guess when the handwriting read is weak", () => {
    const read = readPriceTag([
      { text: "Original R1 299", confidence: 90 },
      { text: "R495", confidence: 55 },
    ]);
    assert.equal(read.sourceCostCents, 49500);
    assert.equal(read.confidence, "NEEDS_CONFIRMATION");
  });

  it("confirms a single clearly-read price", () => {
    const read = readPriceTag([{ text: "R799", confidence: 95 }]);
    assert.equal(read.sourceCostCents, 79900);
    assert.equal(read.confidence, "CONFIRMED");
  });

  it("flags a single badly-read price for confirmation", () => {
    const read = readPriceTag([{ text: "R799", confidence: 41 }]);
    assert.equal(read.sourceCostCents, 79900);
    assert.equal(read.confidence, "NEEDS_CONFIRMATION");
  });

  it("refuses to invent a price when nothing was read", () => {
    const read = readPriceTag([{ text: "scratched shell", confidence: 90 }]);
    assert.equal(read.sourceCostCents, null);
    assert.equal(read.confidence, "NONE");
    assert.equal(read.stockRef, null);
  });

  it("downgrades two disagreeing reads instead of averaging them", () => {
    const read = combinePriceReads([
      { ...readPriceTag([{ text: "R495", confidence: 95 }]), sourceCostCents: 49500 },
      { ...readPriceTag([{ text: "R600", confidence: 95 }]), sourceCostCents: 60000 },
    ] as PriceRead[]);
    assert.equal(read.confidence, "NEEDS_CONFIRMATION");
  });

  it("keeps one clear confirmed read across several photos", () => {
    const read = combinePriceReads([
      readPriceTag([{ text: "R495", confidence: 95 }]),
      readPriceTag([{ text: "price R495", confidence: 91 }]),
    ]);
    assert.equal(read.sourceCostCents, 49500);
    assert.equal(read.confidence, "CONFIRMED");
  });
});
