import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// ใช้กับ 3 ช่องค้นหาในหน้าออร์เดอร์ลูกค้า (/warehouse/orders): ลูกค้า, เลขที่ใบสั่งซื้อ,
// รหัสผ้า — กรองด้วย status เดียวกับที่หน้ารายการแสดงผลจริง (ค่า default ของ
// /api/warehouse/orders) เพื่อไม่ให้ suggestion โชว่ค่าที่กดค้นหาแล้วไม่เจอผลลัพธ์
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  const field = request.nextUrl.searchParams.get('field') ?? 'customerName'
  if (!q) return Response.json({ data: [] })

  const baseWhere = { deletedAt: null, status: 'อนุมัติให้ผลิต' } as const

  if (field === 'purchaseOrder') {
    const rows = await prisma.astPurchaseOrder.findMany({
      where: { ...baseWhere, purchaseOrder: { contains: q, mode: 'insensitive' } },
      select: { purchaseOrder: true },
      distinct: ['purchaseOrder'],
      orderBy: { purchaseOrder: 'asc' },
      take: 10,
    })
    return Response.json({ data: rows.map((r) => r.purchaseOrder).filter((v): v is string => !!v) })
  }

  if (field === 'fabricId') {
    const rows = await prisma.astPurchaseOrder.findMany({
      where: { ...baseWhere, fabricId: { contains: q, mode: 'insensitive' } },
      select: { fabricId: true },
      distinct: ['fabricId'],
      orderBy: { fabricId: 'asc' },
      take: 10,
    })
    return Response.json({ data: rows.map((r) => r.fabricId).filter((v): v is string => !!v) })
  }

  // default: customerName
  const rows = await prisma.astPurchaseOrder.findMany({
    where: { ...baseWhere, customerName: { contains: q, mode: 'insensitive' } },
    select: { customerName: true },
    distinct: ['customerName'],
    orderBy: { customerName: 'asc' },
    take: 10,
  })
  return Response.json({ data: rows.map((r) => r.customerName).filter((v): v is string => !!v) })
}
