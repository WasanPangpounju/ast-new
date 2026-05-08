import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return Response.json({ orders: [] })

  const orders = await prisma.astPurchaseOrder.findMany({
    where: {
      status: 'อนุมัติให้ผลิต',
      OR: [
        { purchaseOrder: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { id: 'desc' },
    take: 10,
    select: {
      id: true,
      purchaseOrder: true,
      customerName: true,
      fabricStructure: true,
      fabricPattern: true,
      fabricId: true,
      orderSumYard: true,
      fabricAst: { select: { fabricW: true, phewW: true } },
    },
  })

  const poNumbers = orders.map(o => o.purchaseOrder).filter((p): p is string => !!p)

  let statsMap = new Map<string, number>()
  if (poNumbers.length > 0) {
    const stats = await prisma.fabricOut.groupBy({
      by: ['purchaseOrder'],
      where: { purchaseOrder: { in: poNumbers }, deletedAt: null },
      _sum: { sumYard: true },
    })
    statsMap = new Map(stats.map(s => [s.purchaseOrder ?? '', Number(s._sum.sumYard ?? 0)]))
  }

  const result = orders.map(o => ({
    id: o.id,
    purchaseOrder: o.purchaseOrder ?? '',
    customerName: o.customerName ?? '',
    fabricStructure: o.fabricStructure ?? '',
    fabricPattern: o.fabricPattern ?? '',
    fabricId: o.fabricId ?? '',
    fabricW: o.fabricAst?.fabricW ?? o.fabricAst?.phewW ?? '',
    orderSumYard: Number(o.orderSumYard ?? 0),
    deliveredYard: statsMap.get(o.purchaseOrder ?? '') ?? 0,
    remainingYard: Number(o.orderSumYard ?? 0) - (statsMap.get(o.purchaseOrder ?? '') ?? 0),
  }))

  return Response.json({ orders: result })
}
