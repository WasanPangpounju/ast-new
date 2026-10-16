import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'

  // Skips stock-deposit withdrawals' values: those are their deposit bill's refId
  // (the withdrawal link), not an orderer name to suggest.
  const rows = await prisma.$queryRaw<{ altPurchaseOrder: string }[]>`
    SELECT DISTINCT f."altPurchaseOrder"
    FROM fabricouts f
    WHERE f.deleted_at IS NULL
      AND f."altPurchaseOrder" IS NOT NULL
      AND (${q} = '' OR f."altPurchaseOrder" ILIKE ${like})
      AND NOT EXISTS (
        SELECT 1 FROM fabricouts d WHERE d."refId" = f."altPurchaseOrder" AND d."isDeposit"
      )
    ORDER BY f."altPurchaseOrder"
    LIMIT 20`

  return Response.json({ data: rows.map((r) => r.altPurchaseOrder) })
}
