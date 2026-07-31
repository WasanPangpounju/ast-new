import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import type { MaterialStockGroup, MaterialStockCompanyRow } from '@/types/material'

const esc = (s: string) => s.replace(/'/g, "''")
const KG_TO_LB = 2.20462

function withLb<T extends { totalWeightKg: number | string; usedWeightKg: number | string; remainingWeightKg: number | string }>(
  row: T
): T & { totalWeightLb: number; usedWeightLb: number; remainingWeightLb: number } {
  return {
    ...row,
    totalWeightLb: Number(row.totalWeightKg) * KG_TO_LB,
    usedWeightLb: Number(row.usedWeightKg) * KG_TO_LB,
    remainingWeightLb: Number(row.remainingWeightKg) * KG_TO_LB,
  }
}

// Pre-aggregate each source table by materialId before joining, so a material with many
// requisition/outside/return rows doesn't fan out and double-count the others (each CTE
// yields at most one row per materialId, matching materials.id 1:1).
const MATERIAL_STOCK_CTES = `
  req AS (
    SELECT "materialId", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
    FROM materialrequisitions
    WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
    GROUP BY "materialId"
  ),
  out_w AS (
    SELECT "materialId", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
    FROM material_outsides
    WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
    GROUP BY "materialId"
  ),
  ret AS (
    SELECT "materialId", SUM(spool) AS spool, SUM("weightReturn") AS weight
    FROM material_returns
    WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
    GROUP BY "materialId"
  ),
  -- เบิกภายในที่ materialId lookup พลาดตอน POST (materialId IS NULL) แต่ยังมี yarnType/supplierName
  -- ตรงจาก fix persist-yarnType-supplier — ไม่รวม 665 legacy record เก่าที่ field พวกนี้เป็น null ด้วย (ยังไม่ backfill)
  req_orphan_totals AS (
    SELECT "yarnType", "supplierName", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
    FROM materialrequisitions
    WHERE "deletedAt" IS NULL AND "materialId" IS NULL
      AND "yarnType" IS NOT NULL AND "supplierName" IS NOT NULL
    GROUP BY "yarnType", "supplierName"
  ),
  -- แจกยอด pool เท่าๆ กันให้ทุก lot ที่ yarnType+supplierName ตรงกัน (join ตรงไม่ได้เพราะไม่มี materialId)
  -- ผลลัพธ์เป็น 1 row ต่อ materials.id เหมือน req/out_w/ret ทุกประการ กัน fan-out ตอน SUM ใน GROUP BY รอบนอก
  req_orphan AS (
    SELECT m.id AS "materialId",
           t.spool::float / COUNT(*) OVER (PARTITION BY m."yarnType", m."supplierName") AS spool,
           t.weight        / COUNT(*) OVER (PARTITION BY m."yarnType", m."supplierName") AS weight
    FROM materials m
    JOIN req_orphan_totals t
      ON t."yarnType" = m."yarnType" AND t."supplierName" = m."supplierName"
    WHERE m."deletedAt" IS NULL
  )
`

const MATERIAL_STOCK_JOINS = `
  LEFT JOIN req         ON req."materialId"        = m.id
  LEFT JOIN out_w       ON out_w."materialId"      = m.id
  LEFT JOIN ret          ON ret."materialId"        = m.id
  LEFT JOIN req_orphan   ON req_orphan."materialId" = m.id
`

// remaining = total - เบิกใช้งาน(req + req_orphan) - เบิกภายนอก(out_w) + คืนเข้าสต็อก(ret)
const AGGREGATE_COLUMNS = `
  SUM(m.spool)::int                                                            AS "totalSpool",
  (COALESCE(SUM(req.spool), 0) + COALESCE(SUM(out_w.spool), 0)
    + COALESCE(SUM(req_orphan.spool), 0))::int                                AS "usedSpool",
  (SUM(m.spool)
    - COALESCE(SUM(req.spool), 0)
    - COALESCE(SUM(out_w.spool), 0)
    - COALESCE(SUM(req_orphan.spool), 0)
    + COALESCE(SUM(ret.spool), 0))::int                                        AS "remainingSpool",
  SUM(m."weightKgSum")                                                          AS "totalWeightKg",
  (COALESCE(SUM(req.weight), 0) + COALESCE(SUM(out_w.weight), 0)
    + COALESCE(SUM(req_orphan.weight), 0))                                    AS "usedWeightKg",
  (SUM(m."weightKgSum")
    - COALESCE(SUM(req.weight), 0)
    - COALESCE(SUM(out_w.weight), 0)
    - COALESCE(SUM(req_orphan.weight), 0)
    + COALESCE(SUM(ret.weight), 0))                                            AS "remainingWeightKg"
`

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
    prisma.$queryRawUnsafe<{ total: number; totalRemainingSpool: number; totalRemainingWeightKg: number }[]>(`
      SELECT
        COUNT(*)::int                                        AS "total",
        COALESCE(SUM(t."remainingSpool"), 0)::int            AS "totalRemainingSpool",
        COALESCE(SUM(t."remainingWeightKg"), 0)              AS "totalRemainingWeightKg"
      FROM (${companyCte}) t
    `),
  ])

  const total = summary?.total ?? 0
  const totalRemainingWeightKg = summary?.totalRemainingWeightKg ?? 0

  return Response.json({
    mode: 'flat' as const,
    data: rows.map(withLb),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totalRemainingSpool: summary?.totalRemainingSpool ?? 0,
    totalRemainingWeightKg,
    totalRemainingWeightLb: totalRemainingWeightKg * KG_TO_LB,
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
    prisma.$queryRawUnsafe<{ total: number; totalRemainingSpool: number; totalRemainingWeightKg: number }[]>(`
      SELECT
        COUNT(*)::int                                        AS "total",
        COALESCE(SUM(t."remainingSpool"), 0)::int            AS "totalRemainingSpool",
        COALESCE(SUM(t."remainingWeightKg"), 0)              AS "totalRemainingWeightKg"
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

  return Response.json({
    mode: 'grouped' as const,
    data,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    totalRemainingSpool: summary?.totalRemainingSpool ?? 0,
    totalRemainingWeightKg,
    totalRemainingWeightLb: totalRemainingWeightKg * KG_TO_LB,
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
