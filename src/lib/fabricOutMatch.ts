// Shared SQL fragments for matching fabricouts rows to a stockfabrics fabric group.
// Used by both the stock summary ("ใช้ไป") and stock detail ("เปิดบิลผ้า") queries —
// keep them identical or the two views will disagree on the same fabric group.

// Normalize fabric structure: trim whitespace, collapse spaces,
// then unify *, x, / separators → /
export const NS = (col: string) =>
  `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(${col}, '')), '\\s+', ' ', 'g'), '\\s*\\*\\s*', '/', 'g'), '\\s+[xX]\\s+', '/', 'g'), '\\s*/\\s*', '/', 'g'))`

// Normalize fabric width: digits only from first segment
export const NW = (col: string) =>
  `COALESCE(REGEXP_REPLACE(SPLIT_PART(TRIM(COALESCE(${col}, '')), '/', 1), '[^0-9.]', '', 'g'), '')`

// Normalize fabric pattern: trim and collapse spaces
export const NP = (col: string) =>
  `COALESCE(TRIM(REGEXP_REPLACE(COALESCE(${col}, ''), '\\s+', ' ', 'g')), '')`

// Use stock* override fields (from old system) when set, otherwise fall back to direct fields.
// This mirrors the old Laravel logic: stockFabricW overrides fabricW, etc.
export const EFF_STRUCT  = `CASE WHEN "stockFabricStruct"  IS NULL OR "stockFabricStruct"  = '' THEN "fabricStruct"  ELSE "stockFabricStruct"  END`
export const EFF_WIDTH   = `CASE WHEN "stockFabricW"       IS NULL OR "stockFabricW"       = '' THEN "fabricW"       ELSE "stockFabricW"       END`
export const EFF_PATTERN = `CASE WHEN "stockFabricPattern" IS NULL OR "stockFabricPattern" = '' THEN "fabricPattern" ELSE "stockFabricPattern" END`
export const EFF_CUSTOMER = `COALESCE(NULLIF(TRIM(CASE WHEN "stockCustomer" IS NULL OR "stockCustomer" = '' THEN "customerName" ELSE "stockCustomer" END), ''), 'AST')`

export const NORM_OUTS_CTE = `
  norm_outs AS (
    SELECT
      ${NS(EFF_STRUCT)}   AS n_struct,
      ${NW(EFF_WIDTH)}    AS n_width,
      ${NP(EFF_PATTERN)}  AS n_pattern,
      ${EFF_CUSTOMER}     AS n_customer,
      COUNT(*)::int         AS out_fold,
      SUM("sumYard")::float AS out_yard
    FROM fabricouts
    WHERE deleted_at IS NULL
    GROUP BY 1, 2, 3, 4
  )`
