import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const order = await prisma.astPurchaseOrder.findFirst({
    where: { id: Number(id), deletedAt: null },
    include: {
      fabricAst: true,
      fabricAstStructure: true,
      orderDeadlines: { orderBy: { dt: 'asc' } },
      orderShipped: true,
    },
  })
  if (!order) return Response.json({ error: 'ไม่พบใบสั่งขาย' }, { status: 404 })

  const fabricOuts = await prisma.fabricOut.findMany({
    where: { purchaseOrder: order.purchaseOrder, deletedAt: null },
    orderBy: { createDate: 'asc' },
    select: {
      id: true, fold: true, sumYard: true, vatType: true, vatNo: true,
      fabricStruct: true, fabricPattern: true, fabricW: true,
      customerName: true, receiveName: true, createDate: true,
    },
  })

  const customer = order.customerName
    ? await prisma.customer.findFirst({
        where: { name: { contains: order.customerName.split(' ')[0], mode: 'insensitive' }, deletedAt: null },
        select: { id: true, name: true, tax: true, address: true, tel: true, email: true },
      })
    : null

  return Response.json({ order, fabricOuts, customer })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const {
    customerName, coordinator,
    fabricId, fabricStructure, fabricPattern,
    fabricW, yarnHCount, phewNumber, phewW, stackType,
    warpYarn1, warpComp1, warpCount1, warpRatio1,
    warpYarn2, warpComp2, warpCount2, warpRatio2,
    weftYarn1, weftComp1, weftCount1, weftRatio1,
    weftYarn2, weftComp2, weftCount2, weftRatio2,
    weftYarn3, weftComp3, weftCount3, weftRatio3,
    weftYarn4, weftComp4, weftCount4, weftRatio4,
    orderSumYard, fabricSPY,
    priceYard, priceM, discountP, discountYard, commission,
    machineNumber, surcharge, po,
    note, productionNote, payment,
    deadlines,
    billNo,
  } = body

  const existing = await prisma.astPurchaseOrder.findFirst({
    where: { id: Number(id), deletedAt: null },
  })
  if (!existing) return Response.json({ error: 'ไม่พบใบสั่งขาย' }, { status: 404 })

  const po_ = existing.purchaseOrder

  await prisma.$transaction(async tx => {
    await tx.astPurchaseOrder.update({
      where: { id: Number(id) },
      data: {
        customerName: customerName?.trim() ?? undefined,
        emp: coordinator?.trim() ?? undefined,
        fabricId: fabricId?.trim() ?? undefined,
        fabricStructure: fabricStructure?.trim() ?? undefined,
        fabricPattern: fabricPattern?.trim() ?? undefined,
        orderSumYard: orderSumYard !== undefined ? (orderSumYard ? parseFloat(orderSumYard) : null) : undefined,
        fabricSPY: fabricSPY !== undefined ? (fabricSPY ? parseFloat(fabricSPY) : null) : undefined,
        priceYard: priceYard !== undefined ? (priceYard ? parseFloat(priceYard) : null) : undefined,
        priceM: priceM !== undefined ? (priceM ? parseFloat(priceM) : null) : undefined,
        discountP: discountP !== undefined ? (discountP ? parseFloat(discountP) : null) : undefined,
        discountYard: discountYard !== undefined ? (discountYard ? parseFloat(discountYard) : null) : undefined,
        commission: commission !== undefined ? (commission ? parseFloat(commission) : null) : undefined,
        billNo: billNo !== undefined ? (billNo ? parseInt(billNo, 10) : null) : undefined,
        machineNumber: machineNumber?.trim() ?? undefined,
        surcharge: surcharge?.trim() ?? undefined,
        po: po?.trim() ?? undefined,
        note: note?.trim() ?? undefined,
        productionNote: productionNote?.trim() ?? undefined,
        payment: payment?.trim() ?? undefined,
      },
    })

    await tx.fabricAst.upsert({
      where: { purchaseOrder: po_ },
      update: {
        fabricW: fabricW?.trim() ?? null,
        yarnHCount: yarnHCount?.trim() ?? null,
        phewNumber: phewNumber?.trim() ?? null,
        phewW: phewW?.trim() ?? null,
        stackType: stackType?.trim() ?? null,
        payment: payment?.trim() ?? null,
      },
      create: {
        purchaseOrder: po_,
        vat: existing.vat,
        fabricW: fabricW?.trim() ?? null,
        yarnHCount: yarnHCount?.trim() ?? null,
        phewNumber: phewNumber?.trim() ?? null,
        phewW: phewW?.trim() ?? null,
        stackType: stackType?.trim() ?? null,
        payment: payment?.trim() ?? null,
      },
    })

    await tx.fabricAstStructure.upsert({
      where: { purchaseOrder: po_ },
      update: {
        yarnHType: warpYarn1?.trim() ?? null,
        yarnHType2: warpYarn2?.trim() ?? null,
        subNameH1: warpComp1?.trim() ?? null,
        subNameH2: warpComp2?.trim() ?? null,
        yarnHCount1: warpCount1?.trim() ?? null,
        yarnHCount2: warpCount2?.trim() ?? null,
        yarnHRatio1: warpRatio1?.trim() ?? null,
        yarnHRatio2: warpRatio2?.trim() ?? null,
        yarnWType: weftYarn1?.trim() ?? null,
        yarnWType2: weftYarn2?.trim() ?? null,
        yarnWType3: weftYarn3?.trim() ?? null,
        yarnWType4: weftYarn4?.trim() ?? null,
        subNameW1: weftComp1?.trim() ?? null,
        subNameW2: weftComp2?.trim() ?? null,
        subNameW3: weftComp3?.trim() ?? null,
        subNameW4: weftComp4?.trim() ?? null,
        yarnWCount1: weftCount1?.trim() ?? null,
        yarnWCount2: weftCount2?.trim() ?? null,
        yarnWCount3: weftCount3?.trim() ?? null,
        yarnWCount4: weftCount4?.trim() ?? null,
        yarnWRatio1: weftRatio1?.trim() ?? null,
        weftRatio2: weftRatio2?.trim() ?? null,
        yarnWRatio3: weftRatio3?.trim() ?? null,
        yarnWRatio4: weftRatio4?.trim() ?? null,
      },
      create: {
        purchaseOrder: po_,
        yarnWRatio2: 'รอดำเนินการ',
        yarnHType: warpYarn1?.trim() ?? null,
        yarnHType2: warpYarn2?.trim() ?? null,
        subNameH1: warpComp1?.trim() ?? null,
        subNameH2: warpComp2?.trim() ?? null,
        yarnHCount1: warpCount1?.trim() ?? null,
        yarnHCount2: warpCount2?.trim() ?? null,
        yarnHRatio1: warpRatio1?.trim() ?? null,
        yarnHRatio2: warpRatio2?.trim() ?? null,
        yarnWType: weftYarn1?.trim() ?? null,
        yarnWType2: weftYarn2?.trim() ?? null,
        yarnWType3: weftYarn3?.trim() ?? null,
        yarnWType4: weftYarn4?.trim() ?? null,
        subNameW1: weftComp1?.trim() ?? null,
        subNameW2: weftComp2?.trim() ?? null,
        subNameW3: weftComp3?.trim() ?? null,
        subNameW4: weftComp4?.trim() ?? null,
        yarnWCount1: weftCount1?.trim() ?? null,
        yarnWCount2: weftCount2?.trim() ?? null,
        yarnWCount3: weftCount3?.trim() ?? null,
        yarnWCount4: weftCount4?.trim() ?? null,
        yarnWRatio1: weftRatio1?.trim() ?? null,
        weftRatio2: weftRatio2?.trim() ?? null,
        yarnWRatio3: weftRatio3?.trim() ?? null,
        yarnWRatio4: weftRatio4?.trim() ?? null,
      },
    })

    if (Array.isArray(deadlines)) {
      await tx.orderDeadline.deleteMany({ where: { purchaseOrder: po_ } })
      for (const dl of deadlines) {
        if (dl.dt) {
          await tx.orderDeadline.create({
            data: {
              purchaseOrder: po_,
              dt: new Date(dl.dt),
              label: dl.label ?? 'กำหนดส่ง',
              qty: dl.qty ? parseFloat(dl.qty) : null,
              unit: dl.unit ?? 'หลา',
              pct: dl.pct ? parseFloat(dl.pct) : null,
            },
          })
        }
      }
    }
  })

  return Response.json({ ok: true })
}
