-- CreateEnum
CREATE TYPE "PackagingCategory" AS ENUM ('PALLET', 'BOX', 'SACK', 'SPOOL', 'PAPER_BAR');

-- CreateEnum
CREATE TYPE "PackageReturnStatus" AS ENUM ('PENDING', 'PARTIALLY_RETURNED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PackageReturnSourceType" AS ENUM ('MATERIAL_IMPORT', 'MATERIAL_OUTSIDE');

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "paperBar" INTEGER;

-- AlterTable
ALTER TABLE "material_outsides" ADD COLUMN     "box" INTEGER,
ADD COLUMN     "pallet" INTEGER,
ADD COLUMN     "paperBar" INTEGER,
ADD COLUMN     "sack" INTEGER;

-- CreateTable
CREATE TABLE "package_return_obligations" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "needsSupplierAssignment" BOOLEAN NOT NULL DEFAULT false,
    "category" "PackagingCategory" NOT NULL,
    "variant" TEXT,
    "sourceType" "PackageReturnSourceType" NOT NULL,
    "materialId" INTEGER,
    "materialOutsideId" INTEGER,
    "qtyDue" INTEGER NOT NULL,
    "qtyReturned" INTEGER NOT NULL DEFAULT 0,
    "status" "PackageReturnStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "package_return_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_return_entries" (
    "id" SERIAL NOT NULL,
    "obligationId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emp" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "package_return_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "package_return_obligations_supplierId_status_idx" ON "package_return_obligations"("supplierId", "status");

-- CreateIndex
CREATE INDEX "package_return_obligations_materialId_idx" ON "package_return_obligations"("materialId");

-- CreateIndex
CREATE INDEX "package_return_obligations_materialOutsideId_idx" ON "package_return_obligations"("materialOutsideId");

-- CreateIndex
CREATE INDEX "package_return_entries_obligationId_idx" ON "package_return_entries"("obligationId");

-- AddForeignKey
ALTER TABLE "package_return_obligations" ADD CONSTRAINT "package_return_obligations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_return_obligations" ADD CONSTRAINT "package_return_obligations_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_return_obligations" ADD CONSTRAINT "package_return_obligations_materialOutsideId_fkey" FOREIGN KEY ("materialOutsideId") REFERENCES "material_outsides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_return_entries" ADD CONSTRAINT "package_return_entries_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "package_return_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

