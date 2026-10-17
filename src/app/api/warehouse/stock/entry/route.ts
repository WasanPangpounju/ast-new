import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { fabricCode, emp, createDate, yards, refId: refIdInput } = body
  let { fabricStruct, fabricPattern, fabricW, customer } = body

  // กองผ้าที่สร้างเอง — the lot takes the pile's fabric + customer, so it can never
  // land in a pile that describes different fabric. Omitted/null = กองหลัก as before.
  const stockPileId = body.stockPileId == null || body.stockPileId === '' ? null : Number(body.stockPileId)
  if (stockPileId != null) {
    const pile = await prisma.stockPile.findFirst({ where: { id: stockPileId, deletedAt: null } })
    if (!pile) return Response.json({ error: 'ไม่พบกองผ้าที่เลือก' }, { status: 400 })
    fabricStruct = pile.fabricStruct
    fabricPattern = pile.fabricPattern
    fabricW = pile.fabricW
    customer = pile.customer
  }

  if (!fabricStruct || !emp) {
    return Response.json({ error: 'fabricStruct and emp are required' }, { status: 400 })
  }
  if (!Array.isArray(yards) || !yards.some((y: string) => parseFloat(y) > 0)) {
    return Response.json({ error: 'At least one yard value is required' }, { status: 400 })
  }

  const rows = (yards as string[])
    .map((y, i) => ({ yard: parseFloat(y), slot: i + 1 }))
    .filter(r => r.yard > 0)

  // caller may pass an existing refId to append these rows to a record it
  // already started (e.g. "บันทึกรายการถัดไป" continuing the same batch);
  // otherwise start a new record as before.
  const refId = typeof refIdInput === 'string' && refIdInput ? refIdInput : randomUUID()
  const date = createDate ? new Date(createDate) : new Date()

  try {
    await prisma.stockFabric.createMany({
      data: rows.map(r => ({
        refId,
        emp,
        fabricStruct,
        fabricPattern: fabricPattern || '',
        fabricW: fabricW || '',
        fabricCode: fabricCode || '',
        customer: customer || 'AST',
        fold: 1,
        sumYard: r.yard,
        createDate: date,
        stockPileId,
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stock/entry] Prisma error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }

  return Response.json({ success: true, count: rows.length, refId })
}
