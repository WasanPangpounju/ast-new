// Shared order-capacity + roll→order assignment helpers for fabricouts bills —
// used by api/warehouse/bill (POST, bill/create) and api/warehouse/bill/orders
// (re-linking orders on an existing bill from the "จัดการ" modal).
import type { Prisma } from '@/generated/prisma/client/client'

export interface OrderCapacity {
  id: number
  purchaseOrder: string
  remaining: number
}

// Resolves the ordered list of order ids the caller wants to fill (order 1
// first, then order 2 for overflow, ...) into their current DB capacity —
// same remainingYard formula as /api/warehouse/orders/search — so the split
// is computed from fresh data rather than trusting client-side numbers.
//
// `excludeBill` leaves one bill's own rolls out of "delivered", for re-linking
// an existing bill: its rolls are about to be reassigned, so counting them
// against the orders they're currently on would double-count them.
export async function loadOrderCapacities(
  tx: Prisma.TransactionClient,
  orderIdList: number[],
  excludeBill?: { vatType: string; vatNo: number },
): Promise<OrderCapacity[]> {
  if (orderIdList.length === 0) return []

  const orders = await tx.astPurchaseOrder.findMany({
    where: { id: { in: orderIdList } },
    select: { id: true, purchaseOrder: true, orderSumYard: true },
  })
  const orderMap = new Map(orders.map(o => [o.id, o]))

  const poNumbers = orders.map(o => o.purchaseOrder).filter((p): p is string => !!p)
  const stats = poNumbers.length > 0
    ? await tx.fabricOut.groupBy({
        by: ['purchaseOrder'],
        where: {
          purchaseOrder: { in: poNumbers },
          deletedAt: null,
          ...(excludeBill ? { NOT: { vatType: excludeBill.vatType, vatNo: excludeBill.vatNo } } : {}),
        },
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
// over to order 2, etc. A roll (ม้วน) that would push the running total past
// the current order's remaining capacity gets split at the crossing point:
// the portion that still fits stays on the current order, and the excess
// carries onto the next order as a second row for the same roll — so a roll
// can straddle two (or more) orders' yard totals without ever letting an
// order's delivered yard exceed its remaining capacity by a fraction of a
// roll. Any yard left over past the last order in the list still lands on
// that last order (no orphaned rows); the UI's warning banner is what nudges
// the user to queue enough orders.
export function assignOrders<T extends { yard: number }>(rows: T[], capacities: OrderCapacity[]) {
  if (capacities.length === 0) {
    return rows.map(r => ({ ...r, orderId: null as number | null, purchaseOrder: null as string | null }))
  }
  let idx = 0
  let usedInCurrent = 0
  const out: (T & { orderId: number | null; purchaseOrder: string | null })[] = []
  for (const r of rows) {
    let left = r.yard
    // Peel off exactly what fits in each order this roll overflows past,
    // advancing to the next order only once the current one is exactly full.
    while (idx < capacities.length - 1 && usedInCurrent + left > capacities[idx].remaining) {
      const cur = capacities[idx]
      const portion = Math.max(0, cur.remaining - usedInCurrent)
      if (portion > 0) {
        out.push({ ...r, yard: portion, orderId: cur.id, purchaseOrder: cur.purchaseOrder || null })
      }
      left -= portion
      idx += 1
      usedInCurrent = 0
    }
    if (left > 0) {
      usedInCurrent += left
      const cur = capacities[idx]
      out.push({ ...r, yard: left, orderId: cur.id, purchaseOrder: cur.purchaseOrder || null })
    }
  }
  return out
}

// Same fill order as assignOrders, but never splits a roll: each roll goes
// wholly to the order whose capacity it starts in, so an order can end up
// over by at most part of one roll. Used when re-linking an existing bill —
// splitting there would add rows, changing the bill's fold count and its
// printed layout after it may already have gone out to the customer.
export function assignOrdersWholeRoll<T extends { yard: number }>(rows: T[], capacities: OrderCapacity[]) {
  if (capacities.length === 0) {
    return rows.map(r => ({ ...r, orderId: null as number | null, purchaseOrder: null as string | null }))
  }
  let idx = 0
  let usedInCurrent = 0
  return rows.map(r => {
    // Advance past every order that's already full before this roll starts.
    while (idx < capacities.length - 1 && usedInCurrent >= capacities[idx].remaining) {
      idx += 1
      usedInCurrent = 0
    }
    usedInCurrent += r.yard
    const cur = capacities[idx]
    return { ...r, orderId: cur.id as number | null, purchaseOrder: (cur.purchaseOrder || null) as string | null }
  })
}
