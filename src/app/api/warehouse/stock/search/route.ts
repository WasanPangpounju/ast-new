import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  const field = request.nextUrl.searchParams.get('field') ?? ''
  if (!q) return Response.json({ results: [] })

  const pattern = `%${q}%`

  if (field === 'fabricCode') {
    const results = await prisma.$queryRaw<{ fabricCode: string; fabricStruct: string; fabricPattern: string }[]>`
      SELECT DISTINCT s."fabricCode", s."fabricStruct", s."fabricPattern"
      FROM stockfabrics s
      WHERE s.deleted_at IS NULL
        AND s."fabricCode" IS NOT NULL
        AND s."fabricCode" <> ''
        AND s."fabricCode" ILIKE ${pattern}
      ORDER BY s."fabricCode"
      LIMIT 10
    `
    return Response.json({ results })
  }

  const results = await prisma.$queryRaw<{
    fabricStruct: string
    fabricPattern: string
    fabricW: string
    fabricCode: string | null
    customer: string
    produced_fold: number
    produced_yard: number
  }[]>`
    SELECT
      s."fabricStruct",
      s."fabricPattern",
      s."fabricW",
      MAX(s."fabricCode") as "fabricCode",
      COALESCE(s."customer", 'AST') as customer,
      SUM(s."fold")::int as produced_fold,
      SUM(s."sumYard")::int as produced_yard
    FROM stockfabrics s
    WHERE s.deleted_at IS NULL
      AND (
        s."fabricStruct" ILIKE ${pattern}
        OR s."fabricPattern" ILIKE ${pattern}
        OR s."fabricW" ILIKE ${pattern}
      )
    GROUP BY s."fabricStruct", s."fabricPattern", s."fabricW", COALESCE(s."customer", 'AST')
    ORDER BY produced_yard DESC
    LIMIT 10
  `

  return Response.json({ results })
}
