/*
  Warnings:

  - You are about to drop the column `box` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `emp` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `pallet` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `supplierId` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `weightNet` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `weightTotal` on the `materials` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `materials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weightKgNet` to the `materials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weightKgPackage` to the `materials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weightKgSum` to the `materials` table without a default value. This is not possible if the table is not empty.
  - Made the column `supplierName` on table `materials` required. This step will fail if there are existing NULL values in that column.
  - Made the column `yarnType` on table `materials` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lot` on table `materials` required. This step will fail if there are existing NULL values in that column.
  - Made the column `spool` on table `materials` required. This step will fail if there are existing NULL values in that column.
  - Made the column `importStatus` on table `materials` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "materials" DROP CONSTRAINT "materials_supplierId_fkey";

-- DropIndex
DROP INDEX "materials_supplierId_idx";

-- AlterTable
ALTER TABLE "materials" DROP COLUMN "box",
DROP COLUMN "created_at",
DROP COLUMN "emp",
DROP COLUMN "pallet",
DROP COLUMN "supplierId",
DROP COLUMN "updated_at",
DROP COLUMN "weightNet",
DROP COLUMN "weightTotal",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "weightKgNet" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "weightKgPackage" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "weightKgSum" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "supplierName" SET NOT NULL,
ALTER COLUMN "yarnType" SET NOT NULL,
ALTER COLUMN "lot" SET NOT NULL,
ALTER COLUMN "spool" SET NOT NULL,
ALTER COLUMN "importStatus" SET NOT NULL,
ALTER COLUMN "importStatus" SET DEFAULT 'pending';

-- CreateTable
CREATE TABLE "materialrequisitions" (
    "id" SERIAL NOT NULL,
    "withdrawId" TEXT NOT NULL,
    "materialId" INTEGER NOT NULL,
    "department" TEXT NOT NULL,
    "spool" INTEGER NOT NULL,
    "weightWithdrawn" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "materialrequisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materialcoordinators" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "tel" TEXT,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "materialcoordinators_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "materialrequisitions" ADD CONSTRAINT "materialrequisitions_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
