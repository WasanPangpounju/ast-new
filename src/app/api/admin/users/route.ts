import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import type { NextRequest } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    select: {
      id: true, name: true, email: true, role: true, createdAt: true,
      permissions: { select: { menuKey: true, canAccess: true } }
    }
  })
  return Response.json({ users })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, email, password, role, menuKeys } = await request.json()
  if (!name || !email || !password)
    return Response.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return Response.json({ error: 'อีเมลนี้มีในระบบแล้ว' }, { status: 400 })
  const hash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      name, email, password: hash, role: role ?? 'user',
      permissions: {
        create: (menuKeys as string[] ?? []).map(key => ({ menuKey: key, canAccess: true }))
      }
    }
  })
  return Response.json({ user: { id: user.id, name: user.name } })
}
