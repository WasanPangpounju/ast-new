import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

  const rows = await prisma.materialRequisition.findMany({
    where: {
      deletedAt: null,
      department: q ? { contains: q, mode: 'insensitive' } : undefined,
    },
    select: { department: true },
    distinct: ['department'],
    orderBy: { department: 'asc' },
    take: 20,
  })

  return Response.json({ data: rows.map((r) => r.department) })
}
