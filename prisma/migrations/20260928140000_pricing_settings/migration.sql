-- Admin-configurable markup rule.
-- Previously there was no pricing configuration at all: admins typed the
-- selling price and the source cost as two unrelated numbers.
CREATE TABLE "PricingSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY CONSTRAINT "PricingSetting_pkey",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "markupPercent" INTEGER NOT NULL DEFAULT 60,
    "roundingIncrementCents" INTEGER NOT NULL DEFAULT 100,
    "minPriceCents" INTEGER NOT NULL DEFAULT 0,
    "autoApplyToDrafts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
