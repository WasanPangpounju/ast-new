import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const orderId = Number(id)

  try {
  const order = await prisma.astPurchaseOrder.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      fabricAst: true,
      fabricAstStructure: true,
      orderDeadlines: { orderBy: { dt: 'asc' } },
    },
  })
  if (!order) return Response.json({ error: 'ไม่พบใบสั่งขาย' }, { status: 404 })

  // get or create BillOfStructure (never overwrite if exists)
  const existing = await prisma.astBillOfStructure.findUnique({
    where: { sourceOrderId: orderId },
    include: { deadlines: { orderBy: { dt: 'asc' } } },
  })
  if (existing) return Response.json({ order, billOfStructure: existing })

  const fa = order.fabricAst
  const s = order.fabricAstStructure

  const bos = await prisma.$transaction(async tx => {
    const created = await tx.astBillOfStructure.create({
      data: {
        purchaseOrder: order.purchaseOrder,
        sourceOrderId: order.id,
        vat: order.vat,
        customerName: order.customerName,
        emp: order.emp,
        fabricId: order.fabricId,
        fabricPattern: order.fabricPattern,
        fabricStructure: order.fabricStructure,
        yarnHCount: fa?.yarnHCount ?? null,
        fabricW: fa?.fabricW ?? null,
        phewNumber: fa?.phewNumber ?? null,
        phewW: fa?.phewW ?? null,
        stackType: fa?.stackType ?? null,
        warpYarn1: s?.yarnHType ?? null,
        warpComp1: s?.subNameH1 ?? null,
        warpCount1: s?.yarnHCount1 ?? null,
        warpRatio1: s?.yarnHRatio1 ?? null,
        warpYarn2: s?.yarnHType2 ?? null,
        warpComp2: s?.subNameH2 ?? null,
        warpCount2: s?.yarnHCount2 ?? null,
        warpRatio2: s?.yarnHRatio2 ?? null,
        weftYarn1: s?.yarnWType ?? null,
        weftComp1: s?.subNameW1 ?? null,
        weftCount1: s?.yarnWCount1 ?? null,
        weftRatio1: s?.yarnWRatio1 ?? null,
        weftYarn2: s?.yarnWType2 ?? null,
        weftComp2: s?.subNameW2 ?? null,
        weftCount2: s?.yarnWCount2 ?? null,
        weftRatio2: s?.weftRatio2 ?? null,
        weftYarn3: s?.yarnWType3 ?? null,
        weftComp3: s?.subNameW3 ?? null,
        weftCount3: s?.yarnWCount3 ?? null,
        weftRatio3: s?.yarnWRatio3 ?? null,
        weftYarn4: s?.yarnWType4 ?? null,
        weftComp4: s?.subNameW4 ?? null,
        weftCount4: s?.yarnWCount4 ?? null,
        weftRatio4: s?.yarnWRatio4 ?? null,
        orderSumYard: order.orderSumYard,
        fabricSPY: order.fabricSPY,
        priceYard: order.priceYard,
        priceM: order.priceM,
        discountP: order.discountP,
        machineNumber: order.machineNumber,
        surcharge: order.surcharge,
        commission: order.commission,
        po: order.po,
        note: order.note,
        productionNote: order.productionNote,
        payment: order.payment,
        status: order.status ?? 'รอดำเนินการ',
        createDate: order.createDate,
      },
    })

    for (const dl of order.orderDeadlines) {
      if (dl.dt) {
        await tx.bosDeadline.create({
          data: {
            bosId: created.id,
            dt: dl.dt,
            label: dl.label ?? 'กำหนดส่ง',
            qty: dl.qty,
            unit: dl.unit ?? 'หลา',
            pct: dl.pct,
          },
        })
      }
    }

    return tx.astBillOfStructure.findUniqueOrThrow({
      where: { id: created.id },
      include: { deadlines: { orderBy: { dt: 'asc' } } },
    })
  })

  return Response.json({ order, billOfStructure: bos }, { status: 201 })
  } catch (e) {
    console.error('[open-structure POST]', e)
    return Response.json({ error: 'สร้างใบโครงสร้างไม่สำเร็จ' }, { status: 500 })
  }
}
