import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const vatType = searchParams.get('vatType') ?? 'all'
  const month = searchParams.get('month') ? Number(searchParams.get('month')) : null
  const year = searchParams.get('year') ? Number(searchParams.get('year')) : null

  const conditions: string[] = [`f.deleted_at IS NULL`]
  if (vatType && vatType !== 'all') conditions.push(`f."vatType" = '${vatType}'`)
  if (month && year) {
    const fromDate = new Date(year, month - 1, 1).toISOString()
    const toDate = new Date(year, month, 1).toISOString()
    conditions.push(`f."createDate" >= '${fromDate}' AND f."createDate" < '${toDate}'`)
  } else if (year) {
    const fromDate = new Date(year, 0, 1).toISOString()
    const toDate = new Date(year + 1, 0, 1).toISOString()
    conditions.push(`f."createDate" >= '${fromDate}' AND f."createDate" < '${toDate}'`)
  }

  const whereClause = conditions.join(' AND ')

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      f."vatType",
      f."vatNo"::text as "vatNo",
      MAX(f."customerName") as "customerName",
      MAX(f."fabricStruct") as "fabricStruct",
      MAX(f."fabricPattern") as "fabricPattern",
      MAX(f."fabricW") as "fabricW",
      SUM(f.fold)::int as fold,
      ROUND(SUM(f."sumYard")::numeric, 2)::float as "sumYard",
      MIN(f."createDate") as "createDate"
    FROM fabricouts f
    WHERE ${whereClause}
    GROUP BY f."vatType", f."vatNo"
    ORDER BY MIN(f."createDate") DESC
    LIMIT 500
  `) as any[]

  return Response.json({ rows: rows ?? [] })
}
