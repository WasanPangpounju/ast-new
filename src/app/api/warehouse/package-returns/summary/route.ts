import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { supplierIdsSharingName } from '@/lib/package-return-obligations'
import { columnOf, emptyTotals, SUMMARY_COLUMNS, type ColumnTotals } from '@/lib/package-return-columns'
import type { NextRequest } from 'next/server'

// ─── GET /api/warehouse/package-returns/summary?supplierId= ──────────────────
// Per-supplier summary table of the legacy page: นำเข้า / ต้องส่งคืน / คืนแล้ว / คงค้าง.
// นำเข้า = all packaging on that supplier's materials (returnable or not), matched by name
// since Material.supplierName is free text. The other three rows come from the supplier's
// MATERIAL_IMPORT obligations, so they include returns recorded before ใบคืน existed.

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.record')

    const supplierId = parseInt(new URL(request.url).searchParams.get('supplierId') ?? '', 10)
    if (isNaN(supplierId)) return Response.json({ error: 'Invalid supplierId' }, { status: 400 })

    const company = await supplierIdsSharingName(prisma, supplierId)
    if (!company) return Response.json({ error: 'ไม่พบบริษัท' }, { status: 404 })
    const supplier = { id: supplierId, name: company.name }

    const [materialGroups, obligations] = await Promise.all([
      prisma.material.groupBy({
        by: ['spoolType', 'palletType'],
        where: { supplierName: supplier.name, deletedAt: null },
        _sum: { spool: true, pallet: true, box: true, sack: true, paperBar: true },
      }),
      prisma.packageReturnObligation.findMany({
        where: { supplierId: { in: company.ids }, sourceType: 'MATERIAL_IMPORT', needsSupplierAssignment: false, deletedAt: null },
        select: { category: true, variant: true, qtyDue: true, qtyReturned: true },
      }),
    ])

    const imported = emptyTotals()
    for (const g of materialGroups) {
      imported[columnOf('SPOOL', g.spoolType)] += g._sum.spool ?? 0
      imported[columnOf('PALLET', g.palletType)] += g._sum.pallet ?? 0
      imported.box += g._sum.box ?? 0
      imported.sack += g._sum.sack ?? 0
      imported.paperBar += g._sum.paperBar ?? 0
    }

    const due = emptyTotals()
    const returned = emptyTotals()
    for (const o of obligations) {
      const col = columnOf(o.category, o.variant)
      due[col] += o.qtyDue
      returned[col] += o.qtyReturned
    }

    const outstanding = Object.fromEntries(
      SUMMARY_COLUMNS.map((c) => [c.key, due[c.key] - returned[c.key]])
    ) as ColumnTotals

    return Response.json({ success: true, data: { supplier, imported, due, returned, outstanding } })
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/summary GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
