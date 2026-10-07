import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'

// ─── GET /api/warehouse/package-returns/supplier-options ─────────────────────
// Supplier picker for the ใบคืน form. Separate from /package-returns/suppliers, which is
// gated by package-returns.assign-supplier (admin queue) rather than .record.

export async function GET() {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.record')

    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    })

    // One option per name — duplicate-named rows are one company to the summary/receipt
    // routes (see supplierIdsSharingName), and the autocomplete keys options by name.
    const seen = new Set<string>()
    const data = suppliers.filter(s => !seen.has(s.name) && seen.add(s.name))

    return Response.json({ success: true, data })
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/supplier-options GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
