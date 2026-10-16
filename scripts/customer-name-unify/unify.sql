-- Unify customer names that differ only by whitespace
--   e.g. "บริษัท เอ็มเคเคเท็กซ์ไทล์ จำกัด (สำนักงานใหญ่)" → "บริษัท เอ็ม เค เค เท็กซ์ไทล์ จำกัด (สำนักงานใหญ่)"
--
-- Dry-run (default, changes nothing):
--   psql -v ON_ERROR_STOP=1 -d ast_new < unify.sql
-- Apply:
--   psql -v ON_ERROR_STOP=1 -v apply=1 -d ast_new < unify.sql
--
-- Canonical name per whitespace-insensitive key:
--   1. the one active customers.name with that key, if exactly one exists
--   2. no customers row → the most used spelling (trimmed, inner spaces collapsed); tie → alphabetical
--   3. 2+ customers rows with that key → key is SKIPPED (duplicate customers, needs a human)
-- customers.name itself is never changed. Old values go to customer_name_unify_bak_20261016
-- (rollback.sql restores them). The backup table must not exist yet — a second apply aborts.

\set QUIET on
\pset footer off
BEGIN;

CREATE TEMP TABLE cu_src ON COMMIT DROP AS
          SELECT 'stockfabrics'::text AS tbl, 'customer'::text AS col, id::bigint AS row_id, customer AS v FROM stockfabrics
UNION ALL SELECT 'fabricouts', 'customerName', id, "customerName" FROM fabricouts
UNION ALL SELECT 'fabricouts', 'stockCustomer', id, "stockCustomer" FROM fabricouts
UNION ALL SELECT 'fabricoutdeposits', 'customerName', id, "customerName" FROM fabricoutdeposits
UNION ALL SELECT 'ast_purchaseorders', 'customerName', id, "customerName" FROM ast_purchaseorders
UNION ALL SELECT 'ast_bill_of_structures', 'customerName', id, "customerName" FROM ast_bill_of_structures;
DELETE FROM cu_src WHERE TRIM(COALESCE(v, '')) = '';
ALTER TABLE cu_src ADD COLUMN k text;
UPDATE cu_src SET k = REGEXP_REPLACE(v, '\s', '', 'g');

CREATE TEMP TABLE cu_master ON COMMIT DROP AS
SELECT REGEXP_REPLACE(name, '\s', '', 'g') AS k, MIN(name) AS name, COUNT(*) AS n
FROM customers WHERE deleted_at IS NULL AND TRIM(COALESCE(name, '')) <> ''
GROUP BY 1;

-- keys where rows (or rows vs the customers master) disagree on spelling
CREATE TEMP TABLE cu_keys ON COMMIT DROP AS
SELECT k FROM (
  SELECT k, v FROM cu_src
  UNION SELECT c.k, x.name FROM cu_master c JOIN customers x
    ON x.deleted_at IS NULL AND REGEXP_REPLACE(x.name, '\s', '', 'g') = c.k
) a
GROUP BY k HAVING COUNT(DISTINCT v) > 1;

CREATE TEMP TABLE cu_canon ON COMMIT DROP AS
SELECT key.k,
       CASE WHEN m.n = 1 THEN m.name
            WHEN m.n IS NULL THEN (
              SELECT TRIM(REGEXP_REPLACE(s.v, '\s+', ' ', 'g')) FROM cu_src s WHERE s.k = key.k
              GROUP BY 1 ORDER BY COUNT(*) DESC, 1 LIMIT 1)
       END AS canon,
       COALESCE(m.n, 0) AS master_n
FROM cu_keys key LEFT JOIN cu_master m ON m.k = key.k;

CREATE TEMP TABLE cu_plan ON COMMIT DROP AS
SELECT s.tbl, s.col, s.row_id, s.v AS old_value, c.canon AS new_value
FROM cu_src s JOIN cu_canon c ON c.k = s.k
WHERE c.canon IS NOT NULL AND s.v <> c.canon;

\echo
\echo '=== 1. Variant sets (canonical name ← every spelling found, rows) ==='
SELECT c.canon AS canonical,
       CASE WHEN c.master_n = 1 THEN 'customers' WHEN c.master_n = 0 THEN 'most used' ELSE 'SKIP: ' || c.master_n || ' customers rows' END AS source,
       (SELECT string_agg(format('[%s] %s', v, n), '  |  ' ORDER BY n DESC)
          FROM (SELECT v, COUNT(*) n FROM cu_src s WHERE s.k = c.k GROUP BY v) x) AS spellings
FROM cu_canon c ORDER BY 1;

\echo
\echo '=== 2. Rows to change per table/column ==='
SELECT tbl, col, COUNT(*) AS rows_to_change FROM cu_plan GROUP BY 1, 2 ORDER BY 1, 2;
SELECT COUNT(*) AS total_rows_to_change FROM cu_plan;

\if :{?apply}
  CREATE TABLE customer_name_unify_bak_20261016 AS
    SELECT *, now() AS applied_at FROM cu_plan;

  UPDATE stockfabrics t SET customer = p.new_value FROM cu_plan p
    WHERE p.tbl = 'stockfabrics' AND p.col = 'customer' AND t.id = p.row_id AND t.customer = p.old_value;
  UPDATE fabricouts t SET "customerName" = p.new_value FROM cu_plan p
    WHERE p.tbl = 'fabricouts' AND p.col = 'customerName' AND t.id = p.row_id AND t."customerName" = p.old_value;
  UPDATE fabricouts t SET "stockCustomer" = p.new_value FROM cu_plan p
    WHERE p.tbl = 'fabricouts' AND p.col = 'stockCustomer' AND t.id = p.row_id AND t."stockCustomer" = p.old_value;
  UPDATE fabricoutdeposits t SET "customerName" = p.new_value FROM cu_plan p
    WHERE p.tbl = 'fabricoutdeposits' AND p.col = 'customerName' AND t.id = p.row_id AND t."customerName" = p.old_value;
  UPDATE ast_purchaseorders t SET "customerName" = p.new_value FROM cu_plan p
    WHERE p.tbl = 'ast_purchaseorders' AND p.col = 'customerName' AND t.id = p.row_id AND t."customerName" = p.old_value;
  UPDATE ast_bill_of_structures t SET "customerName" = p.new_value FROM cu_plan p
    WHERE p.tbl = 'ast_bill_of_structures' AND p.col = 'customerName' AND t.id = p.row_id AND t."customerName" = p.old_value;

  \echo
  \echo '=== 3. After apply: spellings left that differ only by whitespace (must be SKIP keys only) ==='
  SELECT REGEXP_REPLACE(v, '\s', '', 'g') AS k, COUNT(DISTINCT v) AS spellings FROM (
              SELECT customer v FROM stockfabrics
    UNION ALL SELECT "customerName" FROM fabricouts
    UNION ALL SELECT "stockCustomer" FROM fabricouts
    UNION ALL SELECT "customerName" FROM fabricoutdeposits
    UNION ALL SELECT "customerName" FROM ast_purchaseorders
    UNION ALL SELECT "customerName" FROM ast_bill_of_structures
  ) a WHERE TRIM(COALESCE(v, '')) <> '' GROUP BY 1 HAVING COUNT(DISTINCT v) > 1;
  SELECT COUNT(*) AS backup_rows FROM customer_name_unify_bak_20261016;
  COMMIT;
  \echo 'APPLIED'
\else
  ROLLBACK;
  \echo 'DRY-RUN only — nothing changed (add -v apply=1 to apply)'
\endif
