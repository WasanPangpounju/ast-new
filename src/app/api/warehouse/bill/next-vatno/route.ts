import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const type = request.nextUrl.searchParams.get('type') ?? 'A'

  const result = await prisma.$queryRaw`
    SELECT COALESCE(MAX("vatNo"), 1000)::int as max_no
    FROM fabricouts
    WHERE deleted_at IS NULL AND "vatType" = ${type}
  ` as { max_no: number }[]

  return Response.json({ nextNo: result[0].max_no + 1 })
}
