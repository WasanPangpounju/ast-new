-- AlterTable: commission Float -> String, preserving existing values via cast
ALTER TABLE "ast_purchaseorders" ALTER COLUMN "commission" TYPE TEXT USING "commission"::text;
ALTER TABLE "ast_bill_of_structures" ALTER COLUMN "commission" TYPE TEXT USING "commission"::text;
