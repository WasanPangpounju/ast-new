-- CreateTable
CREATE TABLE "material_returns" (
    "id" SERIAL NOT NULL,
    "returnId" TEXT NOT NULL,
    "lot" TEXT,
    "yarnType" TEXT NOT NULL,
    "supplierName" TEXT,
    "spool" INTEGER NOT NULL,
    "weightReturn" DOUBLE PRECISION NOT NULL,
    "materialId" INTEGER,
    "note" TEXT,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "material_returns_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
