import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const vatType = searchParams.get('vatType') ?? 'all'
  const fromMonth = searchParams.get('fromMonth') ? Number(searchParams.get('fromMonth')) : null
  const fromYear = searchParams.get('fromYear') ? Number(searchParams.get('fromYear')) : null
  const toMonth = searchParams.get('toMonth') ? Number(searchParams.get('toMonth')) : null
  const toYear = searchParams.get('toYear') ? Number(searchParams.get('toYear')) : null

  let dateFilter = ''
  if (fromMonth && fromYear && toMonth && toYear) {
    const fromDate = new Date(fromYear, fromMonth - 1, 1).toISOString()
    const toDate = new Date(toYear, toMonth, 1).toISOString()
    dateFilter = `AND "createDate" >= '${fromDate}' AND "createDate" < '${toDate}'`
  }

  const vatFilter = (vatType && vatType !== 'all') ? `AND "vatType" = '${vatType}'` : ''

  const inRows = await prisma.$queryRawUnsafe(`
    SELECT
      "fabricStruct",
      "fabricPattern",
      "fabricW",
      SUM(fold)::int as fold,
      ROUND(SUM("sumYard")::numeric, 2)::float as "sumYard"
    FROM stockfabrics
    WHERE deleted_at IS NULL ${dateFilter}
    GROUP BY "fabricStruct", "fabricPattern", "fabricW"
    ORDER BY "fabricStruct"
  `) as any[]

  const outRows = await prisma.$queryRawUnsafe(`
    SELECT
      "fabricStruct",
      "fabricPattern",
      "fabricW",
      SUM(fold)::int as fold,
      ROUND(SUM("sumYard")::numeric, 2)::float as "sumYard"
    FROM fabricouts
    WHERE deleted_at IS NULL ${vatFilter} ${dateFilter}
    GROUP BY "fabricStruct", "fabricPattern", "fabricW"
    ORDER BY "fabricStruct"
  `) as any[]

  const totalIn = inRows.reduce((s: number, r: any) => s + Number(r.sumYard ?? 0), 0)
  const totalOut = outRows.reduce((s: number, r: any) => s + Number(r.sumYard ?? 0), 0)

  const map = new Map<string, any>()
  for (const r of inRows) {
    const key = `${r.fabricStruct}||${r.fabricPattern}||${r.fabricW}`
    map.set(key, { fabricStruct: r.fabricStruct, fabricPattern: r.fabricPattern, fabricW: r.fabricW, inYard: Number(r.sumYard ?? 0), outYard: 0, inFold: r.fold ?? 0, outFold: 0 })
  }
  for (const r of outRows) {
    const key = `${r.fabricStruct}||${r.fabricPattern}||${r.fabricW}`
    const existing = map.get(key)
    if (existing) {
      existing.outYard = Number(r.sumYard ?? 0)
      existing.outFold = r.fold ?? 0
    } else {
      map.set(key, { fabricStruct: r.fabricStruct, fabricPattern: r.fabricPattern, fabricW: r.fabricW, inYard: 0, outYard: Number(r.sumYard ?? 0), inFold: 0, outFold: r.fold ?? 0 })
    }
  }
  const details = Array.from(map.values()).map(r => ({ ...r, balanceYard: r.inYard - r.outYard, balanceFold: r.inFold - r.outFold }))

  return Response.json({ stockIn: totalIn, stockOut: totalOut, balance: totalIn - totalOut, details })
}
