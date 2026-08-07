import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import type { MaterialStockGroup, MaterialStockCompanyRow } from '@/types/material'
import { esc, KG_TO_LB, withLb, MATERIAL_STOCK_CTES, MATERIAL_STOCK_JOINS, AGGREGATE_COLUMNS } from '@/lib/materialStock'

async function getFlatByCompany(q: string, page: number, limit: number, offset: number) {
  const companyCte = `
    WITH ${MATERIAL_STOCK_CTES}
    SELECT
      m."yarnType",
      m."supplierName",
      ${AGGREGATE_COLUMNS}
    FROM materials m
    ${MATERIAL_STOCK_JOINS}
    WHERE m."deletedAt" IS NULL
      AND m."supplierName" ILIKE '%${esc(q)}%'
    GROUP BY m."yarnType", m."supplierName"
  `

  const [rows, [summary]] = await Promise.all([
    prisma.$queryRawUnsafe<MaterialStockCompanyRow[]>(`
      ${companyCte}
      ORDER BY "remainingSpool" DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRawUnsafe<{ total: number; totalRemainingSpool: number; totalRemainingWeightKg: number; totalRemainingWeightKgEstimated: number }[]>(`
      SELECT
        COUNT(*)::int                                        AS "total",
        COALESCE(SUM(t."remainingSpool"), 0)::int            AS "totalRemainingSpool",
        COALESCE(SUM(t."remainingWeightKg"), 0)              AS "totalRemainingWeightKg",
        COALESCE(SUM(t."remainingWeightKgEstimated"), 0)     AS "totalRemainingWeightKgEstimated"
      FROM (${companyCte}) t
    `),
  ])

  const total = summary?.total ?? 0
  const totalRemainingWeightKg = summary?.totalRemainingWeightKg ?? 0
  const totalRemainingWeightKgEstimated = summary?.totalRemainingWeightKgEstimated ?? 0

  return Response.json({
    mode: 'flat' as const,
    data: rows.map(withLb),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totalRemainingSpool: summary?.totalRemainingSpool ?? 0,
    totalRemainingWeightKg,
    totalRemainingWeightLb: totalRemainingWeightKg * KG_TO_LB,
    totalRemainingWeightKgEstimated,
    totalRemainingWeightLbEstimated: totalRemainingWeightKgEstimated * KG_TO_LB,
  })
}

async function getGrouped(q: string, page: number, limit: number, offset: number) {
  // A group (yarnType) matches if its name matches, or any company under it matches —
  // group totals always reflect every company, even when the match came from a company name.
  const matchFilter = q
    ? `AND (
        m."yarnType" ILIKE '%${esc(q)}%'
        OR EXISTS (
          SELECT 1 FROM materials m2
          WHERE m2."yarnType" = m."yarnType"
            AND m2."deletedAt" IS NULL
            AND m2."supplierName" ILIKE '%${esc(q)}%'
        )
      )`
    : ''
  const yarnMatchExpr = q ? `bool_or(m."yarnType" ILIKE '%${esc(q)}%')` : 'true'

  const groupedCte = `
    WITH ${MATERIAL_STOCK_CTES}
    SELECT
      m."yarnType",
      COUNT(DISTINCT m."supplierName")::int                              AS "supplierCount",
      ${yarnMatchExpr}                                                    AS "matchedByYarn",
      ${AGGREGATE_COLUMNS}
    FROM materials m
    ${MATERIAL_STOCK_JOINS}
    WHERE m."deletedAt" IS NULL
      ${matchFilter}
    GROUP BY m."yarnType"
  `

  const [groupRows, [summary]] = await Promise.all([
    prisma.$queryRawUnsafe<(Omit<MaterialStockGroup, 'companies' | 'autoExpand'> & { matchedByYarn: boolean })[]>(`
      ${groupedCte}
      ORDER BY "remainingSpool" DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRawUnsafe<{ total: number; totalRemainingSpool: number; totalRemainingWeightKg: number; totalRemainingWeightKgEstimated: number }[]>(`
      SELECT
        COUNT(*)::int                                        AS "total",
        COALESCE(SUM(t."remainingSpool"), 0)::int            AS "totalRemainingSpool",
        COALESCE(SUM(t."remainingWeightKg"), 0)              AS "totalRemainingWeightKg",
        COALESCE(SUM(t."remainingWeightKgEstimated"), 0)     AS "totalRemainingWeightKgEstimated"
      FROM (${groupedCte}) t
    `),
  ])

  const pageYarnTypes = groupRows.map((g) => g.yarnType)
  const companyRows = pageYarnTypes.length
    ? await prisma.$queryRawUnsafe<MaterialStockCompanyRow[]>(`
        WITH ${MATERIAL_STOCK_CTES}
        SELECT
          m."yarnType",
          m."supplierName",
          ${AGGREGATE_COLUMNS}
        FROM materials m
        ${MATERIAL_STOCK_JOINS}
        WHERE m."deletedAt" IS NULL
          AND m."yarnType" IN (${pageYarnTypes.map((t) => `'${esc(t)}'`).join(',')})
        GROUP BY m."yarnType", m."supplierName"
        ORDER BY "remainingSpool" DESC
      `)
    : []

  const companiesByYarn = new Map<string, MaterialStockCompanyRow[]>()
  for (const c of companyRows) {
    const list = companiesByYarn.get(c.yarnType) ?? []
    list.push(c)
    companiesByYarn.set(c.yarnType, list)
  }

  const data: MaterialStockGroup[] = groupRows.map(({ matchedByYarn, ...g }) => ({
    ...withLb(g),
    autoExpand: Boolean(q) && !matchedByYarn,
    companies: (companiesByYarn.get(g.yarnType) ?? []).map(withLb),
  }))

  const total = summary?.total ?? 0
  const totalRemainingWeightKg = summary?.totalRemainingWeightKg ?? 0
  const totalRemainingWeightKgEstimated = summary?.totalRemainingWeightKgEstimated ?? 0

  return Response.json({
    mode: 'grouped' as const,
    data,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totalRemainingSpool: summary?.totalRemainingSpool ?? 0,
    totalRemainingWeightKg,
    totalRemainingWeightLb: totalRemainingWeightKg * KG_TO_LB,
    totalRemainingWeightKgEstimated,
    totalRemainingWeightLbEstimated: totalRemainingWeightKgEstimated * KG_TO_LB,
  })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()
  const type = params.get('type')
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10) || 20))
  const offset = (page - 1) * limit

  try {
    if (type === 'company' && q) {
      return await getFlatByCompany(q, page, limit, offset)
    }
    return await getGrouped(q, page, limit, offset)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/stock GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
