import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BILL_AUDIT_TABLE, billRecordKey } from '@/lib/billAudit'
import type { NextRequest } from 'next/server'

const FIELD_NAME = 'vatNo'

// PATCH — edit เลขที่บิล (vatType+vatNo) for every roll sharing the old vatType+vatNo
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { vatType, oldVatNo, newVatNo } = body
  if (!vatType || oldVatNo == null || newVatNo == null) {
    return Response.json({ error: 'vatType, oldVatNo and newVatNo required' }, { status: 400 })
  }

  const oldNo = Number(oldVatNo)
  const newNo = Number(newVatNo)
  if (!Number.isInteger(newNo) || newNo <= 0) {
    return Response.json({ error: 'เลขที่บิลใหม่ต้องเป็นจำนวนเต็มบวก' }, { status: 400 })
  }
  if (newNo === oldNo) {
    return Response.json({ ok: true, vatNo: oldNo }) // no-op, nothing changed
  }

  const existing = await prisma.fabricOut.findFirst({
    where: { vatType, vatNo: oldNo, deletedAt: null },
    select: { id: true },
  })
  if (!existing) {
    return Response.json({ error: `ไม่พบบิล ${vatType}-${oldNo}` }, { status: 404 })
  }

  // Duplicate check (authoritative — the frontend also blocks the obviously-invalid
  // cases before calling this endpoint, but this DB read is the real source of truth
  // since fabricouts has no unique constraint on (vatType, vatNo)).
  const duplicate = await prisma.fabricOut.findFirst({
    where: { vatType, vatNo: newNo, deletedAt: null },
    select: { id: true },
  })
  if (duplicate) {
    return Response.json({ error: `เลขที่บิล ${vatType}-${newNo} มีอยู่แล้ว กรุณาใช้เลขอื่น` }, { status: 409 })
  }

  await prisma.$transaction([
    prisma.fabricOut.updateMany({
      where: { vatType, vatNo: oldNo, deletedAt: null },
      data: { vatNo: newNo },
    }),
    prisma.auditLog.create({
      data: {
        tableName: BILL_AUDIT_TABLE,
        // Recorded under the *new* key so it's discoverable once the bill is looked up
        // by its new number going forward — see the caveat note in lib/billAudit.ts.
        recordKey: billRecordKey(vatType, newNo),
        fieldName: FIELD_NAME,
        oldValue: String(oldNo),
        newValue: String(newNo),
        changedBy: session.user?.email ?? session.user?.name ?? 'unknown',
      },
    }),
  ])

  return Response.json({ ok: true, vatNo: newNo })
}
