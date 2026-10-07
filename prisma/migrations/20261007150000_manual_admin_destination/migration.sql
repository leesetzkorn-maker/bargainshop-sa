ALTER TABLE "Product" ADD COLUMN "specifications" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "includedItems" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "priceManualOverride" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShippingRule" ADD COLUMN "provinceCodes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShippingRule" ADD COLUMN "postalCodePrefixes" TEXT NOT NULL DEFAULT '';
