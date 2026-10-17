import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { NORM_OUTS_CTE, PILE_OUTS_CTE, STOCK_GROUP_KEY, CK, NC, NS, NW, NP } from '@/lib/fabricOutMatch'

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
    const qLit = `'%${q.replace(/'/g, "''")}%'`
    const custLit = CK(`'%${customer.replace(/'/g, "''")}%'`)

    // Row filters (stock type) apply before grouping; search filters apply to the whole
    // group (HAVING) so a match on one code variant still shows the group's full total.
    const conditions: string[] = ['s.deleted_at IS NULL']
    if (stockType === 'produced')  conditions.push('s.is_purchased = false')
    if (stockType === 'purchased') conditions.push('s.is_purchased = true')
    const whereClause = conditions.join(' AND ')

    const having: string[] = []
    // A pile also matches on its name (กองผ้า), whatever field is searched
    if (q)        having.push(`(BOOL_OR(s.${searchField} ILIKE ${qLit}) OR COALESCE(MAX(p.name), '') ILIKE ${qLit})`)
    // Customer search ignores whitespace too ("เอ็มเคเค" finds "เอ็ม เค เค")
    if (customer) having.push(`BOOL_OR(${CK(NC('s."customer"'))} ILIKE ${custLit})`)
    const havingClause = having.length ? `HAVING ${having.join(' AND ')}` : ''

    // Piles with no stock rows yet (just created, or every lot moved out) still list,
    // so their bills' ใช้ไป stays visible. Hidden when filtering by stock type.
    const emptyPileConds: string[] = ['p.deleted_at IS NULL',
      'NOT EXISTS (SELECT 1 FROM stockfabrics x WHERE x.stock_pile_id = p.id AND x.deleted_at IS NULL)']
    if (stockType !== 'all') emptyPileConds.push('false')
    if (q) emptyPileConds.push(`(p.name ILIKE ${qLit} OR ${searchBy === 'fabricCode' ? 'false' : `p.${searchField} ILIKE ${qLit}`})`)
    if (customer) emptyPileConds.push(`${CK(NC('p."customer"'))} ILIKE ${custLit}`)

    const [kc, ks, kw, kp] = STOCK_GROUP_KEY('s')
    // กองหลัก groups on the normalized 4-field key; a pile is one group by id
    // (its rows may carry raw spelling variants), so its key columns are NULL.
    const mainKey = (k: string) => `CASE WHEN s.stock_pile_id IS NULL THEN ${k} END`
    // Display values come from the most recently keyed row of the group
    const latest = (col: string, filter = '') =>
      `(ARRAY_AGG(${col} ORDER BY s."createDate" DESC NULLS LAST, s.id DESC)${filter ? ` FILTER (WHERE ${filter})` : ''})[1]`

    const groupsCte = `
        WITH ${NORM_OUTS_CTE},
        ${PILE_OUTS_CTE},
        agg_stock AS (
          SELECT
            s.stock_pile_id                      AS pile_id,
            ${mainKey(kc)}                       AS n_customer,
            ${mainKey(ks)}                       AS n_struct,
            ${mainKey(kw)}                       AS n_width,
            ${mainKey(kp)}                       AS n_pattern,
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
          LEFT JOIN stock_piles p ON p.id = s.stock_pile_id
          WHERE ${whereClause}
          -- a pile is one group by id; rows inside it may carry raw spelling variants
          GROUP BY 1, 2, 3, 4, 5
          ${havingClause}
        ),
        empty_piles AS (
          SELECT
            p.id AS pile_id,
            ${CK(NC('p."customer"'))} AS n_customer,
            ${NS('p."fabricStruct"')} AS n_struct,
            ${NW('p."fabricW"')}      AS n_width,
            ${NP('p."fabricPattern"')} AS n_pattern,
            ${NC('p."customer"')}     AS customer,
            p."fabricStruct", p."fabricPattern", p."fabricW",
            NULL::text AS "fabricCode", ARRAY[]::text[] AS "fabricCodes",
            0 AS lot_count, 0 AS produced_fold, 0::float AS produced_yard
          FROM stock_piles p
          WHERE ${emptyPileConds.join(' AND ')}
        ),
        all_groups AS (
          SELECT * FROM agg_stock
          UNION ALL
          SELECT * FROM empty_piles
        )`

    const [stocks, totalRaw] = await Promise.all([
      prisma.$queryRawUnsafe(`
        ${groupsCte}
        SELECT
          s.pile_id                                   AS "stockPileId",
          p.name                                      AS "pileName",
          -- a pile shows its own fields, not whichever lot was keyed last
          CASE WHEN s.pile_id IS NOT NULL THEN ${NC('p."customer"')} ELSE s.customer END AS customer,
          s."fabricCode",
          s."fabricCodes",
          COALESCE(p."fabricStruct",  s."fabricStruct")  AS "fabricStruct",
          COALESCE(p."fabricPattern", s."fabricPattern") AS "fabricPattern",
          COALESCE(p."fabricW",       s."fabricW")       AS "fabricW",
          s.lot_count,
          s.produced_fold,
          s.produced_yard,
          -- กองหลัก: match on struct + width + pattern + customer only; no cross-customer fallback.
          -- กองที่สร้างเอง: bills linked to the pile by id.
          CASE WHEN s.pile_id IS NOT NULL
            THEN COALESCE((SELECT po.out_fold FROM pile_outs po WHERE po.pile_id = s.pile_id), 0)
            ELSE COALESCE(
              (SELECT SUM(o.out_fold) FROM norm_outs o
               WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width
                 AND s.n_pattern <> '' AND o.n_pattern = s.n_pattern
                 AND o.n_customer = s.n_customer),
              0)
          END::int AS used_fold,
          CASE WHEN s.pile_id IS NOT NULL
            THEN COALESCE((SELECT po.out_yard FROM pile_outs po WHERE po.pile_id = s.pile_id), 0)
            ELSE COALESCE(
              (SELECT SUM(o.out_yard) FROM norm_outs o
               WHERE o.n_struct = s.n_struct AND o.n_width = s.n_width
                 AND s.n_pattern <> '' AND o.n_pattern = s.n_pattern
                 AND o.n_customer = s.n_customer),
              0)
          END::float AS used_yard
        FROM all_groups s
        LEFT JOIN stock_piles p ON p.id = s.pile_id
        ORDER BY customer ASC, s.produced_yard DESC, s.pile_id NULLS FIRST
        LIMIT ${limit} OFFSET ${offset}
      `) as Promise<any[]>,

      prisma.$queryRawUnsafe(`
        ${groupsCte}
        SELECT COUNT(*)::int AS cnt FROM all_groups
      `) as Promise<any[]>,
    ])

    const mappedStocks = (stocks as any[]).map(s => ({
      ...s,
      stockPileId:   s.stockPileId == null ? null : Number(s.stockPileId),
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
