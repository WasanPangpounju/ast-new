import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const sourceOrderId = searchParams.get('sourceOrderId')
  const purchaseOrder = searchParams.get('purchaseOrder')

  if (!sourceOrderId && !purchaseOrder)
    return Response.json({ error: 'ต้องระบุ sourceOrderId หรือ purchaseOrder' }, { status: 400 })

  try {
    const bos = await prisma.astBillOfStructure.findFirst({
      where: {
        deletedAt: null,
        ...(sourceOrderId ? { sourceOrderId: Number(sourceOrderId) } : {}),
        ...(purchaseOrder ? { purchaseOrder } : {}),
      },
      include: { deadlines: { orderBy: { dt: 'asc' } } },
    })
    if (!bos) return Response.json({ error: 'ไม่พบใบโครงสร้าง' }, { status: 404 })
    return Response.json({ billOfStructure: bos })
  } catch (e) {
    console.error('[bill-of-structures GET]', e)
    return Response.json({ error: 'โหลดข้อมูลไม่สำเร็จ' }, { status: 500 })
  }
}
