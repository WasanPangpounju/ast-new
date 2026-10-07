-- AlterTable
ALTER TABLE "package_return_entries" ADD COLUMN     "receiptId" INTEGER;

-- CreateTable
CREATE TABLE "package_return_receipts" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "emp" TEXT,
    "note" TEXT,
    "palletWood" INTEGER NOT NULL DEFAULT 0,
    "palletSteel" INTEGER NOT NULL DEFAULT 0,
    "box" INTEGER NOT NULL DEFAULT 0,
    "sackPlastic" INTEGER NOT NULL DEFAULT 0,
    "sackJute" INTEGER NOT NULL DEFAULT 0,
    "paperBar" INTEGER NOT NULL DEFAULT 0,
    "spoolPaper" INTEGER NOT NULL DEFAULT 0,
    "spoolPlastic" INTEGER NOT NULL DEFAULT 0,
    "spoolCPaper" INTEGER NOT NULL DEFAULT 0,
    "spoolCPlastic" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "package_return_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "package_return_receipts_supplierId_returnDate_idx" ON "package_return_receipts"("supplierId", "returnDate");

-- CreateIndex
CREATE INDEX "package_return_entries_receiptId_idx" ON "package_return_entries"("receiptId");

-- AddForeignKey
ALTER TABLE "package_return_entries" ADD CONSTRAINT "package_return_entries_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "package_return_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_return_receipts" ADD CONSTRAINT "package_return_receipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
