import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

export async function GET(request: NextRequest) {
  try {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 20
  const offset = (page - 1) * limit
  const search = searchParams.get('search') ?? ''

  let bills: any[]
  let totalRaw: any[]

  if (search) {
    const like = `%${search}%`
    bills = await prisma.$queryRaw`
      SELECT
        f."refId",
        MAX(f."vatType") as "vatType",
        MAX(f."vatNo")::int as "vatNo",
        MAX(f."customerName") as "customerName",
        MAX(f."fabricStruct") as "fabricStruct",
        MAX(f."fabricPattern") as "fabricPattern",
        MAX(f."fabricW") as "fabricW",
        MAX(f."purchaseOrder") as "purchaseOrder",
        MAX(f."altFabricStruct") as "altFabricStruct",
        MAX(f."altPurchaseOrder") as "altPurchaseOrder",
        COUNT(*)::int as "foldCount",
        SUM(f."sumYard")::float as "totalYard",
        MAX(f."createDate") as "createDate"
      FROM fabricouts f
      WHERE f.deleted_at IS NULL
        AND f."isDeposit" = true
        AND (f."customerName" ILIKE ${like} OR f."fabricStruct" ILIKE ${like})
      GROUP BY f."refId"
      ORDER BY MAX(f."createDate") DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as any[]

    totalRaw = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT f."refId")::int as cnt
      FROM fabricouts f
      WHERE f.deleted_at IS NULL
        AND f."isDeposit" = true
        AND (f."customerName" ILIKE ${like} OR f."fabricStruct" ILIKE ${like})
    ` as any[]
  } else {
    bills = await prisma.$queryRaw`
      SELECT
        f."refId",
        MAX(f."vatType") as "vatType",
        MAX(f."vatNo")::int as "vatNo",
        MAX(f."customerName") as "customerName",
        MAX(f."fabricStruct") as "fabricStruct",
        MAX(f."fabricPattern") as "fabricPattern",
        MAX(f."fabricW") as "fabricW",
        MAX(f."purchaseOrder") as "purchaseOrder",
        MAX(f."altFabricStruct") as "altFabricStruct",
        MAX(f."altPurchaseOrder") as "altPurchaseOrder",
        COUNT(*)::int as "foldCount",
        SUM(f."sumYard")::float as "totalYard",
        MAX(f."createDate") as "createDate"
      FROM fabricouts f
      WHERE f.deleted_at IS NULL
        AND f."isDeposit" = true
      GROUP BY f."refId"
      ORDER BY MAX(f."createDate") DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as any[]

    totalRaw = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT f."refId")::int as cnt
      FROM fabricouts f
      WHERE f.deleted_at IS NULL
        AND f."isDeposit" = true
    ` as any[]
  }

  const mappedBills = (bills as any[]).map(b => ({
    ...b,
    vatNo: Number(b.vatNo),
    foldCount: Number(b.foldCount),
    totalYard: Number(b.totalYard),
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
  const date = new Date(createDate)

  await prisma.fabricOut.createMany({
    data: rows.map(r => ({
      refId,
      vatType,
      vatNo: Number(vatNo),
      fold: 1,
      sumYard: r.yard,
      fabricStruct: fabricStruct || '',
      fabricPattern: fabricPattern || '',
      fabricW: fabricW || '',
      customerName,
      receiveName: receiveName || customerName,
      createDate: date,
      isDeposit: false,
      altFabricStruct: null,
      altPurchaseOrder: depositRefId || null,
    })),
  })

  return Response.json({ success: true, count: rows.length, vatNo: Number(vatNo) })
}
