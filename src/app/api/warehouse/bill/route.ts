import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

export async function GET(request: NextRequest) {
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
        "vatType", "vatNo",
        "customerName", "receiveName",
        "fabricStruct", "fabricPattern", "fabricW",
        MIN("createDate") as "createDate",
        COUNT(*)::int as "foldCount",
        SUM("sumYard") as "totalYard",
        MAX("altFabricStruct") as "altFabricStruct",
        MAX("altPurchaseOrder") as "altPurchaseOrder"
      FROM fabricouts
      WHERE deleted_at IS NULL
        AND "customerName" ILIKE ${like}
      GROUP BY "vatType", "vatNo", "customerName", "receiveName", "fabricStruct", "fabricPattern", "fabricW"
      ORDER BY "vatNo" DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as any[]

    totalRaw = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT ("vatType", "vatNo"))::int as cnt
      FROM fabricouts
      WHERE deleted_at IS NULL
        AND "customerName" ILIKE ${like}
    ` as any[]
  } else {
    bills = await prisma.$queryRaw`
      SELECT
        "vatType", "vatNo",
        "customerName", "receiveName",
        "fabricStruct", "fabricPattern", "fabricW",
        MIN("createDate") as "createDate",
        COUNT(*)::int as "foldCount",
        SUM("sumYard") as "totalYard",
        MAX("altFabricStruct") as "altFabricStruct",
        MAX("altPurchaseOrder") as "altPurchaseOrder"
      FROM fabricouts
      WHERE deleted_at IS NULL
      GROUP BY "vatType", "vatNo", "customerName", "receiveName", "fabricStruct", "fabricPattern", "fabricW"
      ORDER BY "vatNo" DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as any[]

    totalRaw = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT ("vatType", "vatNo"))::int as cnt
      FROM fabricouts
      WHERE deleted_at IS NULL
    ` as any[]
  }

  return Response.json({ bills, total: totalRaw[0]?.cnt ?? 0, page, limit })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { vatType, vatNo, customerName, receiveName, orderId, purchaseOrder,
          fabricStruct, fabricPattern, fabricW, createDate, yards,
          isDeposit, altFabricStruct, altPurchaseOrder } = body

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
      orderId: orderId ? Number(orderId) : null,
      purchaseOrder: purchaseOrder || null,
      createDate: date,
      isDeposit: isDeposit ?? false,
      altFabricStruct: altFabricStruct || null,
      altPurchaseOrder: altPurchaseOrder || null,
    })),
  })

  return Response.json({ success: true, count: rows.length, vatNo: Number(vatNo) })
}
