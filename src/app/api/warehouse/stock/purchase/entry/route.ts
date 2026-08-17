import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { fabricStruct, fabricPattern, fabricW, fabricCode, customer, emp, createDate, yards, supplier, billRef, pricePerYard, dyeLot, refId: refIdInput } = body

  if (!fabricStruct || !emp) {
    return Response.json({ error: 'fabricStruct and emp are required' }, { status: 400 })
  }
  if (!supplier || !billRef) {
    return Response.json({ error: 'supplier and billRef are required' }, { status: 400 })
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
  const date = new Date(createDate)

  await prisma.stockFabric.createMany({
    data: rows.map(r => ({
      refId,
      emp,
      fabricStruct,
      fabricPattern: fabricPattern || '',
      fabricW: fabricW || '',
      fabricCode: fabricCode || '',
      customer: customer || null,
      fold: 1,
      sumYard: r.yard,
      createDate: date,
      isPurchased: true,
      supplier: supplier,
      billRef: billRef,
      pricePerYard: pricePerYard != null ? Number(pricePerYard) : null,
      dyeLot: dyeLot || null,
    })),
  })

  return Response.json({ success: true, count: rows.length, refId })
}
