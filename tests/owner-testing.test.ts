import assert from "node:assert/strict";
import { test } from "node:test";
import { ownerTestedDescription, OWNER_TESTED_TEXT } from "../src/lib/owner-testing";

test("owner confirmation replaces testing warnings while preserving all other facts", () => {
  const condition = "Used — scratched shell, chipped paint and worn soles.";
  const limitation = "iCloud locked. Actual battery endurance has not been measured.";
  const text = `${condition}\n\n${limitation}\n\nTesting: Physical test results are awaiting owner confirmation; functionality is not confirmed by these photographs.\n\nPre-owned item — view actual photos.`;
  const result = ownerTestedDescription(text);
  assert.equal(result, text.replace("Testing: Physical test results are awaiting owner confirmation; functionality is not confirmed by these photographs.", OWNER_TESTED_TEXT));
  assert.equal(ownerTestedDescription(result), result);
});

test("existing descriptions gain owner confirmation without changing cosmetic text", () => {
  const text = "USED. Scratches and scuffs. Not refurbished and not new.";
  assert.equal(ownerTestedDescription(text), `${text}\n\n${OWNER_TESTED_TEXT}`);
});
