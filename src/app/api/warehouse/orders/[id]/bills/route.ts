import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const order = await prisma.astPurchaseOrder.findUnique({
    where: { id: Number(id) },
    select: { id: true, purchaseOrder: true, customerName: true }
  })
  if (!order) return Response.json({ error: 'Not found' }, { status: 404 })

  const bills = await prisma.$queryRaw`
    SELECT
      f."vatType",
      f."vatNo"::int as "vatNo",
      MAX(f."customerName") as "customerName",
      MAX(f."receiveName") as "receiveName",
      MAX(f."fabricStruct") as "fabricStruct",
      MAX(f."fabricPattern") as "fabricPattern",
      MAX(f."fabricW") as "fabricW",
      MAX(f."createDate") as "createDate",
      COUNT(*)::int as "foldCount",
      SUM(f."sumYard") as "totalYard"
    FROM fabricouts f
    WHERE f.deleted_at IS NULL
      AND (
        f."purchaseOrder" = ${order.purchaseOrder}
        OR f."orderId" = ${order.id}
      )
    GROUP BY f."vatType", f."vatNo"
    ORDER BY MAX(f."createDate") DESC
  ` as any[]

  return Response.json({ bills, order })
}
