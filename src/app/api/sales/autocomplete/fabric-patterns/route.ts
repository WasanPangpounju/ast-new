import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''

  if (q.length < 1) return Response.json({ patterns: [] })

  const orders = await prisma.astPurchaseOrder.findMany({
    where: { deletedAt: null, fabricPattern: { contains: q, mode: 'insensitive' } },
    select: { fabricPattern: true },
    distinct: ['fabricPattern'],
    orderBy: { fabricPattern: 'asc' },
    take: 10,
  })

  return Response.json({ patterns: orders.map(o => o.fabricPattern).filter(Boolean) })
}
