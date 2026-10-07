import { z } from "zod";

/** Grok supplies observations; this schema deliberately contains no inferred specifications. */
export const grokIntakeSchema = z.array(z.object({
  itemId: z.string().regex(/^2DS-\d{4}$/),
  originalFilename: z.string().min(1).max(255).refine((value) => !/[\\/]/.test(value) && !value.includes(".."), "Use the original filename only"),
  product: z.string().trim().min(3).max(140),
  brand: z.string().trim().max(100).nullable(),
  model: z.string().trim().max(100).nullable(),
  sourceCostCents: z.number().int().min(0).max(100_000_000).nullable(),
  condition: z.enum(["VERY_GOOD", "GOOD", "USED", "AS_IS"]),
  visibleCondition: z.string().trim().min(1).max(1000),
  visibleDamage: z.string().trim().max(1000),
  accessoriesIncluded: z.array(z.string().trim().min(1).max(200)).max(30),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
})).min(1).max(500);
export type GrokIntakeRow = z.infer<typeof grokIntakeSchema>[number];

export function grokDraftDescription(row: GrokIntakeRow): string {
  return [row.product, `Brand: ${row.brand || "Not identified"}\nRecorded model: ${row.model || "Not identified; exact model needs confirmation"}`,
    `Second-hand condition: ${row.visibleCondition}`,
    `Visible wear / damage: ${row.visibleDamage || "No damage recorded; this is not a functional test."}`,
    `What's included (recorded intake): ${row.accessoriesIncluded.length ? row.accessoriesIncluded.join(", ") : "Accessories not confirmed"}. Confirm against the actual item before sale.`,
    "Specifications, product dimensions, weight and compatibility: pending exact-model manufacturer verification. Parcel measurements must be checked separately.",
    "Functionality: not confirmed by photographs. Account locks and test results require actual-item review.",
    "Pre-owned item — please view actual-item photos for condition."].join("\n\n");
}
