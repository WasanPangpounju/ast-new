import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

// GET — list all withdrawal bills for a deposit (grouped by vatType+vatNo)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const refId = request.nextUrl.searchParams.get('refId')
    if (!refId) return Response.json({ error: 'refId required' }, { status: 400 })

    const withdrawals = await prisma.$queryRaw`
      SELECT
        fo."vatType",
        fo."vatNo"::int          AS "vatNo",
        MAX(fo."createDate")     AS "createDate",
        MAX(fo."receiveName")    AS "receiveName",
        COUNT(*)::int            AS "foldCount",
        SUM(fo."sumYard")::float AS "totalYard"
      FROM fabricouts fo
      WHERE fo.deleted_at IS NULL
        AND fo."isDeposit" = false
        AND fo."altPurchaseOrder" = ${refId}
      GROUP BY fo."vatType", fo."vatNo"
      ORDER BY MAX(fo."createDate") DESC
    ` as any[]

    return Response.json({
      withdrawals: (withdrawals as any[]).map(w => ({
        ...w,
        vatNo:     Number(w.vatNo),
        foldCount: Number(w.foldCount),
        totalYard: Number(w.totalYard),
      }))
    })
  } catch (e) {
    console.error('[stock-deposit/withdrawals GET]', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

// PUT — edit a withdrawal bill (replace all rolls, update date/receiver)
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { vatType, vatNo, createDate, receiveName, yards } = body

    if (!vatType || vatNo == null) {
      return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })
    }
    if (!Array.isArray(yards) || !yards.some((y: string) => parseFloat(y) > 0)) {
      return Response.json({ error: 'At least one yard value is required' }, { status: 400 })
    }

    // Fetch existing rolls to preserve metadata
    const existing = await prisma.fabricOut.findMany({
      where: { vatType, vatNo: Number(vatNo), deletedAt: null },
    })
    if (existing.length === 0) {
      return Response.json({ error: 'ไม่พบข้อมูลบิลเบิก' }, { status: 404 })
    }

    const { customerName, fabricStruct, fabricPattern, fabricW, altPurchaseOrder } = existing[0]

    // Soft-delete existing rolls
    await prisma.fabricOut.updateMany({
      where: { vatType, vatNo: Number(vatNo), deletedAt: null },
      data: { deletedAt: new Date() },
    })

    // Recreate rolls from updated yards
    const rows = (yards as string[])
      .map((y: string) => parseFloat(y) || 0)
      .filter(v => v > 0)
      .map(y => ({ yard: y }))

    const newRefId = randomUUID()
    const date = new Date(createDate)

    await prisma.fabricOut.createMany({
      data: rows.map(r => ({
        refId:           newRefId,
        vatType,
        vatNo:           Number(vatNo),
        fold:            1,
        sumYard:         r.yard,
        fabricStruct:    fabricStruct || '',
        fabricPattern:   fabricPattern || '',
        fabricW:         fabricW || '',
        customerName:    customerName || '',
        receiveName:     receiveName || customerName || '',
        createDate:      date,
        isDeposit:       false,
        altFabricStruct: null,
        altPurchaseOrder: altPurchaseOrder || null,
      })),
    })

    return Response.json({ ok: true, count: rows.length })
  } catch (e) {
    console.error('[stock-deposit/withdrawals PUT]', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE — soft-delete a withdrawal bill
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const vatType = request.nextUrl.searchParams.get('vatType')
    const vatNo   = request.nextUrl.searchParams.get('vatNo')

    if (!vatType || vatNo == null) {
      return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })
    }

    await prisma.fabricOut.updateMany({
      where: { vatType, vatNo: Number(vatNo), deletedAt: null },
      data: { deletedAt: new Date() },
    })

    return Response.json({ ok: true })
  } catch (e) {
    console.error('[stock-deposit/withdrawals DELETE]', e)
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
