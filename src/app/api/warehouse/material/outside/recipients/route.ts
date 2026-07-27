import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

  const rows = await prisma.materialOutside.findMany({
    where: {
      deletedAt: null,
      recipient: q ? { contains: q, mode: 'insensitive' } : { not: null },
    },
    select: { recipient: true },
    distinct: ['recipient'],
    orderBy: { recipient: 'asc' },
    take: 20,
  })

  return Response.json({ data: rows.map((r) => r.recipient).filter((r): r is string => !!r) })
}
