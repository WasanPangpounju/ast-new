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
    customerName, fabricId, fabricStructure, fabricPattern,
    priceYard, priceM, discountP, discountYard, commission, orderSumM,
    deadline, comment, fabricW,
  } = body

  const order = await prisma.astPurchaseOrder.update({
    where: { id: Number(id) },
    data: {
      customerName: customerName?.trim() ?? undefined,
      fabricId: fabricId?.trim() ?? undefined,
      fabricStructure: fabricStructure?.trim() ?? undefined,
      fabricPattern: fabricPattern?.trim() ?? undefined,
      orderSumM: orderSumM !== undefined ? (orderSumM ? parseFloat(orderSumM) : null) : undefined,
      priceYard: priceYard !== undefined ? (priceYard ? parseFloat(priceYard) : null) : undefined,
      priceM: priceM !== undefined ? (priceM ? parseFloat(priceM) : null) : undefined,
      discountP: discountP !== undefined ? (discountP ? parseFloat(discountP) : null) : undefined,
      discountYard: discountYard !== undefined ? (discountYard ? parseFloat(discountYard) : null) : undefined,
      commission: commission !== undefined ? (commission ? parseFloat(commission) : null) : undefined,
      deadline: deadline?.trim() ?? undefined,
    },
  })

  if (fabricW !== undefined) {
    await prisma.fabricAst.upsert({
      where: { purchaseOrder: order.purchaseOrder },
      update: { fabricW: fabricW?.trim() ?? null },
      create: { purchaseOrder: order.purchaseOrder, fabricW: fabricW?.trim() ?? null },
    })
  }

  return Response.json({ order })
}
