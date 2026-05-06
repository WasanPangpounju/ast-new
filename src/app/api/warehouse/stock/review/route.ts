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
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo = searchParams.get('dateTo') ?? ''

  const conditions: string[] = ['s.deleted_at IS NULL', 's.is_purchased = false']
  if (q) conditions.push(`(s."emp" ILIKE '%${q.replace(/'/g, "''")}%' OR s."fabricStruct" ILIKE '%${q.replace(/'/g, "''")}%' OR COALESCE(s."customer",'AST') ILIKE '%${q.replace(/'/g, "''")}%')`)
  if (dateFrom) conditions.push(`s."createDate" >= '${dateFrom}'::date`)
  if (dateTo) conditions.push(`s."createDate" < ('${dateTo}'::date + interval '1 day')`)
  const where = conditions.join(' AND ')

  const [groups, totalRaw] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT
        s."refId",
        s."emp",
        COALESCE(s."customer", 'AST') as customer,
        s."fabricStruct",
        s."fabricPattern",
        s."fabricW",
        MAX(s."fabricCode") as "fabricCode",
        COUNT(*)::int as fold_count,
        SUM(s."sumYard")::float as total_yard,
        MAX(s."createDate") as create_date
      FROM stockfabrics s
      WHERE ${where}
      GROUP BY s."refId", s."emp", s."customer", s."fabricStruct", s."fabricPattern", s."fabricW", s."fabricCode"
      ORDER BY MAX(s."createDate") DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as Promise<any[]>,
    prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as cnt FROM (
        SELECT 1 FROM stockfabrics s WHERE ${where}
        GROUP BY s."refId", s."emp", s."customer", s."fabricStruct", s."fabricPattern", s."fabricW"
      ) sub
    `) as Promise<any[]>,
  ])

  const mappedGroups = (groups as any[]).map(g => ({
    ...g,
    fold_count: Number(g.fold_count),
    total_yard: Number(g.total_yard),
  }))

  return Response.json({ groups: mappedGroups, total: Number((totalRaw as any[])[0]?.cnt ?? 0), page, limit })
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { refId, customer, fabricStruct, fabricPattern, fabricW, fabricCode } = body
  if (!refId) return Response.json({ error: 'refId required' }, { status: 400 })

  await prisma.stockFabric.updateMany({
    where: { refId, deletedAt: null },
    data: {
      customer: customer ?? undefined,
      fabricStruct: fabricStruct ?? undefined,
      fabricPattern: fabricPattern ?? undefined,
      fabricW: fabricW ?? undefined,
      fabricCode: fabricCode ?? undefined,
    },
  })

  return Response.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const refId = searchParams.get('refId')
  if (!refId) return Response.json({ error: 'refId required' }, { status: 400 })

  await prisma.stockFabric.updateMany({
    where: { refId, deletedAt: null },
    data: { deletedAt: new Date() },
  })

  return Response.json({ ok: true })
}
