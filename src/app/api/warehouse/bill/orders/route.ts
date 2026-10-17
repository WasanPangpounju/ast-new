import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BILL_AUDIT_TABLE, billRecordKey } from '@/lib/billAudit'
import { assignOrdersWholeRoll, loadOrderCapacities } from '@/lib/billOrders'
import type { Prisma } from '@/generated/prisma/client/client'
import type { NextRequest } from 'next/server'

const FIELD_NAME = 'orders'

interface RollRef {
  id: number
  yard: number
  orderId: number | null
  purchaseOrder: string | null
}

// How a bill's rolls are spread across its orders, in fill order (the order
// whose first roll comes earliest is order 1) — the shape stored in the audit
// log and shown in the "จัดการ" modal.
function summarize(rolls: RollRef[]) {
  const map = new Map<number, { orderId: number; purchaseOrder: string | null; rolls: number; yard: number }>()
  for (const r of rolls) {
    if (r.orderId == null) continue
    const s = map.get(r.orderId) ?? { orderId: r.orderId, purchaseOrder: r.purchaseOrder, rolls: 0, yard: 0 }
    s.rolls += 1
    s.yard += r.yard
    map.set(r.orderId, s)
  }
  return [...map.values()]
}

async function loadRolls(db: Prisma.TransactionClient, vatType: string, vatNo: number): Promise<RollRef[]> {
  const rows = await db.fabricOut.findMany({
    where: { vatType, vatNo, deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, sumYard: true, orderId: true, purchaseOrder: true },
  })
  return rows.map(r => ({ id: r.id, yard: Number(r.sumYard ?? 0), orderId: r.orderId, purchaseOrder: r.purchaseOrder }))
}

// GET — capacity of orders for re-linking this bill (แท็บออร์เดอร์ ใน modal จัดการ).
// No `ids` → the orders currently linked, in fill order. `ids=1,2` → those orders.
// remainingYard leaves this bill's own rolls out, since saving reassigns them.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const vatType = sp.get('vatType')
  const vatNo = Number(sp.get('vatNo'))
  if (!vatType || !Number.isFinite(vatNo)) {
    return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })
  }

  const rolls = await loadRolls(prisma, vatType, vatNo)
  const current = summarize(rolls)
  const idsParam = sp.get('ids')
  const ids = idsParam
    ? idsParam.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0)
    : current.map(c => c.orderId)

  const capacities = await loadOrderCapacities(prisma, ids, { vatType, vatNo })
  const currentMap = new Map(current.map(c => [c.orderId, c]))

  return Response.json({
    billYard: rolls.reduce((s, r) => s + r.yard, 0),
    // Per-roll yards in fill order, so the modal can preview the split with
    // the same assignOrdersWholeRoll the PATCH below uses.
    rollYards: rolls.map(r => r.yard),
    orders: capacities.map(c => ({
      id: c.id,
      purchaseOrder: c.purchaseOrder,
      remainingYard: c.remaining,
      billRolls: currentMap.get(c.id)?.rolls ?? 0,
      billYard: currentMap.get(c.id)?.yard ?? 0,
    })),
  })
}

// PATCH — re-link this bill's rolls to an ordered list of orders, filling
// order 1 first then spilling over (same as เปิดบิลผ้า), but whole rolls only
// so the bill's fold count / printed layout never changes. [] unlinks all.
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { vatType, orderIds } = body
  const vatNo = Number(body.vatNo)
  if (!vatType || !Number.isFinite(vatNo) || !Array.isArray(orderIds)) {
    return Response.json({ error: 'vatType, vatNo and orderIds required' }, { status: 400 })
  }
  const ids = [...new Set(orderIds.map(Number))]
  if (ids.some(n => !Number.isInteger(n) || n <= 0)) {
    return Response.json({ error: 'orderIds must be positive integers' }, { status: 400 })
  }

  const after = await prisma.$transaction(async (tx) => {
    const rolls = await loadRolls(tx, vatType, vatNo)
    if (rolls.length === 0) throw new BillNotFoundError()
    const before = summarize(rolls)

    const capacities = await loadOrderCapacities(tx, ids, { vatType, vatNo })
    if (capacities.length !== ids.length) throw new OrderNotFoundError()

    const assigned = assignOrdersWholeRoll(rolls.map(r => ({ id: r.id, yard: r.yard })), capacities)

    // One updateMany per target order, touching only rolls whose order changes.
    const groups = new Map<string, { orderId: number | null; purchaseOrder: string | null; ids: number[] }>()
    assigned.forEach((a, i) => {
      if (rolls[i].orderId === a.orderId && (a.orderId == null ? rolls[i].purchaseOrder == null : rolls[i].purchaseOrder === a.purchaseOrder)) return
      const key = String(a.orderId)
      const g = groups.get(key) ?? { orderId: a.orderId, purchaseOrder: a.purchaseOrder, ids: [] }
      g.ids.push(a.id)
      groups.set(key, g)
    })
    for (const g of groups.values()) {
      await tx.fabricOut.updateMany({
        where: { id: { in: g.ids } },
        data: { orderId: g.orderId, purchaseOrder: g.purchaseOrder },
      })
    }

    const result = summarize(assigned)
    if (groups.size > 0) {
      await tx.auditLog.create({
        data: {
          tableName: BILL_AUDIT_TABLE,
          recordKey: billRecordKey(vatType, vatNo),
          fieldName: FIELD_NAME,
          oldValue: JSON.stringify(before),
          newValue: JSON.stringify(result),
          changedBy: session.user?.email ?? session.user?.name ?? 'unknown',
        },
      })
    }
    return result
  }).catch((err: unknown) => {
    if (err instanceof OrderNotFoundError) return null
    if (err instanceof BillNotFoundError) return 'no-bill' as const
    throw err
  })

  if (after === 'no-bill') return Response.json({ error: `ไม่พบบิล ${vatType}-${vatNo}` }, { status: 404 })
  if (!after) return Response.json({ error: 'ไม่พบออร์เดอร์บางรายการ' }, { status: 400 })
  return Response.json({ ok: true, orders: after.map(o => ({ orderId: o.orderId, purchaseOrder: o.purchaseOrder })) })
}

class OrderNotFoundError extends Error {}
class BillNotFoundError extends Error {}
