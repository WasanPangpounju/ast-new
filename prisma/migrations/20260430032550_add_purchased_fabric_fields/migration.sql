-- AlterTable
ALTER TABLE "stockfabrics" ADD COLUMN     "bill_ref" TEXT,
ADD COLUMN     "dye_lot" TEXT,
ADD COLUMN     "is_purchased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "price_per_yard" DOUBLE PRECISION,
ADD COLUMN     "supplier" TEXT;

-- CreateIndex
CREATE INDEX "stockfabrics_is_purchased_idx" ON "stockfabrics"("is_purchased");
