/** Publishing requires sourced identity, actual-item review, photographs, pricing and measured parcel data. */

/** The fields a listing needs before it can go live. */
export interface ReadinessInput {
  name: string;
  priceCents: number;
  stockQty: number;
  productWeightGrams: number;
  packageLengthCm: number;
  packageWidthCm: number;
  packageHeightCm: number;
  condition: string;
  description: string;
  imageCount: number;
  categoryId: string;
  researchNotes?: string;
  brand?: string;
  model?: string;
  modelSourceUrl?: string;
  specsConfirmed?: boolean;
  itemReviewConfirmed?: boolean;
  cleanImageLicense?: string;
  sourceCostCents?: number | null;
  measurementSource?: string;
}

export interface ReadinessIssue {
  /** Stable key so the admin UI can link straight to the field. */
  field: "price" | "stock" | "weight" | "dimensions" | "condition" | "description" | "image" | "category" | "review" | "specs";
  message: string;
}

/** Statuses that are still in the owner's hands and are allowed to be incomplete. */
const PRE_LAUNCH_STATUSES = new Set(["DRAFT", "ARCHIVED"]);

/** Everything `productReadinessIssues` needs, as a Prisma select. */
export const readinessSelect = {
  name: true,
  priceCents: true,
  stockQty: true,
  productWeightGrams: true,
  packageLengthCm: true,
  packageWidthCm: true,
  packageHeightCm: true,
  condition: true,
  description: true,
  categoryId: true,
  brand: true,
  model: true,
  modelSourceUrl: true,
  specsConfirmed: true,
  itemReviewConfirmed: true,
  cleanImageLicense: true,
  sourceCostCents: true,
  measurementSource: true,
  _count: { select: { images: true } },
} as const;

/** Adapts a Prisma row (which counts images) to the plain input shape. */
export function readinessInput(row: Omit<ReadinessInput, "imageCount"> & { _count: { images: number } }): ReadinessInput {
  return { ...row, imageCount: row._count.images };
}

export function isPreLaunchStatus(status: string): boolean {
  return PRE_LAUNCH_STATUSES.has(status);
}

/**
 * Every reason this listing cannot be published. An empty array means it can.
 *
 * Ordered so the price and the measurements come first: those are the two that
 * block a sale outright, and they are the two the owner has to go and measure.
 */
export function productCheckoutIssues(product: ReadinessInput): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];

  if (product.priceCents <= 0) {
    issues.push({
      field: "price",
      message:
        "This draft has no selling price yet. Enter a confirmed cost and use the Pricing recommendation or set a selling price before publishing.",
    });
  }

  if (product.stockQty <= 0) {
    issues.push({ field: "stock", message: "Stock is zero, so there is nothing to sell." });
  }

  if (!(product.productWeightGrams > 0)) {
    issues.push({
      field: "weight",
      message:
        "Item weight is missing. Weigh the item, or apply the estimated packed figures — courier and locker prices are calculated from weight, so the item cannot be sold without it.",
    });
  }

  const { packageLengthCm: length, packageWidthCm: width, packageHeightCm: height } = product;
  if (!(length > 0) || !(width > 0) || !(height > 0)) {
    issues.push({
      field: "dimensions",
      message:
        "Parcel size is missing. Measure the packed item, or apply the estimated box size — volumetric weight and the locker size limit are calculated from it.",
    });
  }

  if (!product.condition) {
    issues.push({ field: "condition", message: "Condition grade is missing." });
  }

  if (!product.description || product.description.trim().length < 20) {
    issues.push({
      field: "description",
      message: "Description is missing or too short to describe the item honestly.",
    });
  }

  if (product.imageCount < 1) {
    issues.push({
      field: "image",
      message: "No photograph. A second-hand item is sold on its photos, so at least one is required.",
    });
  }
  if (!product.categoryId) {
    issues.push({ field: "category", message: "No category is selected." });
  }

  return issues;
}

/** Additional owner checks apply when publishing, not when buying an ACTIVE listing. */
export function productReadinessIssues(product: ReadinessInput): ReadinessIssue[] {
  const issues = productCheckoutIssues(product);
  if (product.cleanImageLicense?.trim() && product.imageCount === 1) {
    issues.push({ field: "image", message: "Keep actual-item photographs alongside the clean image; at least two gallery images are required." });
  }

  if (!product.itemReviewConfirmed) issues.push({ field: "review", message: "Confirm the actual item, stock, condition and included accessories before publishing." });
  // Actual-item photos are sufficient. A separate clean image is optional.
  if (product.sourceCostCents == null) issues.push({ field: "price", message: "Source cost is missing; profit cannot be verified." });
  if (product.measurementSource !== "MEASURED") issues.push({ field: "dimensions", message: "Confirm the packed weight and outer parcel dimensions before publishing." });

  return issues;
}

export const CATALOGUE_FLAGS = ["NEEDS REVIEW", "NEEDS IMAGE", "NEEDS SPECS", "NEEDS PRICE"] as const;
export function catalogueFlags(product: ReadinessInput): string[] {
  const issues = productReadinessIssues(product);
  if (!issues.length) return ["READY"];
  const flags = new Set<string>();
  for (const issue of issues) {
    flags.add(issue.field === "price" ? "NEEDS PRICE" : issue.field === "image" ? "NEEDS IMAGE" : issue.field === "specs" ? "NEEDS SPECS" : "NEEDS REVIEW");
  }
  return [...flags];
}

/**
 * The single sentence the admin sees when a publish is refused.
 *
 * It lists only the first two problems. A wall of eight is what makes an admin
 * give up on a checklist; the full list is still available on the edit form.
 */
export function summariseReadiness(issues: ReadinessIssue[]): string {
  if (issues.length === 0) return "";
  if (issues.length === 1) return issues[0].message;
  const remaining = issues.length - 1;
  return `${issues[0].message} ${remaining} more thing${remaining === 1 ? "" : "s"} still need${
    remaining === 1 ? "s" : ""
  } attention.`;
}
