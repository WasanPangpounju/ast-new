import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''

  if (q.length < 1) return Response.json({ types: [] })

  const rows = await prisma.fabricAst.findMany({
    where: { stackType: { contains: q, mode: 'insensitive' } },
    select: { stackType: true },
    distinct: ['stackType'],
    orderBy: { stackType: 'asc' },
    take: 10,
  })

  return Response.json({ types: rows.map(r => r.stackType).filter(Boolean) })
}
