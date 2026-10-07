/**
 * Shared vocabulary for Smart Product Intake.
 *
 * Kept in one small module so the admin UI, the server actions and the DAL all
 * spell these values the same way, and so the pure intake logic can be unit
 * tested without pulling in Prisma or the Next runtime.
 */

/** How sure we are that the stored source cost really is the tag price. */
export const SOURCE_CONFIDENCES = ["CONFIRMED", "NEEDS_CONFIRMATION", "NONE"] as const;
export type SourceConfidence = (typeof SOURCE_CONFIDENCES)[number];

/** How the retailer price tag was dealt with on the public copy of a photo. */
export const COVER_MODES = ["NONE", "AUTO_MASK", "MANUAL_MASK", "AI_REMOVED"] as const;
export type CoverMode = (typeof COVER_MODES)[number];

/** What Lee decided to do with the item. */
export const DISPOSITIONS = ["PUBLISH", "HOLD", "BUNDLE", "DO_NOT_BUY"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

/** The market-value safety verdict for a listing. */
export const MARKET_FLAGS = ["LOW_MARGIN", "GOOD_MARGIN", "HIGH_PRICE_REVIEW", "MARKET_CHECK_NEEDED"] as const;
export type MarketFlag = (typeof MARKET_FLAGS)[number];

/** A product gallery, like the product form's own cap. */
export const MAX_INTAKE_PHOTOS = 12;

/** Reasonable bounds for a source cost read off a second-hand price tag. */
export const MIN_SOURCE_COST_CENTS = 100;
export const MAX_SOURCE_COST_CENTS = 20_000_000;

/** Above this source cost we insist on a market check before publishing. */
export const MARKET_CHECK_ABOVE_CENTS = 50_000;
