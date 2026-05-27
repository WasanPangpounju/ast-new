import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

const NS = (col: string) =>
  `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(${col}, '')), '\\s+', ' ', 'g'), '\\s*\\*\\s*', '/', 'g'), '\\s+[xX]\\s+', '/', 'g'), '\\s*/\\s*', '/', 'g'))`

const NW = (col: string) =>
  `COALESCE(REGEXP_REPLACE(SPLIT_PART(TRIM(COALESCE(${col}, '')), '/', 1), '[^0-9.]', '', 'g'), '')`

const NP = (col: string) =>
  `COALESCE(TRIM(REGEXP_REPLACE(COALESCE(${col}, ''), '\\s+', ' ', 'g')), '')`

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
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = request.nextUrl.searchParams
  const q             = (params.get('q')            ?? '').trim()
  const field         = params.get('field')          ?? ''
  const filterCustomer = (params.get('customer')    ?? '').trim()
  const filterStruct   = (params.get('fabricStruct') ?? '').trim()
  const filterPattern  = (params.get('fabricPattern') ?? '').trim()
  const filterW        = (params.get('fabricW')       ?? '').trim()
  const filterCode     = (params.get('fabricCode')    ?? '').trim()

  const hasAnyFilter = q || filterCustomer || filterStruct || filterPattern || filterW || filterCode
  if (!hasAnyFilter) return Response.json({ results: [] })

  if (field === 'fabricCode') {
    const pattern = `%${q}%`
    const results = await prisma.$queryRaw<{ fabricCode: string; fabricStruct: string; fabricPattern: string; fabricW: string }[]>`
      SELECT DISTINCT s."fabricCode", s."fabricStruct", s."fabricPattern", s."fabricW"
      FROM stockfabrics s
      WHERE s.deleted_at IS NULL
        AND s."fabricCode" IS NOT NULL AND s."fabricCode" <> ''
        AND s."fabricCode" ILIKE ${pattern}
      ORDER BY s."fabricCode"
      LIMIT 10
    `
    return Response.json({ results })
  }

  const esc = (s: string) => s.replace(/'/g, "''")
  const conditions: string[] = ['s.deleted_at IS NULL']
  if (q)             conditions.push(`(s."fabricStruct" ILIKE '%${esc(q)}%' OR s."fabricPattern" ILIKE '%${esc(q)}%' OR s."fabricW" ILIKE '%${esc(q)}%' OR s."fabricCode" ILIKE '%${esc(q)}%' OR COALESCE(s."customer", 'AST') ILIKE '%${esc(q)}%')`)
  if (filterCustomer) conditions.push(`COALESCE(s."customer", 'AST') ILIKE '%${esc(filterCustomer)}%'`)
  if (filterStruct)   conditions.push(`s."fabricStruct" ILIKE '%${esc(filterStruct)}%'`)
  if (filterPattern)  conditions.push(`s."fabricPattern" ILIKE '%${esc(filterPattern)}%'`)
  if (filterW)        conditions.push(`s."fabricW" ILIKE '%${esc(filterW)}%'`)
  if (filterCode)     conditions.push(`s."fabricCode" IS NOT NULL AND s."fabricCode" ILIKE '%${esc(filterCode)}%'`)
  const whereClause = conditions.join(' AND ')

  const results = await prisma.$queryRawUnsafe<{
    fabricStruct: string; fabricPattern: string; fabricW: string
    fabricCode: string | null; customer: string
    produced_fold: number; produced_yard: number
    used_fold: number; used_yard: number
  }[]>(`
    WITH ${NORM_OUTS_CTE},
    agg_stock AS (
      SELECT
        s."fabricStruct",
        s."fabricPattern",
        s."fabricW",
        MAX(s."fabricCode")                    AS "fabricCode",
        COALESCE(s."customer", 'AST')          AS customer,
        MIN(${NS('s."fabricStruct"')})          AS n_struct,
        MIN(${NW('s."fabricW"')})               AS n_width,
        MIN(${NP('s."fabricPattern"')})         AS n_pattern,
        MIN(COALESCE(s."customer", 'AST'))      AS n_customer,
        SUM(s."fold")::int                      AS produced_fold,
        SUM(s."sumYard")::float                 AS produced_yard
      FROM stockfabrics s
      WHERE ${whereClause}
      GROUP BY s."fabricStruct", s."fabricPattern", s."fabricW", COALESCE(s."customer", 'AST')
    )
    SELECT
      s."fabricStruct",
      s."fabricPattern",
      s."fabricW",
      s."fabricCode",
      s.customer,
      s.produced_fold,
      s.produced_yard,
      COALESCE(
        (SELECT SUM(o.out_fold) FROM norm_outs o
         WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width
           AND s.n_pattern <> '' AND o.n_pattern = s.n_pattern
           AND o.n_customer = s.n_customer),
        (SELECT SUM(o.out_fold) FROM norm_outs o
         WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width
           AND s.n_pattern <> '' AND o.n_pattern = s.n_pattern),
        (SELECT SUM(o.out_fold) FROM norm_outs o
         WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width),
        0
      )::int AS used_fold,
      COALESCE(
        (SELECT SUM(o.out_yard) FROM norm_outs o
         WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width
           AND s.n_pattern <> '' AND o.n_pattern = s.n_pattern
           AND o.n_customer = s.n_customer),
        (SELECT SUM(o.out_yard) FROM norm_outs o
         WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width
           AND s.n_pattern <> '' AND o.n_pattern = s.n_pattern),
        (SELECT SUM(o.out_yard) FROM norm_outs o
         WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width),
        0
      )::float AS used_yard
    FROM agg_stock s
    ORDER BY produced_yard DESC
    LIMIT 15
  `)

  return Response.json({ results })
}
