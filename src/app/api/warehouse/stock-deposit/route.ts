import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit  = 20
    const offset = (page - 1) * limit
    const search = searchParams.get('search') ?? ''

    const like = search ? `%${search}%` : null

    const whereDeposit = like
      ? `f.deleted_at IS NULL AND f."isDeposit" = true AND (f."customerName" ILIKE '${like.replace(/'/g, "''")}' OR f."fabricStruct" ILIKE '${like.replace(/'/g, "''")}')`
      : `f.deleted_at IS NULL AND f."isDeposit" = true`

    const bills = await prisma.$queryRawUnsafe(`
      SELECT
        f."refId",
        MAX(f."vatType")                         AS "vatType",
        MAX(f."vatNo")::int                      AS "vatNo",
        MAX(f."customerName")                    AS "customerName",
        MAX(f."fabricStruct")                    AS "fabricStruct",
        MAX(f."fabricPattern")                   AS "fabricPattern",
        MAX(f."fabricW")                         AS "fabricW",
        MAX(f."purchaseOrder")                   AS "purchaseOrder",
        MAX(f."altFabricStruct")                 AS "altFabricStruct",
        MAX(f."altPurchaseOrder")                AS "altPurchaseOrder",
        COUNT(*)::int                            AS "foldCount",
        SUM(f."sumYard")::float                  AS "totalYard",
        MAX(f."createDate")                      AS "createDate",
        COALESCE(w."withdrawnFold", 0)::int      AS "withdrawnFold",
        COALESCE(w."withdrawnYard", 0)::float    AS "withdrawnYard"
      FROM fabricouts f
      LEFT JOIN (
        SELECT
          "altPurchaseOrder",
          COUNT(*)::int       AS "withdrawnFold",
          SUM("sumYard")::float AS "withdrawnYard"
        FROM fabricouts
        WHERE deleted_at IS NULL
          AND "isDeposit" = false
          AND "altPurchaseOrder" IS NOT NULL
        GROUP BY "altPurchaseOrder"
      ) w ON w."altPurchaseOrder" = f."refId"
      WHERE ${whereDeposit}
      GROUP BY f."refId", w."withdrawnFold", w."withdrawnYard"
      ORDER BY MAX(f."createDate") DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as any[]

    const totalRaw = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT f."refId")::int AS cnt
      FROM fabricouts f
      WHERE ${whereDeposit}
    `) as any[]

    const mappedBills = bills.map((b: any) => ({
      ...b,
      vatNo:         Number(b.vatNo),
      foldCount:     Number(b.foldCount),
      totalYard:     Number(b.totalYard),
      withdrawnFold: Number(b.withdrawnFold),
      withdrawnYard: Number(b.withdrawnYard),
    }))

    return Response.json({ bills: mappedBills, total: Number(totalRaw[0]?.cnt ?? 0), page, limit })
  } catch (e) {
    console.error('[stock-deposit GET]', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { vatType, vatNo, customerName, receiveName, fabricStruct, fabricPattern,
          fabricW, createDate, yards, depositRefId } = body

  if (!vatType || !customerName) {
    return Response.json({ error: 'vatType and customerName are required' }, { status: 400 })
  }
  if (!Array.isArray(yards) || !yards.some((y: string) => parseFloat(y) > 0)) {
    return Response.json({ error: 'At least one yard value is required' }, { status: 400 })
  }

  const existing = await prisma.fabricOut.findFirst({
    where: { vatType, vatNo: Number(vatNo), deletedAt: null },
    select: { id: true },
  })
  if (existing) {
    return Response.json({ error: `บิล ${vatType}-${vatNo} มีอยู่แล้ว` }, { status: 409 })
  }

  const rows = (yards as string[])
    .map((y, i) => ({ yard: parseFloat(y), slot: i + 1 }))
    .filter(r => r.yard > 0)

  const refId = randomUUID()
  const date  = new Date(createDate)

  await prisma.fabricOut.createMany({
    data: rows.map(r => ({
      refId,
      vatType,
      vatNo:          Number(vatNo),
      fold:           1,
      sumYard:        r.yard,
      fabricStruct:   fabricStruct || '',
      fabricPattern:  fabricPattern || '',
      fabricW:        fabricW || '',
      customerName,
      receiveName:    receiveName || customerName,
      createDate:     date,
      isDeposit:      false,
      altFabricStruct:  null,
      altPurchaseOrder: depositRefId || null,
    })),
  })

  return Response.json({ success: true, count: rows.length, vatNo: Number(vatNo) })
}
