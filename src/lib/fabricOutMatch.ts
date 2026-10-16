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

// Customer grouping key: ignore ALL whitespace, so the same company keyed as
// "เอ็ม เค เค เท็กซ์ไทล์" and "เอ็มเคเคเท็กซ์ไทล์" lands in one stock group.
// Key only — never display it.
export const CK = (expr: string) => `REGEXP_REPLACE(${expr}, '\\s', '', 'g')`

export const NORM_OUTS_CTE = `
  norm_outs AS (
    SELECT
      ${NS(EFF_STRUCT)}   AS n_struct,
      ${NW(EFF_WIDTH)}    AS n_width,
      ${NP(EFF_PATTERN)}  AS n_pattern,
      ${CK(EFF_CUSTOMER)} AS n_customer,
      COUNT(*)::int         AS out_fold,
      SUM("sumYard")::float AS out_yard
    FROM fabricouts
    WHERE deleted_at IS NULL
    GROUP BY 1, 2, 3, 4
  )`

// Stock customer for display: trimmed, empty → AST (same as EFF_CUSTOMER on the fabricouts side).
export const NC = (col: string) => `COALESCE(NULLIF(TRIM(${col}), ''), 'AST')`

// One stock group = customer + struct + width + pattern, normalized exactly like the
// "ใช้ไป" match above (fabricCode is NOT part of the key). Grouping stockfabrics by raw
// values instead split one fabric into several rows that each got the full "ใช้ไป".
export const STOCK_GROUP_KEY = (alias = 's') => [
  CK(NC(`${alias}."customer"`)),
  NS(`${alias}."fabricStruct"`),
  NW(`${alias}."fabricW"`),
  NP(`${alias}."fabricPattern"`),
]

// WHERE fragment selecting every stockfabrics row of the group a displayed row belongs to.
export const stockGroupWhere = (
  g: { customer: string; fabricStruct: string; fabricPattern: string; fabricW: string },
  alias = 's',
) => {
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`
  const [kc, ks, kw, kp] = STOCK_GROUP_KEY(alias)
  return `${kc} = ${CK(NC(lit(g.customer)))}
    AND ${ks} = ${NS(lit(g.fabricStruct))}
    AND ${kw} = ${NW(lit(g.fabricW))}
    AND ${kp} = ${NP(lit(g.fabricPattern))}`
}
