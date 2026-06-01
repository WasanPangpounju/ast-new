import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

const NS = (col: string) =>
  `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(COALESCE(${col}, '')), '\\s+', ' ', 'g'), '\\s*\\*\\s*', '/', 'g'), '\\s+[xX]\\s+', '/', 'g'), '\\s*/\\s*', '/', 'g'))`
const NW = (col: string) =>
  `COALESCE(REGEXP_REPLACE(SPLIT_PART(TRIM(COALESCE(${col}, '')), '/', 1), '[^0-9.]', '', 'g'), '')`
const NP = (col: string) =>
  `COALESCE(TRIM(REGEXP_REPLACE(COALESCE(${col}, ''), '\\s+', ' ', 'g')), '')`

// Effective fabric fields from the aggregated CTE alias 'b'
const EFF_S = `CASE WHEN b.s_struct   = '' THEN b."fabricStruct"   ELSE b.s_struct   END`
const EFF_W = `CASE WHEN b.s_w        = '' THEN b."fabricW"        ELSE b.s_w        END`
const EFF_P = `CASE WHEN b.s_pattern  = '' THEN b."fabricPattern"  ELSE b.s_pattern  END`
const EFF_C = `COALESCE(NULLIF(TRIM(CASE WHEN b.s_customer = '' THEN b."customerName" ELSE b.s_customer END), ''), 'AST')`

const STOCK_MATCH_EXPR = `
  CASE WHEN ${NP(EFF_P)} <> '' AND EXISTS (
    SELECT 1 FROM stockfabrics sf
    WHERE sf.deleted_at IS NULL
      AND ${NP('sf."fabricPattern"')} <> ''
      AND ${NS('sf."fabricStruct"')} = ${NS(EFF_S)}
      AND ${NW('sf."fabricW"')} = ${NW(EFF_W)}
      AND ${NP('sf."fabricPattern"')} = ${NP(EFF_P)}
      AND COALESCE(sf."customer", 'AST') = ${EFF_C}
  ) THEN true ELSE false END`

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const page        = Math.max(1, Number(searchParams.get('page') ?? 1))
    const limit       = 20
    const offset      = (page - 1) * limit
    const search      = searchParams.get('search')      ?? ''
    const noStockOnly = searchParams.get('noStockOnly') === '1'

    const baseWhere = search
      ? `deleted_at IS NULL AND "customerName" ILIKE '%${search.replace(/'/g, "''")}%'`
      : `deleted_at IS NULL`

    const [bills, totalRaw] = await Promise.all([
      prisma.$queryRawUnsafe(`
        WITH agg AS (
          SELECT
            "vatType", "vatNo",
            "customerName", "receiveName",
            "fabricStruct", "fabricPattern", "fabricW",
            MIN("createDate")         AS "createDate",
            COUNT(*)::int             AS "foldCount",
            SUM("sumYard")::float     AS "totalYard",
            MAX("altFabricStruct")    AS "altFabricStruct",
            MAX("altPurchaseOrder")   AS "altPurchaseOrder",
            COALESCE(MAX("stockFabricStruct"),  '') AS s_struct,
            COALESCE(MAX("stockFabricW"),       '') AS s_w,
            COALESCE(MAX("stockFabricPattern"), '') AS s_pattern,
            COALESCE(MAX("stockCustomer"),      '') AS s_customer,
            MAX("orderId")       AS order_id,
            MAX("purchaseOrder") AS purchase_order
          FROM fabricouts
          WHERE ${baseWhere}
          GROUP BY "vatType", "vatNo", "customerName", "receiveName", "fabricStruct", "fabricPattern", "fabricW"
        ),
        with_match AS (
          SELECT b.*, ${STOCK_MATCH_EXPR} AS has_stock_match FROM agg b
        )
        SELECT * FROM with_match
        ${noStockOnly ? 'WHERE NOT has_stock_match' : ''}
        ORDER BY "vatNo" DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as Promise<any[]>,

      prisma.$queryRawUnsafe(`
        WITH agg AS (
          SELECT
            "vatType", "vatNo",
            "customerName", "receiveName",
            "fabricStruct", "fabricPattern", "fabricW",
            COALESCE(MAX("stockFabricStruct"),  '') AS s_struct,
            COALESCE(MAX("stockFabricW"),       '') AS s_w,
            COALESCE(MAX("stockFabricPattern"), '') AS s_pattern,
            COALESCE(MAX("stockCustomer"),      '') AS s_customer
          FROM fabricouts
          WHERE ${baseWhere}
          GROUP BY "vatType", "vatNo", "customerName", "receiveName", "fabricStruct", "fabricPattern", "fabricW"
        ),
        with_match AS (
          SELECT ${STOCK_MATCH_EXPR} AS has_stock_match FROM agg b
        )
        SELECT COUNT(*)::int AS cnt FROM with_match
        ${noStockOnly ? 'WHERE NOT has_stock_match' : ''}
      `) as Promise<any[]>,
    ])

    const mappedBills = (bills as any[]).map(b => ({
      ...b,
      foldCount:          Number(b.foldCount),
      totalYard:          Number(b.totalYard),
      vatNo:              Number(b.vatNo),
      hasStockMatch:      Boolean(b.has_stock_match),
      stockFabricStruct:  b.s_struct  || null,
      stockFabricW:       b.s_w       || null,
      stockFabricPattern: b.s_pattern || null,
      stockCustomer:      b.s_customer || null,
      orderId:            b.order_id !== null && b.order_id !== undefined ? Number(b.order_id) : null,
      purchaseOrder:      b.purchase_order || null,
    }))

    return Response.json({ bills: mappedBills, total: Number((totalRaw as any[])[0]?.cnt ?? 0), page, limit })
  } catch (e) {
    console.error('[bill GET]', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
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

  try {
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bill] Prisma error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }

  return Response.json({ success: true, count: rows.length, vatNo: Number(vatNo) })
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { vatType, vatNo, customerName, receiveName, fabricStruct, fabricPattern, fabricW,
          altFabricStruct, altPurchaseOrder,
          stockFabricStruct, stockFabricW, stockFabricPattern, stockCustomer,
          orderId, purchaseOrder } = body
  if (!vatType || vatNo == null) return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })

  await prisma.fabricOut.updateMany({
    where: { vatType, vatNo: Number(vatNo), deletedAt: null },
    data: {
      customerName:      customerName      ?? undefined,
      receiveName:       receiveName       ?? undefined,
      fabricStruct:      fabricStruct      ?? undefined,
      fabricPattern:     fabricPattern     ?? undefined,
      fabricW:           fabricW           ?? undefined,
      altFabricStruct:   altFabricStruct   !== undefined ? (altFabricStruct  || null) : undefined,
      altPurchaseOrder:  altPurchaseOrder  !== undefined ? (altPurchaseOrder || null) : undefined,
      // Stock override — explicit null clears the override (restores auto-matching)
      stockFabricStruct:  'stockFabricStruct'  in body ? (stockFabricStruct  || null) : undefined,
      stockFabricW:       'stockFabricW'       in body ? (stockFabricW       || null) : undefined,
      stockFabricPattern: 'stockFabricPattern' in body ? (stockFabricPattern || null) : undefined,
      stockCustomer:      'stockCustomer'      in body ? (stockCustomer      || null) : undefined,
      // Order link — explicit null unlinks
      orderId:       'orderId'       in body ? (orderId !== null && orderId !== undefined ? Number(orderId) : null) : undefined,
      purchaseOrder: 'purchaseOrder' in body ? (purchaseOrder || null) : undefined,
    },
  })

  return Response.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const vatType = searchParams.get('vatType')
  const vatNo = searchParams.get('vatNo')
  if (!vatType || vatNo == null) return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })

  await prisma.fabricOut.updateMany({
    where: { vatType, vatNo: Number(vatNo), deletedAt: null },
    data: { deletedAt: new Date() },
  })

  return Response.json({ ok: true })
}
