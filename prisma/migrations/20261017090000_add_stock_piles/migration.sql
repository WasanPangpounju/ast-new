-- กองผ้าที่ผู้ใช้สร้างเอง (สต็อกผ้า). Additive only: new table + nullable columns,
-- every existing row keeps stock_pile_id NULL = กองหลัก (grouping unchanged).

-- CreateTable
CREATE TABLE "stock_piles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "fabricStruct" TEXT NOT NULL,
    "fabricPattern" TEXT NOT NULL DEFAULT '',
    "fabricW" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stock_piles_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "stockfabrics" ADD COLUMN "stock_pile_id" INTEGER;

-- AlterTable
ALTER TABLE "fabricouts" ADD COLUMN "stock_pile_id" INTEGER;

-- CreateIndex
CREATE INDEX "stockfabrics_stock_pile_id_idx" ON "stockfabrics"("stock_pile_id");

-- CreateIndex
CREATE INDEX "fabricouts_stock_pile_id_idx" ON "fabricouts"("stock_pile_id");

-- AddForeignKey
ALTER TABLE "stockfabrics" ADD CONSTRAINT "stockfabrics_stock_pile_id_fkey" FOREIGN KEY ("stock_pile_id") REFERENCES "stock_piles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabricouts" ADD CONSTRAINT "fabricouts_stock_pile_id_fkey" FOREIGN KEY ("stock_pile_id") REFERENCES "stock_piles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
