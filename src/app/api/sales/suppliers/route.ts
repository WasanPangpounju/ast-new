import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 20

  const type = searchParams.get('type') ?? ''

  const where = {
    deletedAt: null,
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { tax: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(type ? { type } : {}),
  }

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.supplier.count({ where }),
  ])

  return Response.json({ suppliers, total, page, limit })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const body = await request.json()
  const { name, tax, address, tel, email, type } = body

  if (!name?.trim()) return Response.json({ error: 'กรุณากรอกชื่อซัพพลายเออร์' }, { status: 400 })
  if (!tax?.trim()) return Response.json({ error: 'กรุณากรอกเลขที่ผู้เสียภาษี' }, { status: 400 })

  const supplier = await prisma.supplier.create({
    data: {
      name: name.trim(),
      tax: tax.trim(),
      address: address?.trim() ?? null,
      tel: tel?.trim() ?? null,
      email: email?.trim() ?? null,
      type: type?.trim() ?? null,
    },
  })

  return Response.json({ supplier }, { status: 201 })
}
