import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()

  if (!q) {
    return Response.json({ data: [] })
  }

  const [yarnTypes, suppliers] = await Promise.all([
    prisma.material.findMany({
      where: { deletedAt: null, yarnType: { contains: q, mode: 'insensitive' } },
      select: { yarnType: true },
      distinct: ['yarnType'],
      orderBy: { yarnType: 'asc' },
      take: 10,
    }),
    prisma.material.findMany({
      where: { deletedAt: null, supplierName: { contains: q, mode: 'insensitive' } },
      select: { supplierName: true },
      distinct: ['supplierName'],
      orderBy: { supplierName: 'asc' },
      take: 10,
    }),
  ])

  return Response.json({
    data: [
      ...yarnTypes.map((r) => ({ value: r.yarnType, type: 'yarnType' as const })),
      ...suppliers.map((r) => ({ value: r.supplierName, type: 'company' as const })),
    ],
  })
}
