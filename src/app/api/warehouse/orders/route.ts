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
  const customer = searchParams.get('customer') ?? ''
  const fabricId = searchParams.get('fabricId') ?? ''
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo = searchParams.get('dateTo') ?? ''

  const where: any = { AND: [] }
  if (search) {
    where.AND.push({
      OR: [
        { purchaseOrder: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { fabricPattern: { contains: search, mode: 'insensitive' } },
      ]
    })
  }
  if (customer) where.AND.push({ customerName: { contains: customer, mode: 'insensitive' } })
  if (fabricId) where.AND.push({ fabricId: { contains: fabricId, mode: 'insensitive' } })
  if (dateFrom) where.AND.push({ createdAt: { gte: new Date(dateFrom) } })
  if (dateTo) where.AND.push({ createdAt: { lte: new Date(dateTo + 'T23:59:59') } })
  if (where.AND.length === 0) delete where.AND

  const [orders, total] = await Promise.all([
    prisma.astPurchaseOrder.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        fabricAst: {
          select: { fabricW: true, phewW: true }
        },
        fabricAstStructure: {
          select: {
            yarnWRatio2: true,
            yarnHType: true,
            yarnWType: true,
            yarnHCount1: true,
            yarnWCount1: true,
          }
        },
      }
    }),
    prisma.astPurchaseOrder.count({ where })
  ])

  const poNumbers = orders.map(o => o.purchaseOrder)
  const deliveryStats = await prisma.fabricOut.groupBy({
    by: ['purchaseOrder'],
    where: { purchaseOrder: { in: poNumbers }, deletedAt: null },
    _sum: { sumYard: true },
    _count: { id: true },
  })
  const statsMap = new Map(deliveryStats.map(s => [s.purchaseOrder, {
    deliveredYard: Number(s._sum.sumYard ?? 0),
    deliveredFold: s._count.id,
  }]))

  const ordersWithStats = orders.map(o => {
    const stats = statsMap.get(o.purchaseOrder) ?? { deliveredYard: 0, deliveredFold: 0 }
    const deliveredYard = stats.deliveredYard
    const deliveredFold = stats.deliveredFold
    const remainingYard = (Number(o.orderSumYard) || 0) - deliveredYard
    return {
      ...o,
      deliveredYard,
      deliveredFold,
      remainingYard,
    }
  })

  return Response.json({ orders: ordersWithStats, total, page, limit })
}
