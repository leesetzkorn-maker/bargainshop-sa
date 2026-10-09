import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  productReadinessIssues,
  productCheckoutIssues,
  catalogueFlags,
  summariseReadiness,
  type ReadinessInput,
} from "../src/lib/product-readiness";

/** A listing that is ready to publish. Individual tests break one field. */
const complete: ReadinessInput = {
  brand: "Makita", model: "test-model", modelSourceUrl: "https://example.com/specs",
  specsConfirmed: true, itemReviewConfirmed: true, cleanImageLicense: "Owner photo edited with original kept", sourceCostCents: 50000, measurementSource: "MEASURED",
  name: "Makita 1100W Impact Drill with Chuck",
  priceCents: 89_900,
  stockQty: 1,
  productWeightGrams: 2400,
  packageLengthCm: 30,
  packageWidthCm: 22,
  packageHeightCm: 12,
  condition: "GOOD",
  description: "Second-hand impact drill in working order, tested on site.",
  imageCount: 3,
  categoryId: "cat_1",
};

function fields(input: Partial<ReadinessInput>): string[] {
  return productReadinessIssues({ ...complete, ...input }).map((issue) => issue.field);
}

describe("productReadinessIssues", () => {
  it("blocks unsupported model matches, unreviewed stock and unlicensed clean images", () => {
    assert.deepEqual(new Set(catalogueFlags({ ...complete, modelSourceUrl: "", itemReviewConfirmed: false, cleanImageLicense: "" })), new Set(["NEEDS REVIEW", "NEEDS IMAGE", "NEEDS SPECS"]));
    assert.deepEqual(catalogueFlags(complete), ["READY"]);
  });
  it("blocks missing costs and unmeasured parcels even with a selling price", () => {
    const flags = catalogueFlags({ ...complete, sourceCostCents: null, measurementSource: "ESTIMATED" });
    assert.ok(flags.includes("NEEDS PRICE"));
    assert.ok(flags.includes("NEEDS REVIEW"));
  });
  it("accepts a fully described listing", () => {
    assert.deepEqual(productReadinessIssues(complete), []);
  });

  it("blocks a draft with no measurements, which is the imported-photo case", () => {
    const issues = productReadinessIssues({
      ...complete,
      productWeightGrams: 0,
      packageLengthCm: 0,
      packageWidthCm: 0,
      packageHeightCm: 0,
    });
    const found = issues.map((issue) => issue.field);
    assert.ok(found.includes("weight"));
    assert.ok(found.includes("dimensions"));
  });

  it("blocks a draft with no selling price", () => {
    assert.ok(fields({ priceCents: 0 }).includes("price"));
  });

  it("treats a negative price as no price", () => {
    assert.ok(fields({ priceCents: -100 }).includes("price"));
  });

  it("blocks when stock is zero", () => {
    assert.ok(fields({ stockQty: 0 }).includes("stock"));
  });

  it("blocks a listing with no photograph", () => {
    assert.ok(fields({ imageCount: 0 }).includes("image"));
  });

  it("rejects a description too short to be honest about the item", () => {
    assert.ok(fields({ description: "drill" }).includes("description"));
    assert.deepEqual(fields({ description: "x".repeat(20) }), []);
  });

  it("ignores a whitespace-only description", () => {
    assert.ok(fields({ description: "                    " }).includes("description"));
  });

  it("blocks a missing category", () => {
    assert.ok(fields({ categoryId: "" }).includes("category"));
  });

  it("rejects partial dimensions, because the courier needs all three", () => {
    assert.ok(fields({ packageHeightCm: 0 }).includes("dimensions"));
    assert.ok(fields({ packageWidthCm: 0 }).includes("dimensions"));
    assert.ok(fields({ packageLengthCm: 0 }).includes("dimensions"));
  });

  it("reports price and measurements first, because those block the sale outright", () => {
    const issues = productReadinessIssues({
      ...complete,
      priceCents: 0,
      productWeightGrams: 0,
      packageLengthCm: 0,
      packageWidthCm: 0,
      packageHeightCm: 0,
      imageCount: 0,
    });
    assert.equal(issues[0].field, "price");
    assert.equal(issues[1].field, "weight");
  });
});

describe("summariseReadiness", () => {
  it("is empty when there is nothing to fix", () => {
    assert.equal(summariseReadiness([]), "");
  });

  it("repeats the single problem verbatim", () => {
    const issues = productReadinessIssues({ ...complete, productWeightGrams: 0 });
    assert.equal(summariseReadiness(issues), issues[0].message);
  });

  it("counts the rest instead of dumping the whole checklist", () => {
    const issues = productReadinessIssues({
      ...complete,
      productWeightGrams: 0,
      imageCount: 0,
      categoryId: "",
    });
    const summary = summariseReadiness(issues);
    assert.ok(summary.startsWith(issues[0].message));
    assert.ok(summary.includes("2 more things"));
  });

  it("uses the singular for exactly one remaining problem", () => {
    const issues = productReadinessIssues({ ...complete, productWeightGrams: 0, imageCount: 0 });
    assert.ok(summariseReadiness(issues).includes("1 more thing still needs attention"));
  });
});


describe("checkout of already published listings", () => {
  it("accepts actual photos and parcel data without internal research or image-edit fields", () => {
    const published = { ...complete, brand: "", model: "", modelSourceUrl: "",
      specsConfirmed: false, itemReviewConfirmed: false, cleanImageLicense: "",
      sourceCostCents: null, measurementSource: "ESTIMATED", imageCount: 1 };
    assert.deepEqual(productCheckoutIssues(published), []);
    assert.ok(productReadinessIssues(published).length > 0);
  });
  it("still rejects missing selling price, stock, photos and parcel measurements", () => {
    for (const [input, field] of [
      [{ priceCents: 0 }, "price"], [{ stockQty: 0 }, "stock"],
      [{ imageCount: 0 }, "image"], [{ productWeightGrams: 0 }, "weight"],
      [{ packageHeightCm: 0 }, "dimensions"],
    ] as const) {
      assert.ok(productCheckoutIssues({ ...complete, ...input }).some(issue => issue.field === field));
    }
  });
});
