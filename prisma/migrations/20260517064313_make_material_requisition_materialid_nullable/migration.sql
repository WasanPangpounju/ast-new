-- DropForeignKey
ALTER TABLE "materialrequisitions" DROP CONSTRAINT "materialrequisitions_materialId_fkey";

-- AlterTable
ALTER TABLE "materialrequisitions" ALTER COLUMN "materialId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "materialrequisitions" ADD CONSTRAINT "materialrequisitions_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
