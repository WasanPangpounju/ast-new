import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { BILL_AUDIT_TABLE, billRecordKey } from '@/lib/billAudit'
import type { NextRequest } from 'next/server'

class BulkDeleteError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'BulkDeleteError'
  }
}

// POST — soft-delete several folds (ม้วน) of one bill at once. All-or-nothing:
// every id must belong to this vatType+vatNo and still be live, otherwise the
// whole request is rejected. Deleting every fold of the bill is refused — that
// is "ลบบิล" (api/warehouse/bill DELETE), not a fold edit.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await requirePermission(session, 'warehouse.bill')
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }

  const body = await request.json()
  const { vatType, vatNo, ids } = body
  if (!vatType || vatNo == null) return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })
  if (!Array.isArray(ids) || ids.length === 0) return Response.json({ error: 'ids required' }, { status: 400 })
  const idList = [...new Set(ids.map((v: unknown) => Number(v)))]
  if (idList.some(n => !Number.isInteger(n) || n <= 0)) {
    return Response.json({ error: 'ids must be positive integers' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const live = await tx.fabricOut.findMany({
        where: { vatType, vatNo: Number(vatNo), deletedAt: null },
        select: { id: true, sumYard: true },
      })
      const liveMap = new Map(live.map(f => [f.id, f]))
      if (idList.some(id => !liveMap.has(id))) {
        throw new BulkDeleteError('มีพับที่ไม่อยู่ในบิลนี้หรือถูกลบไปแล้ว — กรุณาโหลดใหม่', 409)
      }
      if (idList.length >= live.length) {
        throw new BulkDeleteError('ไม่สามารถลบทุกพับได้ — หากต้องการลบทั้งบิลให้ใช้ปุ่ม "ลบบิล"', 400)
      }

      await tx.fabricOut.updateMany({
        where: { id: { in: idList }, deletedAt: null },
        data: { deletedAt: new Date() },
      })

      const changedBy = session.user?.email ?? session.user?.name ?? 'unknown'
      await tx.auditLog.createMany({
        data: idList.map(id => ({
          tableName: BILL_AUDIT_TABLE,
          recordKey: billRecordKey(vatType, Number(vatNo)),
          fieldName: 'fold.delete',
          oldValue: String(liveMap.get(id)!.sumYard),
          newValue: null,
          changedBy,
        })),
      })

      const deletedYard = idList.reduce((s, id) => s + Number(liveMap.get(id)!.sumYard), 0)
      return { count: idList.length, deletedYard }
    })

    return Response.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof BulkDeleteError) return Response.json({ error: err.message }, { status: err.status })
    console.error('[bill/folds/bulk-delete POST]', err)
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
