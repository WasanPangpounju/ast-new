import { prisma } from '@/lib/prisma'
import { PackageReturnError } from '@/lib/package-return-obligations'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { z } from 'zod'
import type { NextRequest } from 'next/server'

type Params = { params: Promise<{ obligationId: string }> }

const bodySchema = z.object({
  supplierId: z.number().int().positive(),
})

interface ObligationRow {
  id: number
  needsSupplierAssignment: boolean
  deletedAt: Date | null
}

// ─── PATCH /api/warehouse/package-returns/obligations/[obligationId]/supplier ─
// Admin assigns a supplier to an obligation that was created without one.

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.assign-supplier')
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

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
  const { supplierId } = parsed.data

  try {
    const obligation = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<ObligationRow[]>`
        SELECT id, "needsSupplierAssignment", "deletedAt"
        FROM package_return_obligations
        WHERE id = ${obligationId}
        FOR UPDATE
      `
      const existing = rows[0]
      if (!existing || existing.deletedAt !== null) {
        throw new PackageReturnError('ไม่พบรายการค้างคืน', 404)
      }
      if (!existing.needsSupplierAssignment) {
        throw new PackageReturnError('รายการนี้ถูก assign supplier ไปแล้ว', 409)
      }

      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, deletedAt: null },
        select: { id: true },
      })
      if (!supplier) throw new PackageReturnError('ไม่พบซัพพลายเออร์นี้ในระบบ', 400)

      return tx.packageReturnObligation.update({
        where: { id: obligationId },
        data: { supplierId, needsSupplierAssignment: false },
      })
    })

    return Response.json({ success: true, data: obligation })
  } catch (err: unknown) {
    if (err instanceof PackageReturnError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/obligations/[obligationId]/supplier PATCH] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
