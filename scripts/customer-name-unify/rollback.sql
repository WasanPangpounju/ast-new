-- Undo unify.sql: put every changed customer name back from customer_name_unify_bak_20261016.
-- Only rows still holding the unified value are restored (a later manual edit is left alone).
--   psql -v ON_ERROR_STOP=1 -d ast_new < rollback.sql
\set QUIET on
\pset footer off
BEGIN;

UPDATE stockfabrics t SET customer = b.old_value FROM customer_name_unify_bak_20261016 b
  WHERE b.tbl = 'stockfabrics' AND b.col = 'customer' AND t.id = b.row_id AND t.customer = b.new_value;
UPDATE fabricouts t SET "customerName" = b.old_value FROM customer_name_unify_bak_20261016 b
  WHERE b.tbl = 'fabricouts' AND b.col = 'customerName' AND t.id = b.row_id AND t."customerName" = b.new_value;
UPDATE fabricouts t SET "stockCustomer" = b.old_value FROM customer_name_unify_bak_20261016 b
  WHERE b.tbl = 'fabricouts' AND b.col = 'stockCustomer' AND t.id = b.row_id AND t."stockCustomer" = b.new_value;
UPDATE fabricoutdeposits t SET "customerName" = b.old_value FROM customer_name_unify_bak_20261016 b
  WHERE b.tbl = 'fabricoutdeposits' AND b.col = 'customerName' AND t.id = b.row_id AND t."customerName" = b.new_value;
UPDATE ast_purchaseorders t SET "customerName" = b.old_value FROM customer_name_unify_bak_20261016 b
  WHERE b.tbl = 'ast_purchaseorders' AND b.col = 'customerName' AND t.id = b.row_id AND t."customerName" = b.new_value;
UPDATE ast_bill_of_structures t SET "customerName" = b.old_value FROM customer_name_unify_bak_20261016 b
  WHERE b.tbl = 'ast_bill_of_structures' AND b.col = 'customerName' AND t.id = b.row_id AND t."customerName" = b.new_value;

\echo '=== backup rows whose current value is not the old value (must be 0) ==='
WITH cur AS (
            SELECT 'stockfabrics'::text AS tbl, 'customer'::text AS col, id::bigint AS row_id, customer AS v FROM stockfabrics
  UNION ALL SELECT 'fabricouts', 'customerName', id, "customerName" FROM fabricouts
  UNION ALL SELECT 'fabricouts', 'stockCustomer', id, "stockCustomer" FROM fabricouts
  UNION ALL SELECT 'fabricoutdeposits', 'customerName', id, "customerName" FROM fabricoutdeposits
  UNION ALL SELECT 'ast_purchaseorders', 'customerName', id, "customerName" FROM ast_purchaseorders
  UNION ALL SELECT 'ast_bill_of_structures', 'customerName', id, "customerName" FROM ast_bill_of_structures
)
SELECT COUNT(*) AS not_restored FROM customer_name_unify_bak_20261016 b
JOIN cur c USING (tbl, col, row_id) WHERE c.v IS DISTINCT FROM b.old_value;

DROP TABLE customer_name_unify_bak_20261016;
COMMIT;
\echo 'ROLLED BACK'
