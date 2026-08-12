import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// รวมรายชื่อพนักงานจากทั้งฝั่งนำเข้า (Material.emp) และฝั่งเบิก (MaterialRequisition.emp)
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()

  const [fromMaterial, fromRequisition] = await Promise.all([
    prisma.material.findMany({
      where: {
        deletedAt: null,
        emp: q ? { contains: q, mode: 'insensitive' } : { not: null },
      },
      select: { emp: true },
      distinct: ['emp'],
      take: 20,
    }),
    prisma.materialRequisition.findMany({
      where: {
        deletedAt: null,
        emp: q ? { contains: q, mode: 'insensitive' } : { not: null },
      },
      select: { emp: true },
      distinct: ['emp'],
      take: 20,
    }),
  ])

  const names = new Set<string>()
  for (const r of fromMaterial) if (r.emp) names.add(r.emp)
  for (const r of fromRequisition) if (r.emp) names.add(r.emp)

  return Response.json({ data: Array.from(names).sort((a, b) => a.localeCompare(b)).slice(0, 20) })
}
