-- The attestation was first stored beside the product. The storefront reads it
-- on the product row, so the same two fields live there as well.
ALTER TABLE "Product" ADD COLUMN "testingStatus" TEXT NOT NULL DEFAULT 'NOT_TESTED';
ALTER TABLE "Product" ADD COLUMN "testedAt" DATETIME;
