-- Reconciliation migration: records DB changes that were already applied
-- directly to the live database (outside the migration system, before this
-- migration existed) so migration history matches reality. This file is
-- marked resolved via `prisma migrate resolve --applied`, not executed —
-- every statement below already exists in the live DB (verified via
-- `prisma db pull --print` on 2026-09-18).
--
-- Deliberately EXCLUDES `fabric_returns` and `request_idempotency`, which
-- `prisma migrate diff` also flagged as missing but which do NOT exist in the
-- live DB yet (fabric_returns is a separate known pre-existing gap; unrelated
-- to this task. request_idempotency is created for real by the next migration,
-- 20260918_add_request_idempotency, which actually runs its CREATE TABLE).

-- AlterTable
ALTER TABLE "fabricouts" ADD COLUMN     "stockCustomer" TEXT,
ADD COLUMN     "stockFabricPattern" TEXT,
ADD COLUMN     "stockFabricStruct" TEXT,
ADD COLUMN     "stockFabricW" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "menuKey" TEXT NOT NULL,
    "canAccess" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_menuKey_key" ON "user_permissions"("userId", "menuKey");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
