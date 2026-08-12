import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const yarnType    = (params.get('yarnType')    ?? '').trim()
  const supplierName = (params.get('supplierName') ?? '').trim()
  const q           = (params.get('q')           ?? '').trim()

  const rows = await prisma.material.findMany({
    where: {
      deletedAt: null,
      ...(yarnType    ? { yarnType }    : {}),
      ...(supplierName ? { supplierName } : {}),
      ...(q ? { lot: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: { lot: true },
    distinct: ['lot'],
    orderBy: { lot: 'asc' },
    take: 20,
  })

  return Response.json({ data: rows.map((r) => r.lot) })
}
