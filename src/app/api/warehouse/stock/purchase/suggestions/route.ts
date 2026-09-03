import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// field=supplier   → ใช้กับช่อง "ชื่อผู้ขาย / โรงงาน" ในฟอร์มคีย์ผ้าซื้อเข้า (/warehouse/stock/purchase)
// (ไม่ส่ง field)    → ใช้กับช่อง "ค้นหา" ในหน้าตรวจสอบผ้าซื้อเข้า (/warehouse/stock/purchase/review)
//                     ซึ่งค้นหาผู้ขาย/เลขที่บิล/โครงสร้างผ้ารวมกัน
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  const field = request.nextUrl.searchParams.get('field')
  if (!q) return Response.json({ data: [] })

  if (field === 'supplier') {
    const suppliers = await prisma.stockFabric.findMany({
      where: { deletedAt: null, isPurchased: true, supplier: { contains: q, mode: 'insensitive' } },
      select: { supplier: true },
      distinct: ['supplier'],
      orderBy: { supplier: 'asc' },
      take: 10,
    })
    return Response.json({ data: suppliers.map((s) => s.supplier).filter((v): v is string => !!v) })
  }

  const [suppliers, billRefs, structs] = await Promise.all([
    prisma.stockFabric.findMany({
      where: { deletedAt: null, isPurchased: true, supplier: { contains: q, mode: 'insensitive' } },
      select: { supplier: true },
      distinct: ['supplier'],
      orderBy: { supplier: 'asc' },
      take: 10,
    }),
    prisma.stockFabric.findMany({
      where: { deletedAt: null, isPurchased: true, billRef: { contains: q, mode: 'insensitive' } },
      select: { billRef: true },
      distinct: ['billRef'],
      orderBy: { billRef: 'asc' },
      take: 10,
    }),
    prisma.stockFabric.findMany({
      where: { deletedAt: null, isPurchased: true, fabricStruct: { contains: q, mode: 'insensitive' } },
      select: { fabricStruct: true },
      distinct: ['fabricStruct'],
      orderBy: { fabricStruct: 'asc' },
      take: 10,
    }),
  ])

  const merged = Array.from(
    new Set(
      [
        ...suppliers.map((s) => s.supplier),
        ...billRefs.map((b) => b.billRef),
        ...structs.map((s) => s.fabricStruct),
      ].filter((v): v is string => !!v),
    ),
  ).slice(0, 10)

  return Response.json({ data: merged })
}
