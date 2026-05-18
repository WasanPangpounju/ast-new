import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()
  const supplierName = (params.get('supplierName') ?? '').trim()

  const rows = await prisma.material.findMany({
    where: {
      deletedAt: null,
      ...(supplierName ? { supplierName } : {}),
      ...(q ? { yarnType: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: { yarnType: true },
    distinct: ['yarnType'],
    orderBy: { yarnType: 'asc' },
    take: 20,
  })

  return Response.json({ data: rows.map((r) => r.yarnType) })
}
