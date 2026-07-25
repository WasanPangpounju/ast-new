import { prisma } from '@/lib/prisma'
import { PackageReturnError, computeReturnStatus } from '@/lib/package-return-obligations'
import { z } from 'zod'
import type { NextRequest } from 'next/server'

type Params = { params: Promise<{ obligationId: string }> }

const bodySchema = z.object({
  qty: z.number().int().positive(),
  emp: z.string().optional(),
  note: z.string().optional(),
})

interface ObligationRow {
  id: number
  qtyDue: number
  qtyReturned: number
  deletedAt: Date | null
}

// ─── POST /api/warehouse/package-returns/obligations/[obligationId]/entries ──

export async function POST(request: NextRequest, { params }: Params) {
  const { obligationId: obligationIdStr } = await params
  const obligationId = parseInt(obligationIdStr, 10)
  if (isNaN(obligationId)) return Response.json({ error: 'Invalid obligationId' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  const { qty, emp, note } = parsed.data

  try {
    const entry = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<ObligationRow[]>`
        SELECT id, "qtyDue", "qtyReturned", "deletedAt"
        FROM package_return_obligations
        WHERE id = ${obligationId}
        FOR UPDATE
      `
      const obligation = rows[0]
      if (!obligation || obligation.deletedAt !== null) {
        throw new PackageReturnError('ไม่พบรายการค้างคืน', 404)
      }

      const newQtyReturned = obligation.qtyReturned + qty
      if (newQtyReturned > obligation.qtyDue) {
        const remaining = obligation.qtyDue - obligation.qtyReturned
        throw new PackageReturnError(
          `คืนได้สูงสุด ${obligation.qtyDue} ชิ้น ค้างคืนอยู่ ${remaining} ชิ้น`,
          409
        )
      }

      const createdEntry = await tx.packageReturnEntry.create({
        data: {
          obligationId,
          qty,
          emp: emp || null,
          note: note || null,
        },
      })

      await tx.packageReturnObligation.update({
        where: { id: obligationId },
        data: {
          qtyReturned: newQtyReturned,
          status: computeReturnStatus(newQtyReturned, obligation.qtyDue),
        },
      })

      return createdEntry
    })

    return Response.json({ success: true, data: entry }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof PackageReturnError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/obligations/[obligationId]/entries POST] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
