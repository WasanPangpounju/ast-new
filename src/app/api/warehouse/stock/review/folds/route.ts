import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const refId = request.nextUrl.searchParams.get('refId')
  if (!refId) return Response.json({ error: 'refId required' }, { status: 400 })

  const folds = await prisma.stockFabric.findMany({
    where: { refId, deletedAt: null, isPurchased: false },
    select: { id: true, fold: true, sumYard: true },
    orderBy: { id: 'asc' },
  })

  return Response.json({ folds: folds.map(f => ({ id: f.id, fold: f.fold, sumYard: Number(f.sumYard) })) })
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, sumYard } = body
  if (!id || sumYard == null) return Response.json({ error: 'id and sumYard required' }, { status: 400 })

  await prisma.stockFabric.update({
    where: { id: Number(id) },
    data: { sumYard: Number(sumYard) },
  })

  return Response.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  await prisma.stockFabric.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  })

  return Response.json({ ok: true })
}
