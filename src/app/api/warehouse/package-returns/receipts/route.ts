import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { PackageReturnError, computeReturnStatus, supplierIdsSharingName } from '@/lib/package-return-obligations'
import {
  RETURN_FIELDS,
  columnOf,
  emptyTotals,
  planAllocation,
  type ColumnKey,
  type FieldQty,
} from '@/lib/package-return-columns'
import { bangkokMidnight } from '@/lib/bangkokDate'
import { z } from 'zod'
import type { NextRequest } from 'next/server'

const qtyField = z.number().int().min(0).default(0)

const bodySchema = z.object({
  supplierId: z.number().int().positive(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่คืนต้องเป็น YYYY-MM-DD'),
  note: z.string().optional(),
  palletWood: qtyField,
  palletSteel: qtyField,
  box: qtyField,
  sack: qtyField,
  paperBar: qtyField,
  spoolPaper: qtyField,
  spoolPlastic: qtyField,
  spoolCPaper: qtyField,
  spoolCPlastic: qtyField,
})

interface ObligationRow {
  id: number
  category: string
  variant: string | null
  qtyDue: number
  qtyReturned: number
  createdAt: Date
}

// ─── GET /api/warehouse/package-returns/receipts?supplierId= ─────────────────
// Return history (one row per ใบคืน) for the selected supplier. unspecified* = how much of
// that receipt was allocated to "ไม่ระบุชนิด" obligations, derived from its entries.

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.record')

    const supplierId = parseInt(new URL(request.url).searchParams.get('supplierId') ?? '', 10)
    if (isNaN(supplierId)) return Response.json({ error: 'Invalid supplierId' }, { status: 400 })

    const company = await supplierIdsSharingName(prisma, supplierId)
    if (!company) return Response.json({ error: 'ไม่พบบริษัท' }, { status: 404 })

    const receipts = await prisma.packageReturnReceipt.findMany({
      where: { supplierId: { in: company.ids }, deletedAt: null },
      orderBy: [{ returnDate: 'desc' }, { id: 'desc' }],
      include: {
        entries: {
          where: { deletedAt: null },
          select: { qty: true, obligation: { select: { category: true, variant: true } } },
        },
      },
    })

    const data = receipts.map(({ entries, ...r }) => {
      let unspecifiedSpool = 0
      let unspecifiedPallet = 0
      for (const e of entries) {
        const col = columnOf(e.obligation.category, e.obligation.variant)
        if (col === 'spoolUnspecified') unspecifiedSpool += e.qty
        if (col === 'palletUnspecified') unspecifiedPallet += e.qty
      }
      return { ...r, unspecifiedSpool, unspecifiedPallet }
    })

    return Response.json({ success: true, data })
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/receipts GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

// ─── POST /api/warehouse/package-returns/receipts ────────────────────────────
// Records one ใบคืน and allocates it, oldest obligation first, onto the supplier's open
// MATERIAL_IMPORT obligations: each field first against its own subtype column, the overflow
// of หลอด/พาเลท against "ไม่ระบุชนิด". Any over-return rejects the whole receipt (409).

export async function POST(request: NextRequest) {
  let emp: string | null
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.record')
    emp = session?.user?.name ?? null
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  const { supplierId, returnDate, note, ...rest } = parsed.data
  const qty = Object.fromEntries(RETURN_FIELDS.map((f) => [f.key, rest[f.key]])) as FieldQty

  if (RETURN_FIELDS.every((f) => qty[f.key] === 0)) {
    return Response.json({ error: 'กรุณากรอกจำนวนที่คืนอย่างน้อย 1 ชนิด' }, { status: 400 })
  }

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      const company = await supplierIdsSharingName(tx, supplierId)
      if (!company) throw new PackageReturnError('ไม่พบบริษัท', 404)

      // Locked in id order (same order as receipt cancel) to avoid lock-order deadlocks;
      // FIFO allocation order is applied after, in JS.
      const rows = await tx.$queryRaw<ObligationRow[]>`
        SELECT id, category::text AS category, variant, "qtyDue", "qtyReturned", "createdAt"
        FROM package_return_obligations
        WHERE "supplierId" = ANY(${company.ids}::int[])
          AND "sourceType" = 'MATERIAL_IMPORT'
          AND "needsSupplierAssignment" = false
          AND "deletedAt" IS NULL
          AND "qtyReturned" < "qtyDue"
        ORDER BY id
        FOR UPDATE
      `
      rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)

      const outstanding = emptyTotals()
      for (const r of rows) outstanding[columnOf(r.category, r.variant)] += r.qtyDue - r.qtyReturned

      const { lines, errors } = planAllocation(qty, outstanding)
      if (errors.length > 0) {
        throw new PackageReturnError(`คืนเกินยอดคงค้าง — ${errors.join(' / ')}`, 409)
      }

      const added = new Map<number, number>()
      const take = (col: ColumnKey, amount: number) => {
        for (const r of rows) {
          if (amount <= 0) break
          if (columnOf(r.category, r.variant) !== col) continue
          const already = added.get(r.id) ?? 0
          const n = Math.min(amount, r.qtyDue - r.qtyReturned - already)
          if (n <= 0) continue
          added.set(r.id, already + n)
          amount -= n
        }
      }
      for (const line of lines) {
        take(line.field, line.fromTyped)
        const fallback = RETURN_FIELDS.find((f) => f.key === line.field)?.fallback
        if (fallback) take(fallback, line.fromUnspecified)
      }

      const returnedAt = bangkokMidnight(returnDate)
      const created = await tx.packageReturnReceipt.create({
        data: { supplierId, returnDate: returnedAt, emp, note: note?.trim() || null, ...qty },
      })

      await tx.packageReturnEntry.createMany({
        data: [...added].map(([obligationId, n]) => ({
          obligationId,
          receiptId: created.id,
          qty: n,
          returnedAt,
          emp,
          note: `ใบคืน #${created.id}`,
        })),
      })

      for (const r of rows) {
        const n = added.get(r.id)
        if (!n) continue
        const qtyReturned = r.qtyReturned + n
        await tx.packageReturnObligation.update({
          where: { id: r.id },
          data: { qtyReturned, status: computeReturnStatus(qtyReturned, r.qtyDue) },
        })
      }

      return created
    })

    return Response.json({ success: true, data: receipt }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof PackageReturnError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/receipts POST] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
