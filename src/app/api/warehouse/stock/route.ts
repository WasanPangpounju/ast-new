import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { NORM_OUTS_CTE, STOCK_GROUP_KEY, CK, NC } from '@/lib/fabricOutMatch'

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

    // Row filters (stock type) apply before grouping; search filters apply to the whole
    // group (HAVING) so a match on one code variant still shows the group's full total.
    const conditions: string[] = ['s.deleted_at IS NULL']
    if (stockType === 'produced')  conditions.push('s.is_purchased = false')
    if (stockType === 'purchased') conditions.push('s.is_purchased = true')
    const whereClause = conditions.join(' AND ')

    const having: string[] = []
    if (q)        having.push(`BOOL_OR(s.${searchField} ILIKE '%${q.replace(/'/g, "''")}%')`)
    // Customer search ignores whitespace too ("เอ็มเคเค" finds "เอ็ม เค เค")
    if (customer) having.push(`BOOL_OR(${CK(NC('s."customer"'))} ILIKE ${CK(`'%${customer.replace(/'/g, "''")}%'`)})`)
    const havingClause = having.length ? `HAVING ${having.join(' AND ')}` : ''

    const [kc, ks, kw, kp] = STOCK_GROUP_KEY('s')
    // Display values come from the most recently keyed row of the group
    const latest = (col: string, filter = '') =>
      `(ARRAY_AGG(${col} ORDER BY s."createDate" DESC NULLS LAST, s.id DESC)${filter ? ` FILTER (WHERE ${filter})` : ''})[1]`

    const [stocks, totalRaw] = await Promise.all([
      prisma.$queryRawUnsafe(`
        WITH ${NORM_OUTS_CTE},
        agg_stock AS (
          SELECT
            ${kc}                                AS n_customer,
            ${ks}                                AS n_struct,
            ${kw}                                AS n_width,
            ${kp}                                AS n_pattern,
            ${latest(NC('s."customer"'))}        AS customer,
            ${latest(`s."fabricStruct"`)}        AS "fabricStruct",
            ${latest(`s."fabricPattern"`)}       AS "fabricPattern",
            ${latest(`s."fabricW"`)}             AS "fabricW",
            ${latest(`s."fabricCode"`, `COALESCE(s."fabricCode", '') <> ''`)} AS "fabricCode",
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(TRIM(s."fabricCode"), '')), NULL) AS "fabricCodes",
            COUNT(s.id)::int                     AS lot_count,
            SUM(s."fold")::int                   AS produced_fold,
            SUM(s."sumYard")::float              AS produced_yard
          FROM stockfabrics s
          WHERE ${whereClause}
          GROUP BY 1, 2, 3, 4
          ${havingClause}
        )
        SELECT
          s.customer,
          s."fabricCode",
          s."fabricCodes",
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
          GROUP BY ${kc}, ${ks}, ${kw}, ${kp}
          ${havingClause}
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
