-- AlterTable: add packaging sub-type tags and return-packaging flags to materials, mirroring material_outsides
ALTER TABLE "materials" ADD COLUMN     "palletType" TEXT,
ADD COLUMN     "sackType" TEXT,
ADD COLUMN     "spoolType" TEXT,
ADD COLUMN     "returnPallet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnBox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnSack" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnSpool" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnPaperBar" BOOLEAN NOT NULL DEFAULT false;
