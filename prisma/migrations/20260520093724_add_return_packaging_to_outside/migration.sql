-- AlterTable
ALTER TABLE "material_outsides" ADD COLUMN     "paymentComment" TEXT,
ADD COLUMN     "recipient" TEXT,
ADD COLUMN     "returnBox" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnPallet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnPaperBar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnSack" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnSpool" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usageNote" TEXT;
