import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { name, email, password, role, menuKeys } = await request.json()
  const updateData: Record<string, unknown> = { name, email, role }
  if (password) updateData.password = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id: Number(id) }, data: updateData })
  await prisma.userPermission.deleteMany({ where: { userId: Number(id) } })
  if (menuKeys?.length > 0) {
    await prisma.userPermission.createMany({
      data: (menuKeys as string[]).map(key => ({ userId: Number(id), menuKey: key, canAccess: true }))
    })
  }
  return Response.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.user.update({ where: { id: Number(id) }, data: { deletedAt: new Date() } })
  return Response.json({ success: true })
}
