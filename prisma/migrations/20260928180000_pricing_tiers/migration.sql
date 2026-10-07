-- Tiered markup. Acquisition cost stays internal. The calculator reads tiersJson.
ALTER TABLE "PricingSetting" ADD COLUMN "tiersJson" TEXT NOT NULL DEFAULT '[]';
