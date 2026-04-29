import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vatNo: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { vatNo } = await params
  const vatType = request.nextUrl.searchParams.get('vatType') ?? 'A'

  const rolls = await prisma.fabricOut.findMany({
    where: { vatNo: Number(vatNo), vatType, deletedAt: null },
    orderBy: { fold: 'asc' },
    select: {
      id: true,
      fold: true,
      sumYard: true,
      vatType: true,
      vatNo: true,
      customerName: true,
      receiveName: true,
      fabricStruct: true,
      fabricPattern: true,
      fabricW: true,
      createDate: true,
    },
  })

  return Response.json({ rolls })
}
