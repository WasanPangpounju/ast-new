import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

  const rows = await prisma.material.findMany({
    where: {
      deletedAt: null,
      ...(q ? { supplierName: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: { supplierName: true },
    distinct: ['supplierName'],
    orderBy: { supplierName: 'asc' },
    take: 20,
  })

  return Response.json({ data: rows.map((r) => r.supplierName) })
}
