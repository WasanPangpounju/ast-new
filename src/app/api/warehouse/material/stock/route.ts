import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import type { MaterialStockRow } from '@/types/material'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()

  const esc = (s: string) => s.replace(/'/g, "''")
  const qFilter = q
    ? `AND (m."yarnType" ILIKE '%${esc(q)}%' OR m."supplierName" ILIKE '%${esc(q)}%')`
    : ''

  try {
    const rows = await prisma.$queryRawUnsafe<MaterialStockRow[]>(`
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
      ORDER BY "remainingSpool" DESC
    `)

    return Response.json({ data: rows })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/stock GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
