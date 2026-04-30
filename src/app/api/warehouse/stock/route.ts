import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 20
  const offset = (page - 1) * limit
  const q = searchParams.get('q') ?? ''
  const customer = searchParams.get('customer') ?? ''

  const stockType = searchParams.get('stockType') ?? 'all'

  const conditions: string[] = ['s.deleted_at IS NULL']
  if (stockType === 'produced') conditions.push('s.is_purchased = false')
  if (stockType === 'purchased') conditions.push('s.is_purchased = true')
  if (q) conditions.push(`(s."fabricStruct" ILIKE '%${q.replace(/'/g, "''")}%' OR s."fabricPattern" ILIKE '%${q.replace(/'/g, "''")}%')`)
  if (customer) conditions.push(`COALESCE(s."customer", 'AST') ILIKE '%${customer.replace(/'/g, "''")}%'`)
  const whereClause = conditions.join(' AND ')

  const [stocks, totalRaw] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(s."customer", 'AST') as customer,
        s."fabricStruct",
        s."fabricPattern",
        s."fabricW",
        COUNT(s.id)::int as lot_count,
        SUM(s."fold")::int as produced_fold,
        SUM(s."sumYard") as produced_yard,
        COALESCE(MAX(f."outFold"), 0)::int as used_fold,
        COALESCE(MAX(f."outYard"), 0) as used_yard
      FROM stockfabrics s
      LEFT JOIN (
        SELECT REGEXP_REPLACE(REGEXP_REPLACE(TRIM("fabricStruct"), '\s+', ' ', 'g'), ' x ', ' * ', 'g') as fs,
               COALESCE(REGEXP_REPLACE(TRIM("fabricPattern"), '\s+', ' ', 'g'), '') as fp,
               COALESCE(SPLIT_PART(TRIM("fabricW"), '/', 1), '') as fw,
               "customerName",
               SUM("fold")::int as "outFold",
               SUM("sumYard") as "outYard"
        FROM fabricouts
        WHERE deleted_at IS NULL
        GROUP BY REGEXP_REPLACE(REGEXP_REPLACE(TRIM("fabricStruct"), '\s+', ' ', 'g'), ' x ', ' * ', 'g'),
                 COALESCE(REGEXP_REPLACE(TRIM("fabricPattern"), '\s+', ' ', 'g'), ''),
                 COALESCE(SPLIT_PART(TRIM("fabricW"), '/', 1), ''),
                 "customerName"
      ) f ON REGEXP_REPLACE(REGEXP_REPLACE(TRIM(s."fabricStruct"), '\s+', ' ', 'g'), ' x ', ' * ', 'g') = f.fs
         AND COALESCE(REGEXP_REPLACE(TRIM(s."fabricPattern"), '\s+', ' ', 'g'), '') = f.fp
         AND COALESCE(SPLIT_PART(TRIM(s."fabricW"), '/', 1), '') = f.fw
         AND COALESCE(s."customer", 'AST') = f."customerName"
      WHERE ${whereClause}
      GROUP BY COALESCE(s."customer", 'AST'), s."fabricStruct", s."fabricPattern", s."fabricW"
      ORDER BY customer ASC, produced_yard DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as Promise<any[]>,
    prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as cnt FROM (
        SELECT 1 FROM stockfabrics s
        WHERE ${whereClause}
        GROUP BY COALESCE(s."customer", 'AST'), s."fabricStruct", s."fabricPattern", s."fabricW"
      ) sub
    `) as Promise<any[]>,
  ])

  return Response.json({ stocks, total: (totalRaw as any[])[0]?.cnt ?? 0, page, limit })
}
