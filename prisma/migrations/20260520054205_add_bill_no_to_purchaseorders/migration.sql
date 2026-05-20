/*
  Warnings:

  - You are about to drop the column `created_at` on the `material_outsides` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `material_outsides` table. All the data in the column will be lost.
  - Added the required column `spool` to the `material_outsides` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `material_outsides` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weightWithdrawn` to the `material_outsides` table without a default value. This is not possible if the table is not empty.
  - Added the required column `withdrawId` to the `material_outsides` table without a default value. This is not possible if the table is not empty.
  - Added the required column `yarnType` to the `material_outsides` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ast_purchaseorders" ADD COLUMN     "bill_no" INTEGER;

-- AlterTable
ALTER TABLE "material_outsides" DROP COLUMN "created_at",
DROP COLUMN "updated_at",
ADD COLUMN     "averageKg" DOUBLE PRECISION,
ADD COLUMN     "averageP" DOUBLE PRECISION,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lot" TEXT,
ADD COLUMN     "materialId" INTEGER,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "spool" INTEGER NOT NULL,
ADD COLUMN     "supplierName" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "weightKgPackage" DOUBLE PRECISION,
ADD COLUMN     "weightKgSum" DOUBLE PRECISION,
ADD COLUMN     "weightPPackage" DOUBLE PRECISION,
ADD COLUMN     "weightPSum" DOUBLE PRECISION,
ADD COLUMN     "weightWithdrawn" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "withdrawId" TEXT NOT NULL,
ADD COLUMN     "yarnType" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "material_outsides" ADD CONSTRAINT "material_outsides_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
