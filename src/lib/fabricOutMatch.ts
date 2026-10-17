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
      -- bills cut from a user-made pile count toward that pile only (PILE_OUTS_CTE)
      AND stock_pile_id IS NULL
    GROUP BY 1, 2, 3, 4
  )`

// "ใช้ไป" of user-made piles (stock_piles): bills linked by stock_pile_id.
export const PILE_OUTS_CTE = `
  pile_outs AS (
    SELECT
      stock_pile_id         AS pile_id,
      COUNT(*)::int         AS out_fold,
      SUM("sumYard")::float AS out_yard
    FROM fabricouts
    WHERE deleted_at IS NULL AND stock_pile_id IS NOT NULL
    GROUP BY 1
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

// ─── กองผ้า (stock piles) ──────────────────────────────────────────────────
// A displayed stock row is either กองหลัก (pileId null — the 4-field group above,
// excluding rows moved into a user-made pile) or one user-made pile (by id only).

export type StockGroupRef = { customer: string; fabricStruct: string; fabricPattern: string; fabricW: string }

// WHERE fragment for the stockfabrics rows of one displayed stock row.
export const stockRowsWhere = (g: StockGroupRef, pileId: number | null, alias = 's') =>
  pileId != null
    ? `${alias}.stock_pile_id = ${Number(pileId)}`
    : `${alias}.stock_pile_id IS NULL AND ${stockGroupWhere(g, alias)}`

// WHERE fragment for the fabricouts rows ("ใช้ไป") of one displayed stock row —
// the same match the summary uses (NORM_OUTS_CTE / PILE_OUTS_CTE).
export const pileOutsWhere = (g: StockGroupRef, pileId: number | null) => {
  if (pileId != null) return `stock_pile_id = ${Number(pileId)}`
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`
  return `stock_pile_id IS NULL
    AND ${NS(EFF_STRUCT)}   = ${NS(lit(g.fabricStruct))}
    AND ${NW(EFF_WIDTH)}    = ${NW(lit(g.fabricW))}
    AND ${NP(EFF_PATTERN)}  = ${NP(lit(g.fabricPattern))}
    AND ${NP(lit(g.fabricPattern))} <> ''
    AND ${CK(EFF_CUSTOMER)} = ${CK(NC(lit(g.customer)))}`
}

// Same struct + pattern + width (normalized), ignoring customer — the rule for which
// stock rows a lot may be moved between (ย้ายกอง, cross-customer allowed).
export const sameFabric = (a: Omit<StockGroupRef, 'customer'>, alias = 's') => {
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`
  return `${NS(`${alias}."fabricStruct"`)} = ${NS(lit(a.fabricStruct))}
    AND ${NW(`${alias}."fabricW"`)} = ${NW(lit(a.fabricW))}
    AND ${NP(`${alias}."fabricPattern"`)} = ${NP(lit(a.fabricPattern))}`
}
