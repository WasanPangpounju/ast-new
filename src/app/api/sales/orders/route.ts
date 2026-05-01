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
  return `${prefix}${next.toString().padStart(2, '0')}`
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
  if (month && year) {
    const thYear = parseInt(year) - 543
    const pad = month.padStart(2, '0')
    const start = new Date(`${thYear}-${pad}-01`)
    const end = new Date(start)
    end.setMonth(end.getMonth() + 1)
    conditions.push({ createDate: { gte: start, lt: end } })
  }

  const where = conditions.length === 1 ? conditions[0] : { AND: conditions }

  const [orders, total] = await Promise.all([
    prisma.astPurchaseOrder.findMany({
      where,
      orderBy: { id: 'desc' },
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
    vat, customerName, fabricId, fabricStructure, fabricPattern, fabricW,
    priceYard, priceM, discountP, discountYard, commission, orderSumM,
    deadlineDate, comment,
  } = body

  if (!vat || !['SO', 'SOX', 'SOB'].includes(vat))
    return Response.json({ error: 'ประเภทใบสั่งขายไม่ถูกต้อง' }, { status: 400 })
  if (!customerName?.trim())
    return Response.json({ error: 'กรุณาระบุลูกค้า' }, { status: 400 })

  const existing = await prisma.astPurchaseOrder.findMany({
    where: { vat, deletedAt: null },
    select: { purchaseOrder: true },
  })
  const purchaseOrder = nextPurchaseOrder(vat, existing.map(o => o.purchaseOrder))

  const result = await prisma.$transaction(async tx => {
    const order = await tx.astPurchaseOrder.create({
      data: {
        vat,
        purchaseOrder,
        customerName: customerName.trim(),
        fabricId: fabricId?.trim() ?? null,
        fabricStructure: fabricStructure?.trim() ?? null,
        fabricPattern: fabricPattern?.trim() ?? null,
        orderSumM: orderSumM ? parseFloat(orderSumM) : null,
        priceYard: priceYard ? parseFloat(priceYard) : null,
        priceM: priceM ? parseFloat(priceM) : null,
        discountP: discountP ? parseFloat(discountP) : null,
        discountYard: discountYard ? parseFloat(discountYard) : null,
        commission: commission ? parseFloat(commission) : null,
        deadline: deadlineDate ?? null,
        status: 'รอดำเนินการ',
        createDate: new Date(),
      },
    })

    await tx.fabricAst.create({
      data: {
        purchaseOrder,
        fabricW: fabricW?.trim() ?? null,
        vat,
      },
    })

    await tx.fabricAstStructure.create({
      data: {
        purchaseOrder,
        yarnWRatio2: 'รอดำเนินการ',
      },
    })

    if (deadlineDate) {
      await tx.orderDeadline.create({
        data: {
          purchaseOrder,
          dt: new Date(deadlineDate),
          label: 'กำหนดส่ง',
        },
      })
    }

    if (comment?.trim()) {
      await tx.astPurchaseOrder.update({
        where: { purchaseOrder },
        data: { deadline: comment.trim() },
      })
    }

    return order
  })

  return Response.json({ order: result, purchaseOrder }, { status: 201 })
}
