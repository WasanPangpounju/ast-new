-- AlterTable
ALTER TABLE "ast_purchaseorders" ADD COLUMN     "machine_number" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "production_note" TEXT,
ADD COLUMN     "surcharge" TEXT;

-- AlterTable
ALTER TABLE "fabric_asts" ADD COLUMN     "stack_type" TEXT;

-- AlterTable
ALTER TABLE "fabric_aststructures" ADD COLUMN     "sub_name_h1" TEXT,
ADD COLUMN     "sub_name_h2" TEXT,
ADD COLUMN     "sub_name_w1" TEXT,
ADD COLUMN     "sub_name_w2" TEXT,
ADD COLUMN     "sub_name_w3" TEXT,
ADD COLUMN     "sub_name_w4" TEXT,
ADD COLUMN     "weft_ratio2" TEXT,
ADD COLUMN     "yarn_h_type2" TEXT,
ADD COLUMN     "yarn_w_count3" TEXT,
ADD COLUMN     "yarn_w_count4" TEXT,
ADD COLUMN     "yarn_w_ratio3" TEXT,
ADD COLUMN     "yarn_w_ratio4" TEXT,
ADD COLUMN     "yarn_w_type2" TEXT,
ADD COLUMN     "yarn_w_type3" TEXT,
ADD COLUMN     "yarn_w_type4" TEXT;

-- AlterTable
ALTER TABLE "orderdeadlines" ADD COLUMN     "pct" DOUBLE PRECISION,
ADD COLUMN     "qty" DOUBLE PRECISION,
ADD COLUMN     "unit" TEXT;
