-- AlterTable: add packaging sub-type tags to material_outsides, mirroring materials (see 20260725100229)
ALTER TABLE "material_outsides" ADD COLUMN     "palletType" TEXT,
ADD COLUMN     "sackType" TEXT,
ADD COLUMN     "spoolType" TEXT;
