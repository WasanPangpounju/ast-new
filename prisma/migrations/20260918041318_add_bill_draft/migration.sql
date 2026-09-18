-- CreateTable
CREATE TABLE "bill_drafts" (
    "id" SERIAL NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" INTEGER,
    "updated_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_drafts_pkey" PRIMARY KEY ("id")
);
