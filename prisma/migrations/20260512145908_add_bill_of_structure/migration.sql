-- CreateTable
CREATE TABLE "ast_bill_of_structures" (
    "id" SERIAL NOT NULL,
    "purchaseOrder" TEXT NOT NULL,
    "sourceOrderId" INTEGER NOT NULL,
    "vat" TEXT,
    "customerName" TEXT,
    "emp" TEXT,
    "fabricId" TEXT,
    "fabricPattern" TEXT,
    "fabricStructure" TEXT,
    "yarnHCount" TEXT,
    "fabricW" TEXT,
    "phewNumber" TEXT,
    "phewW" TEXT,
    "stackType" TEXT,
    "warpYarn1" TEXT,
    "warpComp1" TEXT,
    "warpCount1" TEXT,
    "warpRatio1" TEXT,
    "warpYarn2" TEXT,
    "warpComp2" TEXT,
    "warpCount2" TEXT,
    "warpRatio2" TEXT,
    "weftYarn1" TEXT,
    "weftComp1" TEXT,
    "weftCount1" TEXT,
    "weftRatio1" TEXT,
    "weftYarn2" TEXT,
    "weftComp2" TEXT,
    "weftCount2" TEXT,
    "weftRatio2" TEXT,
    "weftYarn3" TEXT,
    "weftComp3" TEXT,
    "weftCount3" TEXT,
    "weftRatio3" TEXT,
    "weftYarn4" TEXT,
    "weftComp4" TEXT,
    "weftCount4" TEXT,
    "weftRatio4" TEXT,
    "orderSumYard" DOUBLE PRECISION,
    "fabricSPY" DOUBLE PRECISION,
    "price_yard" DOUBLE PRECISION,
    "price_m" DOUBLE PRECISION,
    "discount_p" DOUBLE PRECISION,
    "machine_number" TEXT,
    "surcharge" TEXT,
    "commission" DOUBLE PRECISION,
    "po" TEXT,
    "note" TEXT,
    "production_note" TEXT,
    "payment" TEXT,
    "create_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ast_bill_of_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bos_deadlines" (
    "id" SERIAL NOT NULL,
    "bosId" INTEGER NOT NULL,
    "dt" TIMESTAMP(3),
    "label" TEXT,
    "qty" DOUBLE PRECISION,
    "unit" TEXT,
    "pct" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bos_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ast_bill_of_structures_purchaseOrder_key" ON "ast_bill_of_structures"("purchaseOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ast_bill_of_structures_sourceOrderId_key" ON "ast_bill_of_structures"("sourceOrderId");

-- CreateIndex
CREATE INDEX "ast_bill_of_structures_purchaseOrder_idx" ON "ast_bill_of_structures"("purchaseOrder");

-- CreateIndex
CREATE INDEX "ast_bill_of_structures_sourceOrderId_idx" ON "ast_bill_of_structures"("sourceOrderId");

-- CreateIndex
CREATE INDEX "bos_deadlines_bosId_idx" ON "bos_deadlines"("bosId");

-- AddForeignKey
ALTER TABLE "ast_bill_of_structures" ADD CONSTRAINT "ast_bill_of_structures_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "ast_purchaseorders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bos_deadlines" ADD CONSTRAINT "bos_deadlines_bosId_fkey" FOREIGN KEY ("bosId") REFERENCES "ast_bill_of_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
