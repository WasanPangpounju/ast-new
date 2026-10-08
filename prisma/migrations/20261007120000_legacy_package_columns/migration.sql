-- Columns needed to hold the legacy MySQL packaging tables (packages / packageasts / htrpackages)
-- and to mark the carried-forward obligations, for scripts/migrate-legacy-packages.ts.
-- Additive only; touches package tables only (no materials changes, no FKs to materials).

-- AlterTable
ALTER TABLE "htrpackages" ADD COLUMN     "palletSteel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "palletWood" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "partition" INTEGER,
ADD COLUMN     "receiptId" INTEGER,
ADD COLUMN     "spoolCPaper" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spoolCPlastic" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spoolPaper" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spoolPlastic" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "package_return_obligations" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable (packageasts is empty on prod, so the NOT NULL ref_id needs no default)
ALTER TABLE "packageasts" ADD COLUMN     "box" INTEGER,
ADD COLUMN     "boxType" TEXT,
ADD COLUMN     "emp" TEXT,
ADD COLUMN     "packageStatus" TEXT,
ADD COLUMN     "pallet" INTEGER,
ADD COLUMN     "palletType" TEXT,
ADD COLUMN     "partition" INTEGER,
ADD COLUMN     "partitionType" TEXT,
ADD COLUMN     "ref_id" INTEGER NOT NULL,
ADD COLUMN     "sack" INTEGER,
ADD COLUMN     "sackType" TEXT,
ADD COLUMN     "spool" INTEGER,
ADD COLUMN     "spoolType" TEXT,
ADD COLUMN     "supplierName" TEXT;

-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "legacyDate" TEXT,
ADD COLUMN     "materialId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "htrpackages_receiptId_key" ON "htrpackages"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "package_return_obligations_legacyRef_category_key" ON "package_return_obligations"("legacyRef", "category");

-- CreateIndex
CREATE INDEX "packageasts_ref_id_packageStatus_idx" ON "packageasts"("ref_id", "packageStatus");

-- CreateIndex
CREATE INDEX "packages_materialId_idx" ON "packages"("materialId");

-- AddForeignKey
ALTER TABLE "htrpackages" ADD CONSTRAINT "htrpackages_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "package_return_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
