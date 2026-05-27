import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 20
  const search = searchParams.get('search') ?? ''
  const supplier = searchParams.get('supplier') ?? ''
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo = searchParams.get('dateTo') ?? ''

  const where: Record<string, unknown> = {}

  if (search) where.fabricCode = { contains: search, mode: 'insensitive' }
  if (supplier) where.supplier = { name: { contains: supplier, mode: 'insensitive' } }
  if (dateFrom || dateTo) {
    where.returnDate = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59') } : {}),
    }
  }

  const [records, total] = await Promise.all([
    prisma.fabricReturn.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy: { returnDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.fabricReturn.count({ where }),
  ])

  return Response.json({
    records: records.map((r) => ({
      id: r.id,
      returnDate: r.returnDate.toISOString(),
      supplierName: r.supplier.name,
      fabricCode: r.fabricCode,
      qty: r.qty,
      unit: r.unit,
      returnQty: r.returnQty,
      receivedQty: r.receivedQty,
      totalReturned: r.totalReturned,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { supplierId, fabricCode, qty, unit, returnQty, returnDate, note } = body

  if (!supplierId) return Response.json({ error: 'กรุณาเลือกซัพพลายเออร์' }, { status: 400 })
  if (!fabricCode?.trim()) return Response.json({ error: 'กรุณากรอกรหัสผ้า' }, { status: 400 })
  if (!qty) return Response.json({ error: 'กรุณากรอกจำนวน' }, { status: 400 })

  const record = await prisma.fabricReturn.create({
    data: {
      supplierId: Number(supplierId),
      fabricCode: fabricCode.trim(),
      qty: Number(qty),
      unit: unit ?? 'หลา',
      returnQty: Number(returnQty) || 0,
      returnDate: returnDate ? new Date(returnDate) : new Date(),
      note: note ?? null,
    },
  })

  return Response.json({ record }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, receivedQty, totalReturned } = body

  if (!id) return Response.json({ error: 'ไม่พบ id' }, { status: 400 })

  const record = await prisma.fabricReturn.update({
    where: { id: Number(id) },
    data: {
      ...(receivedQty !== undefined ? { receivedQty: Number(receivedQty) } : {}),
      ...(totalReturned !== undefined ? { totalReturned: Number(totalReturned) } : {}),
    },
  })

  return Response.json({ record })
}
