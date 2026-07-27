import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import type { MaterialStockRow } from '@/types/material'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10) || 20))
  const offset = (page - 1) * limit

  const esc = (s: string) => s.replace(/'/g, "''")
  const qFilter = q
    ? `AND (m."yarnType" ILIKE '%${esc(q)}%' OR m."supplierName" ILIKE '%${esc(q)}%')`
    : ''

  const groupedCte = `
    SELECT
      m."yarnType",
      m."supplierName",
      SUM(m.spool)::int                                                  AS "totalSpool",
      COALESCE(SUM(r.spool), 0)::int                                     AS "usedSpool",
      (SUM(m.spool) - COALESCE(SUM(r.spool), 0))::int                   AS "remainingSpool",
      SUM(m."weightKgSum")                                               AS "totalWeightKg",
      COALESCE(SUM(r."weightWithdrawn"), 0)                              AS "usedWeightKg",
      (SUM(m."weightKgSum") - COALESCE(SUM(r."weightWithdrawn"), 0))    AS "remainingWeightKg"
    FROM materials m
    LEFT JOIN materialrequisitions r
      ON r."materialId" = m.id AND r."deletedAt" IS NULL
    WHERE m."deletedAt" IS NULL
      ${qFilter}
    GROUP BY m."yarnType", m."supplierName"
  `

  try {
    const [rows, [summary]] = await Promise.all([
      prisma.$queryRawUnsafe<MaterialStockRow[]>(`
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

    const total = summary?.total ?? 0

    return Response.json({
      data: rows,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      totalRemainingSpool: summary?.totalRemainingSpool ?? 0,
      totalRemainingWeightKg: summary?.totalRemainingWeightKg ?? 0,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/stock GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
