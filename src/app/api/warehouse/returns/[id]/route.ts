import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { returnQty, receivedQty, totalReturned, note } = body

  const record = await prisma.fabricReturn.update({
    where: { id: Number(id) },
    data: {
      ...(returnQty !== undefined ? { returnQty: Number(returnQty) } : {}),
      ...(receivedQty !== undefined ? { receivedQty: Number(receivedQty) } : {}),
      ...(totalReturned !== undefined ? { totalReturned: Number(totalReturned) } : {}),
      ...(note !== undefined ? { note: String(note) } : {}),
    },
  })

  return Response.json({ record })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.fabricReturn.delete({ where: { id: Number(id) } })
  return Response.json({ ok: true })
}
