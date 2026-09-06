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
      ? (() => {
          const esc = search.replace(/'/g, "''")
          const digits = search.replace(/[^0-9]/g, '')
          const vatNoClause = digits ? ` OR CAST("vatNo" AS TEXT) LIKE '%${digits}%'` : ''
          return `deleted_at IS NULL AND ("customerName" ILIKE '%${esc}%' OR "receiveName" ILIKE '%${esc}%' OR "vatType" ILIKE '%${esc}%'${vatNoClause})`
        })()
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
            -- Every distinct order actually linked to a row in this bill (not
            -- just one, collapsed via MAX) — a bill can span multiple orders
            -- when it was used to cover overflow past the first order's yard.
            COALESCE(
              jsonb_agg(DISTINCT jsonb_build_object('orderId', "orderId", 'purchaseOrder', "purchaseOrder"))
                FILTER (WHERE "orderId" IS NOT NULL),
              '[]'::jsonb
            ) AS orders_json
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

    const mappedBills = (bills as any[]).map(b => {
      // node-postgres already parses jsonb columns into plain JS values.
      const rawOrders = Array.isArray(b.orders_json) ? b.orders_json : []
      const orders = rawOrders
        .map((o: { orderId: number | string | null; purchaseOrder: string | null }) => ({
          orderId: Number(o.orderId),
          purchaseOrder: o.purchaseOrder || null,
        }))
        .sort((a: { orderId: number }, b2: { orderId: number }) => a.orderId - b2.orderId)

      return {
        ...b,
        foldCount:          Number(b.foldCount),
        totalYard:          Number(b.totalYard),
        vatNo:              Number(b.vatNo),
        hasStockMatch:      Boolean(b.has_stock_match),
        stockFabricStruct:  b.s_struct  || null,
        stockFabricW:       b.s_w       || null,
        stockFabricPattern: b.s_pattern || null,
        stockCustomer:      b.s_customer || null,
        orders,
        // Back-compat single-order view (first linked order) — bills with
        // exactly one order (the common case) see the exact same values here
        // as before this field became an array.
        orderId:       orders[0]?.orderId ?? null,
        purchaseOrder: orders[0]?.purchaseOrder ?? null,
      }
    })

    return Response.json({ bills: mappedBills, total: Number((totalRaw as any[])[0]?.cnt ?? 0), page, limit })
  } catch (e) {
    console.error('[bill GET]', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

// Resolves the ordered list of order ids the caller wants to fill (order 1
// first, then order 2 for overflow, ...) into their current DB capacity —
// same remainingYard formula as /api/warehouse/orders/search — so the split
// below is computed from fresh data rather than trusting client-side numbers.
async function loadOrderCapacities(orderIdList: number[]) {
  if (orderIdList.length === 0) return []

  const orders = await prisma.astPurchaseOrder.findMany({
    where: { id: { in: orderIdList } },
    select: { id: true, purchaseOrder: true, orderSumYard: true },
  })
  const orderMap = new Map(orders.map(o => [o.id, o]))

  const poNumbers = orders.map(o => o.purchaseOrder).filter((p): p is string => !!p)
  const stats = poNumbers.length > 0
    ? await prisma.fabricOut.groupBy({
        by: ['purchaseOrder'],
        where: { purchaseOrder: { in: poNumbers }, deletedAt: null },
        _sum: { sumYard: true },
      })
    : []
  const deliveredMap = new Map(stats.map(s => [s.purchaseOrder ?? '', Number(s._sum.sumYard ?? 0)]))

  // Preserve the caller's priority order; silently drop ids that no longer resolve.
  return orderIdList
    .map(id => orderMap.get(id))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .map(o => ({
      id: o.id,
      purchaseOrder: o.purchaseOrder ?? '',
      remaining: Number(o.orderSumYard ?? 0) - (deliveredMap.get(o.purchaseOrder ?? '') ?? 0),
    }))
}

// Assigns each roll to an order, filling order 1 to capacity before spilling
// over to order 2, etc. A single roll (ม้วน) is never split across orders —
// once adding a roll would exceed the current order's remaining capacity, the
// whole roll moves to the next order instead. Any yard left over past the
// last order in the list still lands on that last order (no orphaned rows);
// the UI's warning banner is what nudges the user to queue enough orders.
function assignOrders<T extends { yard: number }>(
  rows: T[],
  capacities: { id: number; purchaseOrder: string; remaining: number }[],
) {
  if (capacities.length === 0) {
    return rows.map(r => ({ ...r, orderId: null as number | null, purchaseOrder: null as string | null }))
  }
  let idx = 0
  let usedInCurrent = 0
  return rows.map(r => {
    while (idx < capacities.length - 1 && usedInCurrent + r.yard > capacities[idx].remaining) {
      idx += 1
      usedInCurrent = 0
    }
    usedInCurrent += r.yard
    const cur = capacities[idx]
    return { ...r, orderId: cur.id, purchaseOrder: cur.purchaseOrder || null }
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { vatType, vatNo, customerName, receiveName, orderId, orderIds, purchaseOrder,
          fabricStruct, fabricPattern, fabricW, createDate, yards,
          isDeposit, altFabricStruct, altPurchaseOrder, refId: refIdInput } = body

  if (!vatType || !customerName) {
    return Response.json({ error: 'vatType and customerName are required' }, { status: 400 })
  }
  if (!Array.isArray(yards) || !yards.some((y: string) => parseFloat(y) > 0)) {
    return Response.json({ error: 'At least one yard value is required' }, { status: 400 })
  }

  // caller may pass an existing refId to append more rolls to a bill it
  // already started (e.g. "บันทึกรายการถัดไป" continuing the same delivery);
  // only block as a real duplicate when a different session opened this vatNo.
  const refId = typeof refIdInput === 'string' && refIdInput ? refIdInput : randomUUID()

  const existing = await prisma.fabricOut.findFirst({
    where: { vatType, vatNo: Number(vatNo), deletedAt: null },
    select: { id: true, refId: true },
  })
  if (existing && existing.refId !== refId) {
    return Response.json({ error: `บิล ${vatType}-${vatNo} มีอยู่แล้ว` }, { status: 409 })
  }

  const rows = (yards as string[])
    .map((y, i) => ({ yard: parseFloat(y), slot: i + 1 }))
    .filter(r => r.yard > 0)

  const date = new Date(createDate)

  // orderIds (new, multi-order flow) takes priority; fall back to the legacy
  // single orderId field so any other/older caller keeps working unchanged.
  const orderIdList: number[] = Array.isArray(orderIds) && orderIds.length > 0
    ? orderIds.map((v: unknown) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0)
    : (orderId ? [Number(orderId)] : [])

  try {
    const capacities = await loadOrderCapacities(orderIdList)
    const assigned = assignOrders(rows, capacities)

    await prisma.fabricOut.createMany({
      data: assigned.map(r => ({
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
        orderId: r.orderId,
        // Per-row PO from its assigned order when one was linked; otherwise
        // fall back to the single purchaseOrder string the form submitted.
        purchaseOrder: r.orderId ? r.purchaseOrder : (purchaseOrder || null),
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
          orderId, purchaseOrder, linkOrderId, unlinkOrderId } = body
  if (!vatType || vatNo == null) return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })

  // Multi-order ops target only a subset of this bill's rolls, so linking or
  // unlinking one order never touches the others already on the bill — unlike
  // the legacy `orderId` field below, which replaces every row and stays for
  // the single-order "replace the whole bill's order" UI action.
  if (linkOrderId != null) {
    const order = await prisma.astPurchaseOrder.findUnique({
      where: { id: Number(linkOrderId) },
      select: { purchaseOrder: true },
    })
    // Only rolls not already claimed by another order pick this one up —
    // it's additive, not a replacement.
    const result = await prisma.fabricOut.updateMany({
      where: { vatType, vatNo: Number(vatNo), deletedAt: null, orderId: null },
      data: { orderId: Number(linkOrderId), purchaseOrder: order?.purchaseOrder ?? null },
    })
    return Response.json({ ok: true, count: result.count })
  }
  if (unlinkOrderId != null) {
    const result = await prisma.fabricOut.updateMany({
      where: { vatType, vatNo: Number(vatNo), deletedAt: null, orderId: Number(unlinkOrderId) },
      data: { orderId: null, purchaseOrder: null },
    })
    return Response.json({ ok: true, count: result.count })
  }

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
