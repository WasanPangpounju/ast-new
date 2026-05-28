import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

function nextPurchaseOrder(vat: string, existing: string[]): string {
  const now = new Date()
  const thYear = (now.getFullYear() + 543).toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const prefix = `${vat}${thYear}${month}/`
  const used = existing
    .filter(p => p.startsWith(prefix))
    .map(p => parseInt(p.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  const next = used.length ? Math.max(...used) + 1 : 1
  return `${prefix}${next}`
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const month = searchParams.get('month') ?? ''
  const year = searchParams.get('year') ?? ''
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 20

  const conditions: any[] = [{ deletedAt: null }]

  if (q) {
    conditions.push({
      OR: [
        { purchaseOrder: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
      ],
    })
  }
  if (status) conditions.push({ status })
  if (year) {
    const thYear = parseInt(year) - 543
    if (month) {
      const pad = month.padStart(2, '0')
      const start = new Date(`${thYear}-${pad}-01`)
      const end = new Date(start)
      end.setMonth(end.getMonth() + 1)
      conditions.push({ createDate: { gte: start, lt: end } })
    } else {
      const start = new Date(`${thYear}-01-01`)
      const end = new Date(`${thYear + 1}-01-01`)
      conditions.push({ createDate: { gte: start, lt: end } })
    }
  }

  const where = conditions.length === 1 ? conditions[0] : { AND: conditions }

  const [orders, total] = await Promise.all([
    prisma.astPurchaseOrder.findMany({
      where,
      orderBy: { createDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        fabricAst: { select: { fabricW: true, payment: true } },
        fabricAstStructure: { select: { yarnWRatio2: true } },
      },
    }),
    prisma.astPurchaseOrder.count({ where }),
  ])

  return Response.json({ orders, total, page, limit })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const body = await request.json()
  const {
    vat, purchaseOrder: providedPO, customerName, coordinator, fabricId, fabricStructure, fabricPattern,
    fabricW, yarnHCount, phewNumber, phewW, stackType,
    warpYarn1, warpComp1, warpCount1, warpRatio1,
    warpYarn2, warpComp2, warpCount2, warpRatio2,
    weftYarn1, weftComp1, weftCount1, weftRatio1,
    weftYarn2, weftComp2, weftCount2, weftRatio2,
    weftYarn3, weftComp3, weftCount3, weftRatio3,
    weftYarn4, weftComp4, weftCount4, weftRatio4,
    orderSumYard, fabricSPY,
    priceYard, priceM, discountP, discountYard,
    machineNumber, surcharge, commission, po,
    note, productionNote, payment,
    deadlines,
    createStructure,
    billNo,
    createDate: createDateStr,
  } = body

  if (!vat || !['SO', 'SOX', 'SOB'].includes(vat))
    return Response.json({ error: 'ประเภทใบสั่งขายไม่ถูกต้อง' }, { status: 400 })
  if (!customerName?.trim())
    return Response.json({ error: 'กรุณาระบุลูกค้า' }, { status: 400 })

  let purchaseOrder: string
  if (providedPO?.trim()) {
    purchaseOrder = providedPO.trim()
    const exists = await prisma.astPurchaseOrder.findUnique({ where: { purchaseOrder } })
    if (exists && !exists.deletedAt)
      return Response.json({ error: `เลขที่ ${purchaseOrder} มีอยู่แล้ว` }, { status: 400 })

    // SO เคยถูกลบไปแล้ว → restore แทน create ใหม่
    if (exists && exists.deletedAt) {
      const result = await prisma.$transaction(async tx => {
        // ลบ related records เก่าที่อาจหลงเหลือ (ถ้ามี)
        await tx.orderDeadline.deleteMany({ where: { purchaseOrder } })
        await tx.fabricAst.deleteMany({ where: { purchaseOrder } })
        await tx.fabricAstStructure.deleteMany({ where: { purchaseOrder } })

        const order = await tx.astPurchaseOrder.update({
          where: { purchaseOrder },
          data: {
            deletedAt: null,
            vat,
            customerName: customerName.trim(),
            emp: coordinator?.trim() ?? null,
            fabricId: fabricId?.trim() ?? null,
            fabricStructure: fabricStructure?.trim() ?? null,
            fabricPattern: fabricPattern?.trim() ?? null,
            orderSumYard: orderSumYard ? parseFloat(orderSumYard) : null,
            fabricSPY: fabricSPY ? parseFloat(fabricSPY) : null,
            priceYard: priceYard ? parseFloat(priceYard) : null,
            priceM: priceM ? parseFloat(priceM) : null,
            discountP: discountP ? parseFloat(discountP) : null,
            discountYard: discountYard ? parseFloat(discountYard) : null,
            commission: commission ? parseFloat(commission) : null,
            billNo: billNo ? parseInt(billNo, 10) : null,
            machineNumber: machineNumber?.trim() ?? null,
            surcharge: surcharge?.trim() ?? null,
            po: po?.trim() ?? null,
            note: note?.trim() ?? null,
            productionNote: productionNote?.trim() ?? null,
            payment: payment?.trim() ?? null,
            status: 'รอดำเนินการ',
            createDate: createDateStr ? new Date(createDateStr) : new Date(),
          },
        })

        await tx.fabricAst.create({
          data: {
            purchaseOrder,
            vat,
            fabricW: fabricW?.trim() ?? null,
            yarnHCount: yarnHCount?.trim() ?? null,
            phewNumber: phewNumber?.trim() ?? null,
            phewW: phewW?.trim() ?? null,
            stackType: stackType?.trim() ?? null,
          },
        })

        await tx.fabricAstStructure.create({
          data: {
            purchaseOrder,
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

        if (Array.isArray(deadlines) && deadlines.length > 0) {
          for (const dl of deadlines) {
            if (dl.dt) {
              await tx.orderDeadline.create({
                data: {
                  purchaseOrder,
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

        if (createStructure) {
          const bosExists = await tx.astBillOfStructure.findUnique({ where: { sourceOrderId: order.id } })
          if (!bosExists) {
            const bos = await tx.astBillOfStructure.create({
              data: {
                purchaseOrder,
                sourceOrderId: order.id,
                vat,
                customerName: customerName?.trim() ?? null,
                emp: coordinator?.trim() ?? null,
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
                status: 'รอดำเนินการ',
                createDate: new Date(),
              },
            })
            if (Array.isArray(deadlines) && deadlines.length > 0) {
              for (const dl of deadlines) {
                if (dl.dt) {
                  await tx.bosDeadline.create({
                    data: {
                      bosId: bos.id,
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
            return { order, bos, bosCreated: true }
          }
          return { order, bos: bosExists, bosCreated: false }
        }

        return { order, bos: null, bosCreated: false }
      })

      return Response.json({
        order: result.order,
        billOfStructure: result.bos,
        bosCreated: result.bosCreated,
        purchaseOrder,
      }, { status: 201 })
    }
  } else {
    const existing = await prisma.astPurchaseOrder.findMany({
      where: { vat, deletedAt: null },
      select: { purchaseOrder: true },
    })
    purchaseOrder = nextPurchaseOrder(vat, existing.map(o => o.purchaseOrder))
  }

  const result = await prisma.$transaction(async tx => {
    const order = await tx.astPurchaseOrder.create({
      data: {
        vat,
        purchaseOrder,
        customerName: customerName.trim(),
        emp: coordinator?.trim() ?? null,
        fabricId: fabricId?.trim() ?? null,
        fabricStructure: fabricStructure?.trim() ?? null,
        fabricPattern: fabricPattern?.trim() ?? null,
        orderSumYard: orderSumYard ? parseFloat(orderSumYard) : null,
        fabricSPY: fabricSPY ? parseFloat(fabricSPY) : null,
        priceYard: priceYard ? parseFloat(priceYard) : null,
        priceM: priceM ? parseFloat(priceM) : null,
        discountP: discountP ? parseFloat(discountP) : null,
        discountYard: discountYard ? parseFloat(discountYard) : null,
        commission: commission ? parseFloat(commission) : null,
        billNo: billNo ? parseInt(billNo, 10) : null,
        machineNumber: machineNumber?.trim() ?? null,
        surcharge: surcharge?.trim() ?? null,
        po: po?.trim() ?? null,
        note: note?.trim() ?? null,
        productionNote: productionNote?.trim() ?? null,
        payment: payment?.trim() ?? null,
        status: 'รอดำเนินการ',
        createDate: createDateStr ? new Date(createDateStr) : new Date(),
      },
    })

    await tx.fabricAst.create({
      data: {
        purchaseOrder,
        vat,
        fabricW: fabricW?.trim() ?? null,
        yarnHCount: yarnHCount?.trim() ?? null,
        phewNumber: phewNumber?.trim() ?? null,
        phewW: phewW?.trim() ?? null,
        stackType: stackType?.trim() ?? null,
      },
    })

    await tx.fabricAstStructure.create({
      data: {
        purchaseOrder,
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

    if (Array.isArray(deadlines) && deadlines.length > 0) {
      for (const dl of deadlines) {
        if (dl.dt) {
          await tx.orderDeadline.create({
            data: {
              purchaseOrder,
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

    // create BillOfStructure (insert only — never overwrite)
    if (createStructure) {
      const bosExists = await tx.astBillOfStructure.findUnique({ where: { sourceOrderId: order.id } })
      if (!bosExists) {
        const bos = await tx.astBillOfStructure.create({
          data: {
            purchaseOrder,
            sourceOrderId: order.id,
            vat,
            customerName: customerName?.trim() ?? null,
            emp: coordinator?.trim() ?? null,
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
            status: 'รอดำเนินการ',
            createDate: new Date(),
          },
        })
        if (Array.isArray(deadlines) && deadlines.length > 0) {
          for (const dl of deadlines) {
            if (dl.dt) {
              await tx.bosDeadline.create({
                data: {
                  bosId: bos.id,
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
        return { order, bos, bosCreated: true }
      }
      return { order, bos: bosExists, bosCreated: false }
    }

    return { order, bos: null, bosCreated: false }
  })

  return Response.json({
    order: result.order,
    billOfStructure: result.bos,
    bosCreated: result.bosCreated,
    purchaseOrder,
  }, { status: 201 })
}
