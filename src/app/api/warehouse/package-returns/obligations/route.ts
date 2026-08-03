import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'
import type { Prisma, PackageReturnSourceType, PackageReturnStatus } from '@/generated/prisma/client/client'
import type { NextRequest } from 'next/server'

const SOURCE_TYPES: PackageReturnSourceType[] = ['MATERIAL_IMPORT', 'MATERIAL_OUTSIDE']
const STATUSES: PackageReturnStatus[] = ['PENDING', 'PARTIALLY_RETURNED', 'RETURNED']

// ─── GET /api/warehouse/package-returns/obligations ──────────────────────────
// List obligations already assigned a counterparty (needsSupplierAssignment=false) —
// the day-to-day "record a return" queue, as opposed to /obligations/needs-supplier
// which is the admin assignment queue. Filters: sourceType, status (default excludes
// RETURNED so the page doesn't drown in fully-closed rows).

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    await requirePermission(session, 'package-returns.record')

    const { searchParams } = new URL(request.url)
    const sourceTypeParam = searchParams.get('sourceType')
    const statusParam = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))

    if (sourceTypeParam && !SOURCE_TYPES.includes(sourceTypeParam as PackageReturnSourceType)) {
      return Response.json({ error: 'Invalid sourceType' }, { status: 400 })
    }
    if (statusParam && !STATUSES.includes(statusParam as PackageReturnStatus)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 })
    }

    const sourceType = sourceTypeParam as PackageReturnSourceType | null
    const status = statusParam as PackageReturnStatus | null

    const where: Prisma.PackageReturnObligationWhereInput = {
      needsSupplierAssignment: false,
      deletedAt: null,
      ...(sourceType ? { sourceType } : {}),
      ...(status ? { status } : { status: { not: 'RETURNED' } }),
    }

    const [obligations, total] = await Promise.all([
      prisma.packageReturnObligation.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          category: true,
          variant: true,
          qtyDue: true,
          qtyReturned: true,
          status: true,
          sourceType: true,
          recipientName: true,
          createdAt: true,
          supplier: { select: { id: true, name: true } },
          material: { select: { id: true, lot: true } },
          materialOutside: { select: { id: true, withdrawId: true } },
        },
      }),
      prisma.packageReturnObligation.count({ where }),
    ])

    return Response.json({
      success: true,
      data: obligations,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[package-returns/obligations GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
