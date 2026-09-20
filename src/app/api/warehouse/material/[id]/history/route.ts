import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { MATERIAL_AUDIT_TABLE, materialRecordKey } from '@/lib/materialAudit'
import type { NextRequest } from 'next/server'

type Params = { params: Promise<{ id: string }> }

// GET /api/warehouse/material/[id]/history — audit rows, newest first
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  try {
    await requirePermission(session, 'material.history')
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }

  const id = parseInt((await params).id, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const rows = await prisma.auditLog.findMany({
    where: { tableName: MATERIAL_AUDIT_TABLE, recordKey: materialRecordKey(id) },
    orderBy: [{ changedAt: 'desc' }, { id: 'asc' }],
    take: 500,
  })
  return Response.json({ data: rows })
}
