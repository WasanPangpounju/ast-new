import { prisma } from '@/lib/prisma'
import { PackageReturnError, computeReturnStatus } from '@/lib/package-return-obligations'
import type { NextRequest } from 'next/server'

type Params = { params: Promise<{ entryId: string }> }

interface ObligationRow {
  id: number
  qtyDue: number
  qtyReturned: number
  deletedAt: Date | null
}

// ─── DELETE /api/warehouse/package-returns/entries/[entryId] ─────────────────
// Cancels a mistakenly-recorded return entry and reverses its effect on the obligation.

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { entryId: entryIdStr } = await params
  const entryId = parseInt(entryIdStr, 10)
  if (isNaN(entryId)) return Response.json({ error: 'Invalid entryId' }, { status: 400 })

  try {
    const result = await prisma.$transaction(async tx => {
      const initialEntry = await tx.packageReturnEntry.findUnique({ where: { id: entryId } })
      if (!initialEntry) throw new PackageReturnError('ไม่พบรายการคืน', 404)

      // Lock the obligation row first — any concurrent cancel of the same entry necessarily
      // targets the same obligationId, so this lock serializes them.
      const rows = await tx.$queryRaw<ObligationRow[]>`
        SELECT id, "qtyDue", "qtyReturned", "deletedAt"
        FROM package_return_obligations
        WHERE id = ${initialEntry.obligationId}
        FOR UPDATE
      `
      const obligation = rows[0]
      if (!obligation) throw new PackageReturnError('ไม่พบรายการค้างคืนที่เกี่ยวข้อง', 404)

      // Re-read the entry now that the obligation is locked — if another cancel already
      // committed while we were waiting for the lock, this reflects that.
      const entry = await tx.packageReturnEntry.findUnique({ where: { id: entryId } })
      if (!entry || entry.deletedAt !== null) {
        throw new PackageReturnError('รายการนี้ถูกยกเลิกไปแล้ว', 409)
      }

      const newQtyReturned = obligation.qtyReturned - entry.qty

      await tx.packageReturnEntry.update({
        where: { id: entryId },
        data: { deletedAt: new Date() },
      })

      await tx.packageReturnObligation.update({
        where: { id: obligation.id },
        data: {
          qtyReturned: newQtyReturned,
          status: computeReturnStatus(newQtyReturned, obligation.qtyDue),
        },
      })

      return { entryId, obligationId: obligation.id, qtyReturned: newQtyReturned }
    })

    return Response.json({ success: true, data: result })
  } catch (err: unknown) {
    if (err instanceof PackageReturnError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/entries/[entryId] DELETE] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
