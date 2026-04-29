import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

  // Employee table may be empty; derive suggestions from existing stockFabric emp values
  const empCount = await prisma.employee.count()

  if (empCount > 0) {
    const employees = await prisma.employee.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      take: 20,
      select: { id: true, name: true },
    })
    return Response.json({ employees })
  }

  // Fall back to distinct emp values from stockFabric
  const pattern = `%${q}%`
  const rows = await prisma.$queryRaw<{ emp: string }[]>`
    SELECT DISTINCT emp
    FROM stockfabrics
    WHERE deleted_at IS NULL
      AND emp IS NOT NULL
      AND emp ILIKE ${pattern}
    ORDER BY emp ASC
    LIMIT 20
  `

  const employees = rows.map((r, i) => ({ id: i, name: r.emp }))
  return Response.json({ employees })
}
