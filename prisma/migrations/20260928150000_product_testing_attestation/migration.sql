-- Per-item testing attestation.
-- Split from `condition` on purpose: the cosmetic grade must never imply that
-- anyone switched the item on.
CREATE TABLE "Product_testing_attestation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testingStatus" TEXT NOT NULL DEFAULT 'NOT_TESTED',
    "testedAt" DATETIME,
    CONSTRAINT "Product_testing_attestation_pkey" FOREIGN KEY ("id") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Product_testing_attestation_testingStatus_idx" ON "Product_testing_attestation"("testingStatus");

-- Backfill: the seller has not yet attested to any existing row.
INSERT INTO "Product_testing_attestation" ("id", "testingStatus", "testedAt")
SELECT "id", 'NOT_TESTED', NULL FROM "Product";
