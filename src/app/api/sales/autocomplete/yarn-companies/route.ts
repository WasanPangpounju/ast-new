import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''

  if (q.length < 1) return Response.json({ companies: [] })

  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null, name: { contains: q, mode: 'insensitive' } },
    select: { name: true },
    orderBy: { name: 'asc' },
    take: 20,
  })

  return Response.json({ companies: suppliers.map(s => s.name) })
}
