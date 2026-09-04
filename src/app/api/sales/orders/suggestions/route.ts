import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// ใช้กับช่องค้นหา "SO หรือชื่อลูกค้า" ในหน้าตรวจสอบใบสั่งขาย (/sales/orders/review)
// แนะนำชื่อลูกค้าที่มีอยู่ในระบบ กรอง deletedAt เดียวกับ /api/sales/orders
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return Response.json({ data: [] })

  const rows = await prisma.astPurchaseOrder.findMany({
    where: { deletedAt: null, customerName: { contains: q, mode: 'insensitive' } },
    select: { customerName: true },
    distinct: ['customerName'],
    orderBy: { customerName: 'asc' },
    take: 10,
  })
  return Response.json({ data: rows.map(r => r.customerName).filter((v): v is string => !!v) })
}
