import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { name, jobTitle, tel } = body

  if (!name?.trim()) return Response.json({ error: 'กรุณากรอกชื่อผู้ประสานงาน' }, { status: 400 })

  const coordinator = await prisma.coordinator.update({
    where: { id: Number(id) },
    data: {
      name: name.trim(),
      jobTitle: jobTitle?.trim() ?? null,
      tel: tel?.trim() ?? null,
    },
  })

  return Response.json({ coordinator })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  await prisma.coordinator.delete({ where: { id: Number(id) } })

  return Response.json({ success: true })
}
