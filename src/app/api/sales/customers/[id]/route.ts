import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const customer = await prisma.customer.findFirst({
    where: { id: Number(id), deletedAt: null },
  })
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

  const coordinators = await prisma.coordinator.findMany({
    where: { tax: customer.tax ?? '' },
    orderBy: { id: 'asc' },
  })

  return Response.json({ customer, coordinators })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { name, tax, address, tel, email, type } = body

  if (!name?.trim()) return Response.json({ error: 'กรุณากรอกชื่อลูกค้า' }, { status: 400 })

  const customer = await prisma.customer.update({
    where: { id: Number(id) },
    data: {
      name: name.trim(),
      tax: tax?.trim() ?? null,
      address: address?.trim() ?? null,
      tel: tel?.trim() ?? null,
      email: email?.trim() ?? null,
      type: type?.trim() ?? null,
    },
  })

  return Response.json({ customer })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  await prisma.customer.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  })

  return Response.json({ success: true })
}
