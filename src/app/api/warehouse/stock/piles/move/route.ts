import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { NC, sameFabric, stockRowsWhere, type StockGroupRef } from '@/lib/fabricOutMatch'

const STOCK_AUDIT_TABLE = 'stockfabrics'

class MoveError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

// POST — ย้ายกอง: move whole lots (refId batches) out of one displayed stock row into
// another group with the same struct + pattern + width (normalized). Cross-customer is
// allowed: moved rows take the destination's customer. "ใช้ไป" (bills) stays where it
// is — re-point a bill via จัดการบิล → ตัดสต็อก.
//   { refIds: string[],
//     from: { pileId: number|null, customer, fabricStruct, fabricPattern, fabricW },
//     to:   { pileId: number } | { pileId: null, customer: string } }
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const refIds: string[] = Array.isArray(body.refIds) ? [...new Set<string>(body.refIds.map(String))] : []
  const from = body.from as (StockGroupRef & { pileId: number | null }) | undefined
  const to = body.to as { pileId: number | null; customer?: string } | undefined
  if (refIds.length === 0 || !from || !to) {
    return Response.json({ error: 'refIds, from and to required' }, { status: 400 })
  }
  const fromPileId = from.pileId == null ? null : Number(from.pileId)
  const toPileId = to.pileId == null ? null : Number(to.pileId)
  const changedBy = session.user?.email ?? session.user?.name ?? 'unknown'

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Destination: a live pile with the same fabric, or a customer's กองหลัก
      let destCustomer: string
      let destName: string | null = null
      if (toPileId != null) {
        const [pile] = await tx.$queryRawUnsafe<{ name: string; customer: string }[]>(`
          SELECT p.name, ${NC('p.customer')} AS customer FROM stock_piles p
          WHERE p.id = ${toPileId} AND p.deleted_at IS NULL AND ${sameFabric(from, 'p')}
        `)
        if (!pile) throw new MoveError('ไม่พบกองปลายทาง หรือโครงสร้าง/ลาย/หน้ากว้างไม่ตรงกัน', 400)
        destCustomer = pile.customer
        destName = pile.name
      } else {
        destCustomer = String(to.customer ?? '').trim()
        if (!destCustomer) throw new MoveError('กรุณาเลือกกองปลายทาง', 400)
      }

      let fromName: string | null = null
      if (fromPileId != null) {
        const pile = await tx.stockPile.findUnique({ where: { id: fromPileId }, select: { name: true } })
        fromName = pile?.name ?? null
      }

      // Lock in the rows: only this displayed row's lots, nothing else sharing the refId
      const rows = await tx.$queryRawUnsafe<{ id: number; refId: string; customer: string | null; sumYard: number | null }[]>(`
        SELECT s.id, s."refId", s.customer, s."sumYard"
        FROM stockfabrics s
        WHERE s.deleted_at IS NULL
          AND s."refId" = ANY($1::text[])
          AND ${stockRowsWhere(from, fromPileId, 's')}
        FOR UPDATE
      `, refIds)
      if (rows.length === 0) throw new MoveError('ไม่พบล็อตที่เลือกในกองนี้', 404)
      const sameMain = fromPileId == null && toPileId == null
        && destCustomer.replace(/\s/g, '') === (from.customer || 'AST').replace(/\s/g, '')
      if ((fromPileId === toPileId && fromPileId != null) || sameMain) {
        throw new MoveError('กองต้นทางและปลายทางเป็นกองเดียวกัน', 400)
      }

      const ids = rows.map(r => r.id)
      await tx.stockFabric.updateMany({
        where: { id: { in: ids } },
        data: { stockPileId: toPileId, customer: destCustomer },
      })

      // One history row per lot (refId)
      const byRef = new Map<string, { rows: number; yard: number; customer: string | null }>()
      for (const r of rows) {
        const g = byRef.get(r.refId) ?? { rows: 0, yard: 0, customer: r.customer }
        g.rows += 1
        g.yard += Number(r.sumYard ?? 0)
        byRef.set(r.refId, g)
      }
      await tx.auditLog.createMany({
        data: [...byRef.entries()].map(([refId, g]) => ({
          tableName: STOCK_AUDIT_TABLE,
          recordKey: refId,
          fieldName: 'stockPile',
          oldValue: JSON.stringify({ pileId: fromPileId, pileName: fromName, customer: g.customer, rows: g.rows, yard: g.yard }),
          newValue: JSON.stringify({ pileId: toPileId, pileName: destName, customer: destCustomer, rows: g.rows, yard: g.yard }),
          changedBy,
        })),
      })
      return { moved: rows.length, lots: byRef.size }
    })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof MoveError) return Response.json({ error: err.message }, { status: err.status })
    console.error('[stock/piles/move]', err)
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
