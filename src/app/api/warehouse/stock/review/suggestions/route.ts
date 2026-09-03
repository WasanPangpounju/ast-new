import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// ใช้กับช่อง "ค้นหา" ของหน้าตรวจสอบคีย์ผ้า (/warehouse/fabric-in/review) — ค้นหา
// ตรงกับ /api/warehouse/stock/review ที่จับคู่กับ emp/fabricStruct/customer แต่ suggestion
// นี้ใช้แค่ fabricStruct + customer (ชื่อที่พิมพ์ค้นหาบ่อยที่สุด)
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return Response.json({ data: [] })

  const [structs, customers] = await Promise.all([
    prisma.stockFabric.findMany({
      where: { deletedAt: null, isPurchased: false, fabricStruct: { contains: q, mode: 'insensitive' } },
      select: { fabricStruct: true },
      distinct: ['fabricStruct'],
      orderBy: { fabricStruct: 'asc' },
      take: 10,
    }),
    prisma.stockFabric.findMany({
      where: { deletedAt: null, isPurchased: false, customer: { contains: q, mode: 'insensitive' } },
      select: { customer: true },
      distinct: ['customer'],
      orderBy: { customer: 'asc' },
      take: 10,
    }),
  ])

  const merged = Array.from(
    new Set(
      [...structs.map((s) => s.fabricStruct), ...customers.map((c) => c.customer)].filter(
        (v): v is string => !!v,
      ),
    ),
  ).slice(0, 10)

  return Response.json({ data: merged })
}
