-- AlterTable
ALTER TABLE "Product" ADD COLUMN "conditionNote" TEXT;

-- Former grades: Excellent -> Very good, Fair -> Used.
UPDATE "Product" SET "condition" = 'VERY_GOOD' WHERE "condition" = 'EXCELLENT';
UPDATE "Product" SET "condition" = 'USED' WHERE "condition" = 'FAIR';

UPDATE "OrderItem" SET "conditionSnapshot" = 'VERY_GOOD' WHERE "conditionSnapshot" = 'EXCELLENT';
UPDATE "OrderItem" SET "conditionSnapshot" = 'USED' WHERE "conditionSnapshot" = 'FAIR';
