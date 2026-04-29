-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "empID" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ssn" TEXT,
    "tel" TEXT,
    "gender" TEXT,
    "birthdate" TEXT,
    "department" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "tax" TEXT,
    "address" TEXT,
    "tel" TEXT,
    "email" TEXT,
    "type" TEXT,
    "coor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "tax" TEXT,
    "address" TEXT,
    "tel" TEXT,
    "email" TEXT,
    "type" TEXT,
    "coor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stuffs" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stuffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ast_purchaseorders" (
    "id" SERIAL NOT NULL,
    "vat" TEXT NOT NULL,
    "purchaseOrder" TEXT NOT NULL,
    "po" TEXT,
    "emp" TEXT,
    "customerName" TEXT,
    "fabricId" TEXT,
    "fabricPattern" TEXT,
    "fabricStructure" TEXT,
    "orderSumYard" DOUBLE PRECISION,
    "status" TEXT,
    "deadline" TEXT,
    "payment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ast_purchaseorders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orderdeadlines" (
    "id" SERIAL NOT NULL,
    "purchaseOrder" TEXT NOT NULL,
    "dt" TIMESTAMP(3),
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orderdeadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordershippeds" (
    "id" SERIAL NOT NULL,
    "purchaseOrder" TEXT NOT NULL,
    "emp" TEXT,
    "shippedDate" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordershippeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabric_asts" (
    "id" SERIAL NOT NULL,
    "purchaseOrder" TEXT NOT NULL,
    "vat" TEXT,
    "yarn_h_count" TEXT,
    "fabric_w" TEXT,
    "phewNumber" TEXT,
    "phewW" TEXT,
    "payment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabric_asts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabric_aststructures" (
    "id" SERIAL NOT NULL,
    "purchaseOrder" TEXT NOT NULL,
    "yarnHType" TEXT,
    "yarnWType" TEXT,
    "yarnWRatio2" TEXT,
    "yarnHRatio1" TEXT,
    "yarnHRatio2" TEXT,
    "yarnWRatio1" TEXT,
    "yarnHCount1" TEXT,
    "yarnHCount2" TEXT,
    "yarnWCount1" TEXT,
    "yarnWCount2" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabric_aststructures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabricouts" (
    "id" SERIAL NOT NULL,
    "refId" TEXT NOT NULL,
    "no" TEXT,
    "vatType" TEXT NOT NULL,
    "vatNo" INTEGER NOT NULL,
    "fold" INTEGER NOT NULL,
    "sumYard" DOUBLE PRECISION NOT NULL,
    "fabricStruct" TEXT,
    "fabricPattern" TEXT,
    "fabricW" TEXT,
    "customerName" TEXT,
    "receiveName" TEXT,
    "orderId" INTEGER,
    "createDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fabricouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stockfabrics" (
    "id" SERIAL NOT NULL,
    "refId" TEXT NOT NULL,
    "emp" TEXT,
    "fabricStruct" TEXT,
    "fabricPattern" TEXT,
    "fabricW" TEXT,
    "fold" INTEGER,
    "sumYard" DOUBLE PRECISION,
    "customer" TEXT,
    "createDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stockfabrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabricimports" (
    "id" SERIAL NOT NULL,
    "refId" TEXT NOT NULL,
    "emp" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabricimports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabricdeposits" (
    "id" SERIAL NOT NULL,
    "refId" TEXT NOT NULL,
    "emp" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabricdeposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabricoutdeposits" (
    "id" SERIAL NOT NULL,
    "refId" TEXT NOT NULL,
    "emp" TEXT,
    "customerName" TEXT,
    "fabricStruct" TEXT,
    "fabricW" TEXT,
    "fold" INTEGER,
    "sumYard" DOUBLE PRECISION,
    "receiveType" TEXT,
    "vatType" TEXT,
    "createDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabricoutdeposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" SERIAL NOT NULL,
    "refId" TEXT NOT NULL,
    "emp" TEXT,
    "inventoryName" TEXT,
    "orderId" INTEGER,
    "fabricStruct" TEXT,
    "fold" INTEGER,
    "sumYard" DOUBLE PRECISION,
    "sumM" DOUBLE PRECISION,
    "fabricW" TEXT,
    "createDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productions" (
    "id" SERIAL NOT NULL,
    "purchaseOrder" TEXT NOT NULL,
    "machineNumber" TEXT,
    "no" TEXT,
    "fabricStruct" TEXT,
    "fabricPattern" TEXT,
    "fabricW" TEXT,
    "yarnHType" TEXT,
    "yarnWType" TEXT,
    "pricing" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "supplierName" TEXT,
    "emp" TEXT,
    "yarnType" TEXT,
    "lot" TEXT,
    "pallet" INTEGER,
    "box" INTEGER,
    "spool" INTEGER,
    "weightTotal" DOUBLE PRECISION,
    "weightNet" DOUBLE PRECISION,
    "importStatus" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materialstocks" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materialstocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materialstores" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materialstores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_outsides" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_outsides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "supplierName" TEXT,
    "emp" TEXT,
    "spool" INTEGER,
    "sack" INTEGER,
    "box" INTEGER,
    "pallet" INTEGER,
    "packageStatus" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "htrpackages" (
    "id" SERIAL NOT NULL,
    "supplierName" TEXT,
    "emp" TEXT,
    "spool" INTEGER,
    "sack" INTEGER,
    "box" INTEGER,
    "pallet" INTEGER,
    "createDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "htrpackages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packageasts" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packageasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchaseorders" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchaseorders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_empID_key" ON "employees"("empID");

-- CreateIndex
CREATE UNIQUE INDEX "ast_purchaseorders_purchaseOrder_key" ON "ast_purchaseorders"("purchaseOrder");

-- CreateIndex
CREATE INDEX "ast_purchaseorders_vat_idx" ON "ast_purchaseorders"("vat");

-- CreateIndex
CREATE INDEX "ast_purchaseorders_customerName_idx" ON "ast_purchaseorders"("customerName");

-- CreateIndex
CREATE INDEX "ast_purchaseorders_fabricPattern_idx" ON "ast_purchaseorders"("fabricPattern");

-- CreateIndex
CREATE INDEX "orderdeadlines_purchaseOrder_idx" ON "orderdeadlines"("purchaseOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ordershippeds_purchaseOrder_key" ON "ordershippeds"("purchaseOrder");

-- CreateIndex
CREATE UNIQUE INDEX "fabric_asts_purchaseOrder_key" ON "fabric_asts"("purchaseOrder");

-- CreateIndex
CREATE INDEX "fabric_asts_purchaseOrder_idx" ON "fabric_asts"("purchaseOrder");

-- CreateIndex
CREATE UNIQUE INDEX "fabric_aststructures_purchaseOrder_key" ON "fabric_aststructures"("purchaseOrder");

-- CreateIndex
CREATE INDEX "fabric_aststructures_purchaseOrder_idx" ON "fabric_aststructures"("purchaseOrder");

-- CreateIndex
CREATE INDEX "fabric_aststructures_yarnWRatio2_idx" ON "fabric_aststructures"("yarnWRatio2");

-- CreateIndex
CREATE INDEX "fabricouts_refId_idx" ON "fabricouts"("refId");

-- CreateIndex
CREATE INDEX "fabricouts_vatType_vatNo_idx" ON "fabricouts"("vatType", "vatNo");

-- CreateIndex
CREATE INDEX "fabricouts_orderId_idx" ON "fabricouts"("orderId");

-- CreateIndex
CREATE INDEX "fabricouts_customerName_idx" ON "fabricouts"("customerName");

-- CreateIndex
CREATE INDEX "stockfabrics_refId_idx" ON "stockfabrics"("refId");

-- CreateIndex
CREATE INDEX "stockfabrics_fabricPattern_idx" ON "stockfabrics"("fabricPattern");

-- CreateIndex
CREATE INDEX "fabricimports_refId_idx" ON "fabricimports"("refId");

-- CreateIndex
CREATE INDEX "fabricdeposits_refId_idx" ON "fabricdeposits"("refId");

-- CreateIndex
CREATE INDEX "fabricoutdeposits_refId_idx" ON "fabricoutdeposits"("refId");

-- CreateIndex
CREATE INDEX "inventories_refId_idx" ON "inventories"("refId");

-- CreateIndex
CREATE INDEX "inventories_orderId_idx" ON "inventories"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "productions_purchaseOrder_key" ON "productions"("purchaseOrder");

-- CreateIndex
CREATE INDEX "productions_purchaseOrder_idx" ON "productions"("purchaseOrder");

-- CreateIndex
CREATE INDEX "materials_supplierId_idx" ON "materials"("supplierId");

-- CreateIndex
CREATE INDEX "packages_supplierId_idx" ON "packages"("supplierId");

-- AddForeignKey
ALTER TABLE "orderdeadlines" ADD CONSTRAINT "orderdeadlines_purchaseOrder_fkey" FOREIGN KEY ("purchaseOrder") REFERENCES "ast_purchaseorders"("purchaseOrder") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordershippeds" ADD CONSTRAINT "ordershippeds_purchaseOrder_fkey" FOREIGN KEY ("purchaseOrder") REFERENCES "ast_purchaseorders"("purchaseOrder") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabric_asts" ADD CONSTRAINT "fabric_asts_purchaseOrder_fkey" FOREIGN KEY ("purchaseOrder") REFERENCES "ast_purchaseorders"("purchaseOrder") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabric_aststructures" ADD CONSTRAINT "fabric_aststructures_purchaseOrder_fkey" FOREIGN KEY ("purchaseOrder") REFERENCES "ast_purchaseorders"("purchaseOrder") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabricouts" ADD CONSTRAINT "fabricouts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ast_purchaseorders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ast_purchaseorders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productions" ADD CONSTRAINT "productions_purchaseOrder_fkey" FOREIGN KEY ("purchaseOrder") REFERENCES "ast_purchaseorders"("purchaseOrder") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
