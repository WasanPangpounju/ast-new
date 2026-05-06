import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''

  if (q.length < 1) return Response.json({ companies: [] })

  const [customers, suppliers] = await Promise.all([
    prisma.customer.findMany({
      where: { deletedAt: null, name: { contains: q, mode: 'insensitive' } },
      select: { name: true },
      take: 10,
    }),
    prisma.supplier.findMany({
      where: { deletedAt: null, name: { contains: q, mode: 'insensitive' } },
      select: { name: true },
      take: 10,
    }),
  ])

  const seen = new Set<string>()
  const companies: string[] = []
  for (const { name } of [...customers, ...suppliers]) {
    if (!seen.has(name)) { seen.add(name); companies.push(name) }
  }
  return Response.json({ companies: companies.slice(0, 20) })
}
