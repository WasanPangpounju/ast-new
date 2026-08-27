import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  const field = request.nextUrl.searchParams.get('field')
  if (!q) return Response.json({ data: [] })

  if (field === 'receiveName') {
    const receivers = await prisma.fabricOut.findMany({
      where: { deletedAt: null, receiveName: { contains: q, mode: 'insensitive' } },
      select: { receiveName: true },
      distinct: ['receiveName'],
      orderBy: { receiveName: 'asc' },
      take: 10,
    })
    return Response.json({ data: receivers.map((r) => r.receiveName).filter((v): v is string => !!v) })
  }

  // ผู้สั่ง (Order by): รวมชื่อลูกค้าจาก customers table (เดิม)
  // กับชื่อผู้สั่งที่เคยบันทึกไว้ใน fabricouts.customerName ตอนเปิดบิลผ้าก่อนหน้า (ใหม่)
  if (field === 'customerName') {
    const [customers, orderers] = await Promise.all([
      prisma.customer.findMany({
        where: { deletedAt: null, name: { contains: q, mode: 'insensitive' } },
        select: { name: true },
        orderBy: { name: 'asc' },
        take: 10,
      }),
      prisma.fabricOut.findMany({
        where: { deletedAt: null, customerName: { contains: q, mode: 'insensitive' } },
        select: { customerName: true },
        distinct: ['customerName'],
        orderBy: { customerName: 'asc' },
        take: 10,
      }),
    ])
    const merged = Array.from(
      new Set(
        [...customers.map((c) => c.name), ...orderers.map((o) => o.customerName)].filter(
          (v): v is string => !!v,
        ),
      ),
    ).slice(0, 10)
    return Response.json({ data: merged })
  }

  const [customers, receivers] = await Promise.all([
    prisma.fabricOut.findMany({
      where: { deletedAt: null, customerName: { contains: q, mode: 'insensitive' } },
      select: { customerName: true },
      distinct: ['customerName'],
      orderBy: { customerName: 'asc' },
      take: 10,
    }),
    prisma.fabricOut.findMany({
      where: { deletedAt: null, receiveName: { contains: q, mode: 'insensitive' } },
      select: { receiveName: true },
      distinct: ['receiveName'],
      orderBy: { receiveName: 'asc' },
      take: 10,
    }),
  ])

  const merged = Array.from(
    new Set(
      [...customers.map((c) => c.customerName), ...receivers.map((r) => r.receiveName)].filter(
        (v): v is string => !!v,
      ),
    ),
  ).slice(0, 10)

  return Response.json({ data: merged })
}
