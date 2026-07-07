import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

  const rows = await prisma.fabricOut.findMany({
    where: {
      deletedAt: null,
      altPurchaseOrder: q
        ? { contains: q, mode: 'insensitive' }
        : { not: null },
    },
    select: { altPurchaseOrder: true },
    distinct: ['altPurchaseOrder'],
    orderBy: { altPurchaseOrder: 'asc' },
    take: 20,
  })

  return Response.json({ data: rows.map((r) => r.altPurchaseOrder) })
}
