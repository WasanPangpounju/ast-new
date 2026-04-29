-- AlterTable
ALTER TABLE "fabricouts" ADD COLUMN     "altFabricStruct" TEXT,
ADD COLUMN     "altPurchaseOrder" TEXT,
ADD COLUMN     "isDeposit" BOOLEAN NOT NULL DEFAULT false;
