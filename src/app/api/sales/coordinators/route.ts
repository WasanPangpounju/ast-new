import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const tax = request.nextUrl.searchParams.get('tax') ?? ''
  if (!tax) return Response.json({ coordinators: [] })

  const coordinators = await prisma.coordinator.findMany({
    where: { tax },
    orderBy: { id: 'asc' },
  })

  return Response.json({ coordinators })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const body = await request.json()
  const { tax, name, jobTitle, tel } = body

  if (!tax?.trim()) return Response.json({ error: 'กรุณาระบุเลขที่ผู้เสียภาษี' }, { status: 400 })
  if (!name?.trim()) return Response.json({ error: 'กรุณากรอกชื่อผู้ประสานงาน' }, { status: 400 })

  const coordinator = await prisma.coordinator.create({
    data: {
      tax: tax.trim(),
      name: name.trim(),
      jobTitle: jobTitle?.trim() ?? null,
      tel: tel?.trim() ?? null,
    },
  })

  return Response.json({ coordinator }, { status: 201 })
}
