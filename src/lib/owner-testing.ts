/** Only obsolete physical-test warnings are replaced. Model, cosmetic condition,
 * account locks, accessories and measured battery endurance are separate facts. */
export const OWNER_TESTED_TEXT = "Testing: Tested and working. Physically tested by the owner and confirmed fully functional.";

export function ownerTestedDescription(description: string): string {
  const pending = "Testing: Physical test results are awaiting owner confirmation; functionality is not confirmed by these photographs.";
  let result = description.replaceAll(pending, OWNER_TESTED_TEXT)
    .replace(/Testing required\.(?:\s*The store has not confirmed a physical check of this item yet\.)?/gi, "")
    .replaceAll("The store has not confirmed a physical check of this item yet.", "");
  if (!result.includes(OWNER_TESTED_TEXT)) result = `${result.trim()}\n\n${OWNER_TESTED_TEXT}`;
  return result;
}
