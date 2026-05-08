import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()
  const field = params.get('field') ?? ''

  const filterCustomer = (params.get('customer') ?? '').trim()
  const filterStruct = (params.get('fabricStruct') ?? '').trim()
  const filterPattern = (params.get('fabricPattern') ?? '').trim()
  const filterW = (params.get('fabricW') ?? '').trim()
  const filterCode = (params.get('fabricCode') ?? '').trim()

  const hasAnyFilter = q || filterCustomer || filterStruct || filterPattern || filterW || filterCode
  if (!hasAnyFilter) return Response.json({ results: [] })

  if (field === 'fabricCode') {
    const pattern = `%${q}%`
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

  const esc = (s: string) => s.replace(/'/g, "''")
  const conditions: string[] = ['s.deleted_at IS NULL']

  if (q) {
    const eq = esc(q)
    conditions.push(`(s."fabricStruct" ILIKE '%${eq}%' OR s."fabricPattern" ILIKE '%${eq}%' OR s."fabricW" ILIKE '%${eq}%' OR s."fabricCode" ILIKE '%${eq}%')`)
  }
  if (filterCustomer) conditions.push(`COALESCE(s."customer", 'AST') ILIKE '%${esc(filterCustomer)}%'`)
  if (filterStruct) conditions.push(`s."fabricStruct" ILIKE '%${esc(filterStruct)}%'`)
  if (filterPattern) conditions.push(`s."fabricPattern" ILIKE '%${esc(filterPattern)}%'`)
  if (filterW) conditions.push(`s."fabricW" ILIKE '%${esc(filterW)}%'`)
  if (filterCode) conditions.push(`s."fabricCode" IS NOT NULL AND s."fabricCode" ILIKE '%${esc(filterCode)}%'`)

  const whereClause = conditions.join(' AND ')

  const results = await prisma.$queryRawUnsafe<{
    fabricStruct: string
    fabricPattern: string
    fabricW: string
    fabricCode: string | null
    customer: string
    produced_fold: number
    produced_yard: number
    used_fold: number
    used_yard: number
  }[]>(`
    SELECT
      s."fabricStruct",
      s."fabricPattern",
      s."fabricW",
      MAX(s."fabricCode") as "fabricCode",
      COALESCE(s."customer", 'AST') as customer,
      SUM(s."fold")::int as produced_fold,
      SUM(s."sumYard")::float as produced_yard,
      COALESCE(MAX(f."outFold"), 0)::int as used_fold,
      COALESCE(MAX(f."outYard"), 0)::float as used_yard
    FROM stockfabrics s
    LEFT JOIN (
      SELECT
        REGEXP_REPLACE(REGEXP_REPLACE(TRIM("fabricStruct"), '\\s+', ' ', 'g'), ' x ', ' * ', 'g') as fs,
        COALESCE(REGEXP_REPLACE(TRIM("fabricPattern"), '\\s+', ' ', 'g'), '') as fp,
        COALESCE(SPLIT_PART(TRIM("fabricW"), '/', 1), '') as fw,
        "customerName",
        SUM("fold")::int as "outFold",
        SUM("sumYard")::float as "outYard"
      FROM fabricouts
      WHERE deleted_at IS NULL
      GROUP BY
        REGEXP_REPLACE(REGEXP_REPLACE(TRIM("fabricStruct"), '\\s+', ' ', 'g'), ' x ', ' * ', 'g'),
        COALESCE(REGEXP_REPLACE(TRIM("fabricPattern"), '\\s+', ' ', 'g'), ''),
        COALESCE(SPLIT_PART(TRIM("fabricW"), '/', 1), ''),
        "customerName"
    ) f ON REGEXP_REPLACE(REGEXP_REPLACE(TRIM(s."fabricStruct"), '\\s+', ' ', 'g'), ' x ', ' * ', 'g') = f.fs
       AND COALESCE(REGEXP_REPLACE(TRIM(s."fabricPattern"), '\\s+', ' ', 'g'), '') = f.fp
       AND COALESCE(SPLIT_PART(TRIM(s."fabricW"), '/', 1), '') = f.fw
       AND COALESCE(s."customer", 'AST') = f."customerName"
    WHERE ${whereClause}
    GROUP BY s."fabricStruct", s."fabricPattern", s."fabricW", COALESCE(s."customer", 'AST')
    ORDER BY produced_yard DESC
    LIMIT 15
  `)

  return Response.json({ results })
}
