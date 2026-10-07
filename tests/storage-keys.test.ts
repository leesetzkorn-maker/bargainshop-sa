import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IMPORTED_KEY, MINTED_KEY, mintedKey, productImageKey } from "../src/lib/storage-keys";

/**
 * These patterns decide which strings are joined onto the uploads directory and
 * read off disk. Too strict and real product photos become unreadable by the AI
 * tools; too loose and a crafted URL reads a file outside the shop's uploads.
 * Both failure modes are worth a test rather than a careful read.
 */

describe("productImageKey", () => {
  it("accepts a key minted by the app", () => {
    assert.equal(
      productImageKey("/uploads/products/mfk3l2a-0123456789abcdef.webp"),
      "mfk3l2a-0123456789abcdef.webp",
    );
  });

  it("accepts an imported photo, which is most of the catalogue", () => {
    assert.equal(
      productImageKey("/uploads/products/2ds-0045-red-canister-vacuum-cleaner.webp"),
      "2ds-0045-red-canister-vacuum-cleaner.webp",
    );
  });

  it("refuses anything that could climb out of the uploads directory", () => {
    const attacks = [
      "/uploads/products/../../.env",
      "/uploads/products/..%2f..%2f.env",
      "/uploads/products/..\\..\\secrets.env",
      "/uploads/products/sub/dir.webp",
      "/uploads/products/",
      "/uploads/products/.env",
      "/uploads/products/photo.webp?raw=1",
      "/uploads/products/photo.webp#x",
      "/uploads/products/C:/windows/win.ini",
    ];
    for (const attack of attacks) {
      assert.equal(productImageKey(attack), null, attack);
    }
  });

  it("refuses directories that are not the product uploads", () => {
    assert.equal(productImageKey("/placeholder/power-tools.svg"), null);
    assert.equal(productImageKey("/media/hero/drill.jpg"), null);
    assert.equal(productImageKey("/uploads/ai/mfk3l2a-0123456789abcdef.webp"), null);
    assert.equal(productImageKey("/brand/mark.svg"), null);
  });
});

describe("mintedKey", () => {
  it("only resolves inside the directory it was asked for", () => {
    assert.equal(mintedKey("/uploads/ai/mfk3l2a-0123456789abcdef.webp", "ai"), "mfk3l2a-0123456789abcdef.webp");
    assert.equal(mintedKey("/uploads/ai/mfk3l2a-0123456789abcdef.webp", "products"), null);
  });

  it("refuses an imported name, which was never minted", () => {
    assert.equal(mintedKey("/uploads/ai/2ds-0045-drill.webp", "ai"), null);
  });
});

describe("the patterns themselves", () => {
  it("keeps the minted shape exact: lowercase base36 plus 16 hex", () => {
    assert.ok(MINTED_KEY.test("mfk3l2a-0123456789abcdef.webp"));
    assert.ok(!MINTED_KEY.test("mfk3l2a-0123456789abcde.webp"));
    assert.ok(!MINTED_KEY.test("MFK3L2A-0123456789ABCDEF.webp"));
    assert.ok(!MINTED_KEY.test("mfk3l2a-0123456789abcdefg.webp"));
  });

  it("lets an imported name be words and digits only", () => {
    assert.ok(IMPORTED_KEY.test("2ds-0045-red-canister-vacuum-cleaner.webp"));
    assert.ok(IMPORTED_KEY.test("photo.png"));
    assert.ok(!IMPORTED_KEY.test("-leading-dash.webp"));
    assert.ok(!IMPORTED_KEY.test("trailing-dash-.webp"));
    assert.ok(!IMPORTED_KEY.test("double--dash.webp"));
    assert.ok(!IMPORTED_KEY.test("UPPER.WEBP"));
    assert.ok(!IMPORTED_KEY.test("no-extension"));
  });
});