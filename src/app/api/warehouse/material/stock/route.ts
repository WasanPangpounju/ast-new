import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import type { MaterialStockRow } from '@/types/material'

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
  )
`

const MATERIAL_STOCK_JOINS = `
  LEFT JOIN req   ON req."materialId"   = m.id
  LEFT JOIN out_w ON out_w."materialId" = m.id
  LEFT JOIN ret   ON ret."materialId"   = m.id
`

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()

  const esc = (s: string) => s.replace(/'/g, "''")
  const qFilter = q
    ? `AND (m."yarnType" ILIKE '%${esc(q)}%' OR m."supplierName" ILIKE '%${esc(q)}%')`
    : ''

  try {
    const rows = await prisma.$queryRawUnsafe<MaterialStockRow[]>(`
      WITH ${MATERIAL_STOCK_CTES}
      SELECT
        m."yarnType",
        m."supplierName",
        SUM(m.spool)::int                                                            AS "totalSpool",
        (COALESCE(SUM(req.spool), 0) + COALESCE(SUM(out_w.spool), 0))::int           AS "usedSpool",
        (SUM(m.spool)
          - COALESCE(SUM(req.spool), 0)
          - COALESCE(SUM(out_w.spool), 0)
          + COALESCE(SUM(ret.spool), 0))::int                                        AS "remainingSpool",
        SUM(m."weightKgSum")                                                          AS "totalWeightKg",
        (COALESCE(SUM(req.weight), 0) + COALESCE(SUM(out_w.weight), 0))              AS "usedWeightKg",
        (SUM(m."weightKgSum")
          - COALESCE(SUM(req.weight), 0)
          - COALESCE(SUM(out_w.weight), 0)
          + COALESCE(SUM(ret.weight), 0))                                            AS "remainingWeightKg"
      FROM materials m
      ${MATERIAL_STOCK_JOINS}
      WHERE m."deletedAt" IS NULL
        ${qFilter}
      GROUP BY m."yarnType", m."supplierName"
      ORDER BY "remainingSpool" DESC
    `)

    return Response.json({ data: rows })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/stock GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
