import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

const VALID_STATUSES = ['รอดำเนินการ', 'อนุมัติให้ผลิต', 'เสร็จสิ้น', 'ยกเลิก', 'no data']

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const { status } = await request.json()

  if (!VALID_STATUSES.includes(status))
    return Response.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })

  const order = await prisma.astPurchaseOrder.update({
    where: { id: Number(id) },
    data: { status },
  })

  await prisma.fabricAstStructure.upsert({
    where: { purchaseOrder: order.purchaseOrder },
    update: { yarnWRatio2: status },
    create: { purchaseOrder: order.purchaseOrder, yarnWRatio2: status },
  })

  return Response.json({ order })
}
