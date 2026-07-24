import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { NS, NW, NP, EFF_STRUCT, EFF_WIDTH, EFF_PATTERN, EFF_CUSTOMER } from '@/lib/fabricOutMatch'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = request.nextUrl
    const customer      = searchParams.get('customer')      ?? ''
    const fabricCode    = searchParams.get('fabricCode')    ?? ''
    const fabricStruct  = searchParams.get('fabricStruct')  ?? ''
    const fabricPattern = searchParams.get('fabricPattern') ?? ''
    const fabricW       = searchParams.get('fabricW')       ?? ''

    const esc = (s: string) => s.replace(/'/g, "''")

    const [stockEntries, billEntries] = await Promise.all([
      // Stock entries grouped by refId — use $queryRawUnsafe to match exact stored values
      prisma.$queryRawUnsafe(`
        SELECT
          "refId",
          MAX("emp")                       AS emp,
          COALESCE(MAX("customer"), 'AST') AS customer,
          BOOL_OR("is_purchased")          AS is_purchased,
          COUNT(*)::int                    AS fold_count,
          SUM("sumYard")::float            AS total_yard,
          MAX("createDate")                AS create_date
        FROM stockfabrics
        WHERE deleted_at IS NULL
          AND COALESCE("customer",      'AST') = '${esc(customer)}'
          AND COALESCE("fabricCode",    '')    = '${esc(fabricCode)}'
          AND COALESCE("fabricStruct",  '')    = '${esc(fabricStruct)}'
          AND COALESCE("fabricPattern", '')    = '${esc(fabricPattern)}'
          AND COALESCE("fabricW",       '')    = '${esc(fabricW)}'
        GROUP BY "refId"
        ORDER BY MAX("createDate") DESC
      `) as Promise<any[]>,

      // Bill entries (fabricouts) matching this fabric group — same normalized
      // struct+width+pattern+customer match as the "ใช้ไป" summary query, so the
      // two views never disagree on the same fabric group.
      prisma.$queryRawUnsafe(`
        SELECT
          "vatType",
          "vatNo"::int            AS "vatNo",
          MAX("customerName")     AS "customerName",
          MAX("receiveName")      AS "receiveName",
          MAX("createDate")       AS "createDate",
          COUNT(*)::int           AS "foldCount",
          SUM("sumYard")::float   AS "totalYard"
        FROM fabricouts
        WHERE deleted_at IS NULL
          AND ${NS(EFF_STRUCT)}   = ${NS(`'${esc(fabricStruct)}'`)}
          AND ${NW(EFF_WIDTH)}    = ${NW(`'${esc(fabricW)}'`)}
          AND ${NP(EFF_PATTERN)}  = ${NP(`'${esc(fabricPattern)}'`)}
          AND ${NP(`'${esc(fabricPattern)}'`)} <> ''
          AND ${EFF_CUSTOMER}     = COALESCE(NULLIF(TRIM('${esc(customer)}'), ''), 'AST')
        GROUP BY "vatType", "vatNo"
        ORDER BY MAX("createDate") DESC
      `) as Promise<any[]>,
    ])

    return Response.json({
      stockEntries: (stockEntries as any[]).map(e => ({
        ...e,
        fold_count: Number(e.fold_count),
        total_yard: Number(e.total_yard),
      })),
      billEntries: (billEntries as any[]).map(b => ({
        ...b,
        vatNo:     Number(b.vatNo),
        foldCount: Number(b.foldCount),
        totalYard: Number(b.totalYard),
      })),
    })
  } catch (e) {
    console.error('[stock/detail GET]', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH: update emp and/or createDate for a stock entry group
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { refId, emp, createDate } = body
  if (!refId) return Response.json({ error: 'refId required' }, { status: 400 })

  await prisma.stockFabric.updateMany({
    where: { refId, deletedAt: null },
    data: {
      emp:        emp        !== undefined ? String(emp)              : undefined,
      createDate: createDate !== undefined ? new Date(createDate)    : undefined,
    },
  })

  return Response.json({ ok: true })
}
