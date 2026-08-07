-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "costIncludesTax" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "priceIncludesTax" BOOLEAN NOT NULL DEFAULT true;
