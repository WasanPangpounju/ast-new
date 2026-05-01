-- AlterTable
ALTER TABLE "ast_purchaseorders" ADD COLUMN     "commission" DOUBLE PRECISION,
ADD COLUMN     "create_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "discount_p" DOUBLE PRECISION,
ADD COLUMN     "discount_yard" DOUBLE PRECISION,
ADD COLUMN     "fabric_sp_p" DOUBLE PRECISION,
ADD COLUMN     "fabric_spy" DOUBLE PRECISION,
ADD COLUMN     "order_sum_m" DOUBLE PRECISION,
ADD COLUMN     "price_m" DOUBLE PRECISION,
ADD COLUMN     "price_yard" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "coordinators" (
    "id" SERIAL NOT NULL,
    "tax" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job_title" TEXT,
    "tel" TEXT,

    CONSTRAINT "coordinators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coordinators_tax_idx" ON "coordinators"("tax");
