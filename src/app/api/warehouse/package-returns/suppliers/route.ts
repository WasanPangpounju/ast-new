import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'

// ─── GET /api/warehouse/package-returns/suppliers ────────────────────────────
// Full (non-paginated) supplier list to back the needs-supplier assignment dropdown.
// /api/sales/suppliers is capped at 20/page for its own admin UI, not a fit for a picker.

export async function GET() {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.assign-supplier')

    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })

    return Response.json({ success: true, data: suppliers })
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/suppliers GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
