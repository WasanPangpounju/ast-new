import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { esc, MATERIAL_STOCK_CTES, MATERIAL_STOCK_JOINS, AGGREGATE_COLUMNS } from '@/lib/materialStock'

// น้ำหนักเฉลี่ยต่อลูก (kg) ของ yarnType+supplierName คู่หนึ่ง คำนวณจาก remainingWeightKg / remainingSpool
// ของสต็อกที่เหลืออยู่จริง — ใช้ exact match (ไม่ใช่ ILIKE) เพราะต้องเจาะจงคู่เดียว ไม่ใช่ค้นหา
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const yarnType = (params.get('yarnType') ?? '').trim()
  const supplierName = (params.get('supplierName') ?? '').trim()

  if (!yarnType || !supplierName) {
    return Response.json({ error: 'yarnType and supplierName are required' }, { status: 400 })
  }

  try {
    const [row] = await prisma.$queryRawUnsafe<{ remainingSpool: number; remainingWeightKg: number | string }[]>(`
      WITH ${MATERIAL_STOCK_CTES}
      SELECT ${AGGREGATE_COLUMNS}
      FROM materials m
      ${MATERIAL_STOCK_JOINS}
      WHERE m."deletedAt" IS NULL
        AND m."yarnType" = '${esc(yarnType)}'
        AND m."supplierName" = '${esc(supplierName)}'
    `)

    const remainingSpool = row?.remainingSpool ?? 0
    const remainingWeightKg = Number(row?.remainingWeightKg ?? 0)
    const averageKg = remainingSpool > 0 ? remainingWeightKg / remainingSpool : null

    return Response.json({ averageKg, remainingSpool, remainingWeightKg })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/average-weight GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
