import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''

  if (q.length < 1) return Response.json({ customers: [] })

  const customers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { tax: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, tax: true, tel: true },
    orderBy: { name: 'asc' },
    take: 15,
  })

  return Response.json({ customers })
}
