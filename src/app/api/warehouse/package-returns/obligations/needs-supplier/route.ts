import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'

// ─── GET /api/warehouse/package-returns/obligations/needs-supplier ───────────
// Queue of obligations awaiting admin supplier assignment (oldest first).

export async function GET() {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.assign-supplier')

    const obligations = await prisma.packageReturnObligation.findMany({
      where: { needsSupplierAssignment: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        category: true,
        variant: true,
        qtyDue: true,
        qtyReturned: true,
        sourceType: true,
        createdAt: true,
        material: { select: { id: true, lot: true, supplierName: true } },
        materialOutside: { select: { id: true, withdrawId: true, supplierName: true } },
      },
    })

    return Response.json({ success: true, data: obligations })
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/obligations/needs-supplier GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
