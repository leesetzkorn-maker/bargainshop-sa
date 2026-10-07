-- Smart Product Intake.
--
-- ProductImage gains the split between the untouched upload and the public
-- copy: `originalKey` points at the archived original (kept outside public/,
-- because a fetchable photo of the retailer's tag IS the private source cost),
-- while `coverMode`/`maskBoxes` record how the tag was covered on the public
-- copy that the storefront serves.
--
-- Product gains the intake decisions: how sure we are about the source cost,
-- the market-value verdict, what Lee decided to do with the item, and the
-- engine's recommendation at intake time so a later override stays visible.

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN "originalKey" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "coverMode" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN "maskBoxes" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "sourceConfidence" TEXT;
ALTER TABLE "Product" ADD COLUMN "marketFlag" TEXT;
ALTER TABLE "Product" ADD COLUMN "disposition" TEXT;
ALTER TABLE "Product" ADD COLUMN "recommendedPriceCents" INTEGER;
