import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { PackageReturnError, computeReturnStatus } from '@/lib/package-return-obligations'
import type { NextRequest } from 'next/server'

type Params = { params: Promise<{ receiptId: string }> }

interface ObligationRow {
  id: number
  qtyDue: number
  qtyReturned: number
}

// ─── DELETE /api/warehouse/package-returns/receipts/[receiptId] ──────────────
// Cancels a whole ใบคืน: soft-deletes the receipt and every entry it allocated, and reverses
// those quantities on the obligations (same effect as cancelling each entry individually).

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.record')
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  const { receiptId: receiptIdStr } = await params
  const receiptId = parseInt(receiptIdStr, 10)
  if (isNaN(receiptId)) return Response.json({ error: 'Invalid receiptId' }, { status: 400 })

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the receipt first so two concurrent cancels of the same receipt serialize here.
      const receipts = await tx.$queryRaw<{ deletedAt: Date | null }[]>`
        SELECT "deletedAt" FROM package_return_receipts WHERE id = ${receiptId} FOR UPDATE
      `
      if (receipts.length === 0) throw new PackageReturnError('ไม่พบใบคืน', 404)
      if (receipts[0].deletedAt !== null) throw new PackageReturnError('ใบคืนนี้ถูกยกเลิกไปแล้ว', 409)

      const entries = await tx.packageReturnEntry.findMany({
        where: { receiptId, deletedAt: null },
        select: { obligationId: true, qty: true },
      })
      const reverse = new Map<number, number>()
      for (const e of entries) reverse.set(e.obligationId, (reverse.get(e.obligationId) ?? 0) + e.qty)

      if (reverse.size > 0) {
        const rows = await tx.$queryRaw<ObligationRow[]>`
          SELECT id, "qtyDue", "qtyReturned"
          FROM package_return_obligations
          WHERE id = ANY(${[...reverse.keys()]}::int[])
          ORDER BY id
          FOR UPDATE
        `
        for (const r of rows) {
          const qtyReturned = r.qtyReturned - (reverse.get(r.id) ?? 0)
          await tx.packageReturnObligation.update({
            where: { id: r.id },
            data: { qtyReturned, status: computeReturnStatus(qtyReturned, r.qtyDue) },
          })
        }
      }

      const now = new Date()
      await tx.packageReturnEntry.updateMany({ where: { receiptId, deletedAt: null }, data: { deletedAt: now } })
      await tx.packageReturnReceipt.update({ where: { id: receiptId }, data: { deletedAt: now } })
    })

    return Response.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof PackageReturnError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/receipts/[receiptId] DELETE] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
