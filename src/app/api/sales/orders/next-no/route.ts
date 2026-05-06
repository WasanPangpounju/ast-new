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
  const vat = searchParams.get('vat') ?? 'SO'

  if (!['SO', 'SOX', 'SOB'].includes(vat))
    return Response.json({ error: 'ประเภทไม่ถูกต้อง' }, { status: 400 })

  const existing = await prisma.astPurchaseOrder.findMany({
    where: { vat, deletedAt: null },
    select: { purchaseOrder: true },
  })
  const purchaseOrder = nextPurchaseOrder(vat, existing.map(o => o.purchaseOrder))
  return Response.json({ purchaseOrder })
}
