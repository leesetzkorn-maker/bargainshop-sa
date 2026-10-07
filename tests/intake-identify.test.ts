import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groupPhotos,
  identifyBrand,
  matchCategory,
  suggestProductType,
  suggestTitle,
} from "../src/lib/intake/identify";

/**
 * Identification only ever SUGGESTS. Every case here that has no evidence must
 * come back empty, because an invented brand or model in a listing is a false
 * claim about a real second-hand item.
 */

describe("identifyBrand", () => {
  it("finds a brand written on the photo", () => {
    const found = identifyBrand("BOSCH GSB 13 RE hammer drill");
    assert.equal(found?.brand, "Bosch");
    assert.equal(found?.confidence, "HIGH");
  });

  it("downgrades to MEDIUM when several brands are visible", () => {
    const found = identifyBrand("BOSCH battery fits MAKITA cases");
    assert.ok(found);
    assert.equal(found.confidence, "MEDIUM");
    assert.ok(found.all.length >= 2);
  });

  it("returns null when nothing is recognised", () => {
    assert.equal(identifyBrand("a scuffed blue helmet"), null);
  });
});

describe("suggestProductType", () => {
  it("names the product from its cue words", () => {
    assert.equal(suggestProductType("Professional angle grinder 850W"), "angle grinder");
    assert.equal(suggestProductType("full face helmet visor"), "full face helmet");
  });

  it("returns null rather than guessing", () => {
    assert.equal(suggestProductType("assorted household items"), null);
  });
});

describe("suggestTitle", () => {
  it("builds a title only from confirmed parts", () => {
    assert.equal(
      suggestTitle({ brand: "Bosch", model: "GSB 13 RE", type: "power drill" }),
      "Bosch GSB 13 RE power drill",
    );
  });

  it("returns an empty string when nothing is known", () => {
    assert.equal(suggestTitle({}), "");
  });
});

describe("matchCategory", () => {
  const categories = [
    { id: "cat-tools", name: "Power Tools" },
    { id: "cat-helmets", name: "Helmets & Riding Gear" },
    { id: "cat-home", name: "Home & Garden" },
  ];

  it("matches on overlapping words", () => {
    const match = matchCategory("Bosch power drill spare chuck", categories);
    assert.equal(match?.id, "cat-tools");
  });

  it("suggests nothing below the overlap threshold", () => {
    assert.equal(matchCategory("blue ceramic mug", categories), null);
  });
});

describe("groupPhotos", () => {
  it("puts one upload session into a single product gallery", () => {
    const groups = groupPhotos([
      { key: "a" },
      { key: "b" },
      { key: "c" },
      { key: "d" },
      { key: "e" },
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0]!.keys, ["a", "b", "c", "d", "e"]);
  });

  it("starts a new product only when Lee says the photo is a different item", () => {
    const groups = groupPhotos([
      { key: "a" },
      { key: "b" },
      { key: "c", separate: true },
      { key: "d" },
    ]);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0]!.keys, ["a", "b"]);
    assert.deepEqual(groups[1]!.keys, ["c", "d"]);
  });

  it("handles an empty batch", () => {
    assert.deepEqual(groupPhotos([]), []);
  });
});
