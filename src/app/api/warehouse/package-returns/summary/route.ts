import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { supplierIdsSharingName } from '@/lib/package-return-obligations'
import { columnOf, emptyTotals, importedTotals, SUMMARY_COLUMNS, type ColumnTotals, type ImportSource } from '@/lib/package-return-columns'
import type { NextRequest } from 'next/server'

// ─── GET /api/warehouse/package-returns/summary?supplierId= ──────────────────
// Per-supplier summary table of the legacy page: นำเข้า / ต้องส่งคืน / คืนแล้ว / คงค้าง.
// นำเข้า = all packaging on that supplier's materials (returnable or not), matched by name
// since Material.supplierName is free text; materials from the legacy system carry no subtype,
// so theirs comes from the legacy packageasts import row (see importedTotals) — read-only.
// The other three rows come from the supplier's
// MATERIAL_IMPORT obligations, so they include returns recorded before ใบคืน existed.

interface LegacyCols {
  lSpool: number | null
  lSpoolType: string | null
  lPallet: number | null
  lPalletType: string | null
  lSack: number | null
  lSackType: string | null
  lPartition: number | null
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.record')

    const supplierId = parseInt(new URL(request.url).searchParams.get('supplierId') ?? '', 10)
    if (isNaN(supplierId)) return Response.json({ error: 'Invalid supplierId' }, { status: 400 })

    const company = await supplierIdsSharingName(prisma, supplierId)
    if (!company) return Response.json({ error: 'ไม่พบบริษัท' }, { status: 404 })
    const supplier = { id: supplierId, name: company.name }

    const [materialRows, obligations] = await Promise.all([
      prisma.$queryRaw<(Omit<ImportSource, 'legacy'> & LegacyCols & { legacyId: number | null })[]>`
        SELECT m.spool, m.pallet, m.box, m.sack, m."paperBar", m."spoolType", m."palletType", m."sackType",
               pa.id AS "legacyId", pa.spool AS "lSpool", pa."spoolType" AS "lSpoolType", pa.pallet AS "lPallet",
               pa."palletType" AS "lPalletType", pa.sack AS "lSack", pa."sackType" AS "lSackType", pa.partition AS "lPartition"
          FROM materials m
          LEFT JOIN (
            SELECT DISTINCT ON (ref_id) * FROM packageasts WHERE "packageStatus" = 'packageImport' ORDER BY ref_id, id
          ) pa ON pa.ref_id = m.id
         WHERE m."supplierName" = ${supplier.name} AND m."deletedAt" IS NULL
      `,
      prisma.packageReturnObligation.findMany({
        where: { supplierId: { in: company.ids }, sourceType: 'MATERIAL_IMPORT', needsSupplierAssignment: false, deletedAt: null },
        select: { category: true, variant: true, qtyDue: true, qtyReturned: true },
      }),
    ])

    const imported = importedTotals(
      materialRows.map((m) => ({
        spool: m.spool, pallet: m.pallet, box: m.box, sack: m.sack, paperBar: m.paperBar,
        spoolType: m.spoolType, palletType: m.palletType, sackType: m.sackType,
        legacy: m.legacyId == null ? null : {
          spool: m.lSpool, spoolType: m.lSpoolType, pallet: m.lPallet, palletType: m.lPalletType,
          sack: m.lSack, sackType: m.lSackType, partition: m.lPartition,
        },
      }))
    )

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
