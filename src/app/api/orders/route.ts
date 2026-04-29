import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 20
  const search = searchParams.get('search') ?? ''

  const where = search ? {
    OR: [
      { customerName: { contains: search, mode: 'insensitive' as const } },
      { purchaseOrder: { contains: search, mode: 'insensitive' as const } },
      { fabricPattern: { contains: search, mode: 'insensitive' as const } },
    ],
  } : {}

  const [orders, total] = await Promise.all([
    prisma.astPurchaseOrder.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { fabricAstStructure: { select: { yarnWRatio2: true } } },
    }),
    prisma.astPurchaseOrder.count({ where }),
  ])

  return Response.json({ orders, total, page, limit })
}
