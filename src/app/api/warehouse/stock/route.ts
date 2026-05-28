import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// Normalize fabric structure: trim whitespace, collapse spaces,
// then unify *, x, / separators → /
const NS = (col: string) =>
  `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(${col}, '')), '\\s+', ' ', 'g'), '\\s*\\*\\s*', '/', 'g'), '\\s+[xX]\\s+', '/', 'g'), '\\s*/\\s*', '/', 'g'))`

// Normalize fabric width: digits only from first segment
const NW = (col: string) =>
  `COALESCE(REGEXP_REPLACE(SPLIT_PART(TRIM(COALESCE(${col}, '')), '/', 1), '[^0-9.]', '', 'g'), '')`

// Normalize fabric pattern: trim and collapse spaces
const NP = (col: string) =>
  `COALESCE(TRIM(REGEXP_REPLACE(COALESCE(${col}, ''), '\\s+', ' ', 'g')), '')`

// Use stock* override fields (from old system) when set, otherwise fall back to direct fields.
// This mirrors the old Laravel logic: stockFabricW overrides fabricW, etc.
const EFF_STRUCT  = `CASE WHEN "stockFabricStruct"  IS NULL OR "stockFabricStruct"  = '' THEN "fabricStruct"  ELSE "stockFabricStruct"  END`
const EFF_WIDTH   = `CASE WHEN "stockFabricW"       IS NULL OR "stockFabricW"       = '' THEN "fabricW"       ELSE "stockFabricW"       END`
const EFF_PATTERN = `CASE WHEN "stockFabricPattern" IS NULL OR "stockFabricPattern" = '' THEN "fabricPattern" ELSE "stockFabricPattern" END`
const EFF_CUSTOMER = `COALESCE(NULLIF(TRIM(CASE WHEN "stockCustomer" IS NULL OR "stockCustomer" = '' THEN "customerName" ELSE "stockCustomer" END), ''), 'AST')`

const NORM_OUTS_CTE = `
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

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit  = 20
    const offset = (page - 1) * limit
    const q        = searchParams.get('q')        ?? ''
    const searchBy = searchParams.get('searchBy') ?? 'fabricCode'
    const customer = searchParams.get('customer') ?? ''
    const stockType = searchParams.get('stockType') ?? 'all'

    const searchFieldMap: Record<string, string> = {
      fabricCode:    '"fabricCode"',
      fabricStruct:  '"fabricStruct"',
      fabricPattern: '"fabricPattern"',
      fabricW:       '"fabricW"',
    }
    const searchField = searchFieldMap[searchBy] ?? '"fabricCode"'

    const conditions: string[] = ['s.deleted_at IS NULL']
    if (stockType === 'produced')  conditions.push('s.is_purchased = false')
    if (stockType === 'purchased') conditions.push('s.is_purchased = true')
    if (q)        conditions.push(`s.${searchField} ILIKE '%${q.replace(/'/g, "''")}%'`)
    if (customer) conditions.push(`COALESCE(s."customer", 'AST') ILIKE '%${customer.replace(/'/g, "''")}%'`)
    const whereClause = conditions.join(' AND ')

    const [stocks, totalRaw] = await Promise.all([
      prisma.$queryRawUnsafe(`
        WITH ${NORM_OUTS_CTE},
        agg_stock AS (
          SELECT
            COALESCE(s."customer", 'AST')       AS customer,
            s."fabricStruct",
            s."fabricPattern",
            s."fabricW",
            s."fabricCode",
            MIN(${NS('s."fabricStruct"')})       AS n_struct,
            MIN(${NW('s."fabricW"')})            AS n_width,
            MIN(${NP('s."fabricPattern"')})      AS n_pattern,
            MIN(COALESCE(s."customer", 'AST'))   AS n_customer,
            COUNT(s.id)::int                     AS lot_count,
            SUM(s."fold")::int                   AS produced_fold,
            SUM(s."sumYard")::float              AS produced_yard
          FROM stockfabrics s
          WHERE ${whereClause}
          GROUP BY COALESCE(s."customer", 'AST'), s."fabricStruct", s."fabricPattern", s."fabricW", s."fabricCode"
        )
        SELECT
          s.customer,
          s."fabricCode",
          s."fabricStruct",
          s."fabricPattern",
          s."fabricW",
          s.lot_count,
          s.produced_fold,
          s.produced_yard,
          -- Match on struct + width + pattern + customer only; no cross-customer fallback
          COALESCE(
            (SELECT SUM(o.out_fold) FROM norm_outs o
             WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width
               AND s.n_pattern <> '' AND o.n_pattern = s.n_pattern
               AND o.n_customer = s.n_customer),
            0
          )::int AS used_fold,
          COALESCE(
            (SELECT SUM(o.out_yard) FROM norm_outs o
             WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width
               AND s.n_pattern <> '' AND o.n_pattern = s.n_pattern
               AND o.n_customer = s.n_customer),
            0
          )::float AS used_yard
        FROM agg_stock s
        ORDER BY customer ASC, produced_yard DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as Promise<any[]>,

      prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS cnt FROM (
          SELECT 1 FROM stockfabrics s
          WHERE ${whereClause}
          GROUP BY COALESCE(s."customer", 'AST'), s."fabricStruct", s."fabricPattern", s."fabricW", s."fabricCode"
        ) sub
      `) as Promise<any[]>,
    ])

    const mappedStocks = (stocks as any[]).map(s => ({
      ...s,
      lot_count:     Number(s.lot_count),
      produced_fold: Number(s.produced_fold),
      produced_yard: Number(s.produced_yard),
      used_fold:     Number(s.used_fold),
      used_yard:     Number(s.used_yard),
    }))

    return Response.json({ stocks: mappedStocks, total: Number((totalRaw as any[])[0]?.cnt ?? 0), page, limit })
  } catch (e) {
    console.error('[stock GET]', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
