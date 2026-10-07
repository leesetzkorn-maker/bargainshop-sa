-- Record where a product's packed weight and dimensions came from.
--
-- MEASURED  = someone put the packed item on a scale and a tape measure.
-- ESTIMATED = derived from the product's published specification, with the
--             shipping engine's safety uplift already applied.
--
-- The storefront and the admin list both read this, so a customer is never told
-- a figure is exact when it is an estimate.
ALTER TABLE "Product" ADD COLUMN "measurementSource" TEXT NOT NULL DEFAULT 'MEASURED';
