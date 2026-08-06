import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { esc, KG_TO_LB, MATERIAL_STOCK_CTES, MATERIAL_STOCK_JOINS, AGGREGATE_COLUMNS } from '@/lib/materialStock'

// น้ำหนักเฉลี่ยต่อลูก (kg) ของ yarnType+supplierName คู่หนึ่ง คืนค่า 2 สูตร:
// - averageKgTotal = totalWeightKg / totalSpool (ค่าเริ่มต้นที่ frontend ใช้) นิ่งกว่าเพราะ total
//   ไม่ผ่านการลบซ้อนหลายชั้นเหมือน remaining เลยไม่เจอ catastrophic cancellation ตอนตัวเลข
//   used/return สะสมคลาดเคลื่อนเล็กน้อย (ดู docs/tc45-g10-stock-remaining-anomaly-investigation.md)
// - averageKgRemaining = remainingWeightKg / remainingSpool (ของเดิม) เก็บไว้เผื่อ use case อื่น
//   ในอนาคต แต่ไม่แนะนำให้ใช้ auto-fill เพราะพิสูจน์แล้วว่าให้ค่าผิดปกติ/ติดลบได้ใน 27/177 yarnType
// ใช้ exact match (ไม่ใช่ ILIKE) เพราะต้องเจาะจงคู่เดียว ไม่ใช่ค้นหา
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const yarnType = (params.get('yarnType') ?? '').trim()
  const supplierName = (params.get('supplierName') ?? '').trim()

  if (!yarnType || !supplierName) {
    return Response.json({ error: 'yarnType and supplierName are required' }, { status: 400 })
  }

  try {
    const [row] = await prisma.$queryRawUnsafe<{
      totalSpool: number
      totalWeightKg: number | string
      remainingSpool: number
      remainingWeightKg: number | string
    }[]>(`
      WITH ${MATERIAL_STOCK_CTES}
      SELECT ${AGGREGATE_COLUMNS}
      FROM materials m
      ${MATERIAL_STOCK_JOINS}
      WHERE m."deletedAt" IS NULL
        AND m."yarnType" = '${esc(yarnType)}'
        AND m."supplierName" = '${esc(supplierName)}'
    `)

    const totalSpool = row?.totalSpool ?? 0
    const totalWeightKg = Number(row?.totalWeightKg ?? 0)
    const remainingSpool = row?.remainingSpool ?? 0
    const remainingWeightKg = Number(row?.remainingWeightKg ?? 0)

    const averageKgTotal = totalSpool > 0 ? totalWeightKg / totalSpool : null
    const averageKgRemaining = remainingSpool > 0 ? remainingWeightKg / remainingSpool : null
    const averagePTotal = averageKgTotal !== null ? averageKgTotal * KG_TO_LB : null
    const averagePRemaining = averageKgRemaining !== null ? averageKgRemaining * KG_TO_LB : null

    return Response.json({
      averageKgTotal,
      averagePTotal,
      averageKgRemaining,
      averagePRemaining,
      totalSpool,
      totalWeightKg,
      remainingSpool,
      remainingWeightKg,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/average-weight GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
