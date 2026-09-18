import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { claimRequestId, DuplicateRequestError } from '@/lib/idempotency'
import { BILL_AUDIT_TABLE, billRecordKey } from '@/lib/billAudit'
import type { NextRequest } from 'next/server'

class BillNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillNotFoundError'
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await requirePermission(session, 'warehouse.bill')
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }

  const vatType = request.nextUrl.searchParams.get('vatType')
  const vatNo = request.nextUrl.searchParams.get('vatNo')
  if (!vatType || vatNo == null) return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })

  const folds = await prisma.fabricOut.findMany({
    where: { vatType, vatNo: Number(vatNo), deletedAt: null },
    select: { id: true, fold: true, sumYard: true },
    orderBy: { id: 'asc' },
  })

  return Response.json({ folds: folds.map(f => ({ id: f.id, fold: f.fold, sumYard: Number(f.sumYard) })) })
}

// POST — add a new fold (ม้วน) retroactively to an existing bill. Clones every
// shared header field from the bill's own most-recent row (server-side, never
// trusts the client for these) so the new row stays grouped with its siblings
// in every query that aggregates by vatType+vatNo+those fields — see
// api/warehouse/bill GET's GROUP BY, which would otherwise silently split this
// bill into two rows in the bill list if even one field mismatched.
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
  const { vatType, vatNo, sumYard, requestId } = body
  if (!vatType || vatNo == null) return Response.json({ error: 'vatType and vatNo required' }, { status: 400 })
  const yard = Number(sumYard)
  if (!Number.isFinite(yard) || yard <= 0) {
    return Response.json({ error: 'sumYard must be a positive number' }, { status: 400 })
  }
  // Same per-click idempotency token as api/warehouse/bill POST — see
  // src/lib/idempotency.ts. Required, no silent fallback.
  if (typeof requestId !== 'string' || !requestId) {
    return Response.json({ error: 'requestId required — กรุณารีเฟรชหน้าเว็บแล้วลองใหม่' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const template = await tx.fabricOut.findFirst({
        where: { vatType, vatNo: Number(vatNo), deletedAt: null },
        orderBy: { id: 'desc' },
      })
      if (!template) throw new BillNotFoundError(`ไม่พบบิล ${vatType}-${vatNo}`)

      // Claimed inside this same transaction as the insert below — a retried
      // requestId rolls back atomically, never leaving a partial/duplicate row.
      await claimRequestId(tx, requestId, 'bill.folds.add')

      const created = await tx.fabricOut.create({
        data: {
          refId: template.refId,
          vatType: template.vatType,
          vatNo: template.vatNo,
          fold: 1,
          sumYard: yard,
          fabricStruct: template.fabricStruct,
          fabricPattern: template.fabricPattern,
          fabricW: template.fabricW,
          customerName: template.customerName,
          receiveName: template.receiveName,
          orderId: template.orderId,
          purchaseOrder: template.purchaseOrder,
          createDate: template.createDate,
          isDeposit: template.isDeposit,
          isStockSale: template.isStockSale,
          altFabricStruct: template.altFabricStruct,
          altPurchaseOrder: template.altPurchaseOrder,
          stockCustomer: template.stockCustomer,
          stockFabricStruct: template.stockFabricStruct,
          stockFabricPattern: template.stockFabricPattern,
          stockFabricW: template.stockFabricW,
        },
      })

      await tx.auditLog.create({
        data: {
          tableName: BILL_AUDIT_TABLE,
          recordKey: billRecordKey(vatType, Number(vatNo)),
          fieldName: 'fold.add',
          oldValue: null,
          newValue: JSON.stringify({ id: created.id, sumYard: yard }),
          changedBy: session.user?.email ?? session.user?.name ?? 'unknown',
        },
      })

      return { id: created.id, sumYard: yard }
    })

    return Response.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof DuplicateRequestError) {
      // Same requestId already succeeded once — report success (not an
      // error) so a client retry after a lost response treats it as done.
      return Response.json({ ok: true, alreadyProcessed: true })
    }
    if (err instanceof BillNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 })
    }
    console.error('[bill/folds POST]', err)
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await requirePermission(session, 'warehouse.bill')
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }

  const body = await request.json()
  const { id, sumYard } = body
  if (!id || sumYard == null) return Response.json({ error: 'id and sumYard required' }, { status: 400 })

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.fabricOut.findUnique({
        where: { id: Number(id) },
        select: { sumYard: true, vatType: true, vatNo: true },
      })
      if (!before) throw new BillNotFoundError('ไม่พบพับนี้')

      await tx.fabricOut.update({
        where: { id: Number(id) },
        data: { sumYard: Number(sumYard) },
      })

      await tx.auditLog.create({
        data: {
          tableName: BILL_AUDIT_TABLE,
          recordKey: billRecordKey(before.vatType, before.vatNo),
          fieldName: 'fold.edit',
          oldValue: String(before.sumYard),
          newValue: String(Number(sumYard)),
          changedBy: session.user?.email ?? session.user?.name ?? 'unknown',
        },
      })
    })
  } catch (err) {
    if (err instanceof BillNotFoundError) return Response.json({ error: err.message }, { status: 404 })
    console.error('[bill/folds PATCH]', err)
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }

  return Response.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await requirePermission(session, 'warehouse.bill')
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.fabricOut.findUnique({
        where: { id: Number(id) },
        select: { sumYard: true, vatType: true, vatNo: true },
      })
      if (!before) throw new BillNotFoundError('ไม่พบพับนี้')

      await tx.fabricOut.update({
        where: { id: Number(id) },
        data: { deletedAt: new Date() },
      })

      await tx.auditLog.create({
        data: {
          tableName: BILL_AUDIT_TABLE,
          recordKey: billRecordKey(before.vatType, before.vatNo),
          fieldName: 'fold.delete',
          oldValue: String(before.sumYard),
          newValue: null,
          changedBy: session.user?.email ?? session.user?.name ?? 'unknown',
        },
      })
    })
  } catch (err) {
    if (err instanceof BillNotFoundError) return Response.json({ error: err.message }, { status: 404 })
    console.error('[bill/folds DELETE]', err)
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }

  return Response.json({ ok: true })
}
