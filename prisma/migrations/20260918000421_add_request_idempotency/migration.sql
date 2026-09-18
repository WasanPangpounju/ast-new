-- CreateTable
CREATE TABLE "fabric_returns" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "fabricCode" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'หลา',
    "returnQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedQty" DOUBLE PRECISION,
    "totalReturned" DOUBLE PRECISION,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabric_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_idempotency" (
    "id" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fabric_returns_supplierId_idx" ON "fabric_returns"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "request_idempotency_requestId_key" ON "request_idempotency"("requestId");

-- AddForeignKey
ALTER TABLE "fabric_returns" ADD CONSTRAINT "fabric_returns_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
