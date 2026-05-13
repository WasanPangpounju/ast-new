import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const bosId = Number(id)
  const body = await request.json()

  const {
    customerName, emp, fabricId, fabricPattern, fabricStructure,
    yarnHCount, fabricW, phewNumber, phewW, stackType,
    warpYarn1, warpComp1, warpCount1, warpRatio1,
    warpYarn2, warpComp2, warpCount2, warpRatio2,
    weftYarn1, weftComp1, weftCount1, weftRatio1,
    weftYarn2, weftComp2, weftCount2, weftRatio2,
    weftYarn3, weftComp3, weftCount3, weftRatio3,
    weftYarn4, weftComp4, weftCount4, weftRatio4,
    orderSumYard, fabricSPY,
    priceYard, priceM, discountP,
    machineNumber, surcharge, commission, po,
    note, productionNote, payment,
    deadlines,
  } = body

  try {
    const bos = await prisma.$transaction(async tx => {
      const updated = await tx.astBillOfStructure.update({
        where: { id: bosId },
        data: {
          customerName: customerName?.trim() ?? null,
          emp: emp?.trim() ?? null,
          fabricId: fabricId?.trim() ?? null,
          fabricPattern: fabricPattern?.trim() ?? null,
          fabricStructure: fabricStructure?.trim() ?? null,
          yarnHCount: yarnHCount?.trim() ?? null,
          fabricW: fabricW?.trim() ?? null,
          phewNumber: phewNumber?.trim() ?? null,
          phewW: phewW?.trim() ?? null,
          stackType: stackType?.trim() ?? null,
          warpYarn1: warpYarn1?.trim() ?? null,
          warpComp1: warpComp1?.trim() ?? null,
          warpCount1: warpCount1?.trim() ?? null,
          warpRatio1: warpRatio1?.trim() ?? null,
          warpYarn2: warpYarn2?.trim() ?? null,
          warpComp2: warpComp2?.trim() ?? null,
          warpCount2: warpCount2?.trim() ?? null,
          warpRatio2: warpRatio2?.trim() ?? null,
          weftYarn1: weftYarn1?.trim() ?? null,
          weftComp1: weftComp1?.trim() ?? null,
          weftCount1: weftCount1?.trim() ?? null,
          weftRatio1: weftRatio1?.trim() ?? null,
          weftYarn2: weftYarn2?.trim() ?? null,
          weftComp2: weftComp2?.trim() ?? null,
          weftCount2: weftCount2?.trim() ?? null,
          weftRatio2: weftRatio2?.trim() ?? null,
          weftYarn3: weftYarn3?.trim() ?? null,
          weftComp3: weftComp3?.trim() ?? null,
          weftCount3: weftCount3?.trim() ?? null,
          weftRatio3: weftRatio3?.trim() ?? null,
          weftYarn4: weftYarn4?.trim() ?? null,
          weftComp4: weftComp4?.trim() ?? null,
          weftCount4: weftCount4?.trim() ?? null,
          weftRatio4: weftRatio4?.trim() ?? null,
          orderSumYard: orderSumYard ? parseFloat(orderSumYard) : null,
          fabricSPY: fabricSPY ? parseFloat(fabricSPY) : null,
          priceYard: priceYard ? parseFloat(priceYard) : null,
          priceM: priceM ? parseFloat(priceM) : null,
          discountP: discountP ? parseFloat(discountP) : null,
          machineNumber: machineNumber?.trim() ?? null,
          surcharge: surcharge?.trim() ?? null,
          commission: commission ? parseFloat(commission) : null,
          po: po?.trim() ?? null,
          note: note?.trim() ?? null,
          productionNote: productionNote?.trim() ?? null,
          payment: payment?.trim() ?? null,
        },
      })

      // replace deadlines
      await tx.bosDeadline.deleteMany({ where: { bosId } })
      if (Array.isArray(deadlines) && deadlines.length > 0) {
        for (const dl of deadlines) {
          if (dl.dt) {
            await tx.bosDeadline.create({
              data: {
                bosId,
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

      return tx.astBillOfStructure.findUniqueOrThrow({
        where: { id: updated.id },
        include: { deadlines: { orderBy: { dt: 'asc' } } },
      })
    })

    return Response.json({ billOfStructure: bos })
  } catch {
    return Response.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  try {
    await prisma.astBillOfStructure.update({
      where: { id: Number(id) },
      data: { deletedAt: new Date() },
    })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'ลบไม่สำเร็จ' }, { status: 500 })
  }
}
