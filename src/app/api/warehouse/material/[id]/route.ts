import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  if (isNaN(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const material = await prisma.material.findUnique({
      where: { id },
      include: {
        requisitions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!material || material.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    return Response.json(material)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/[id] GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
