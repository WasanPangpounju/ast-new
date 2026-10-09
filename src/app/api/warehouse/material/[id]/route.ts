import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { MATERIAL_AUDIT_TABLE, materialRecordKey, auditValue } from '@/lib/materialAudit'
import { bangkokMidnight } from '@/lib/bangkokDate'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import { PackageReturnError } from '@/lib/package-return-obligations'
import { deleteImportObligations, syncImportObligations } from '@/lib/material-obligation-sync'

type Params = { params: Promise<{ id: string }> }

async function resolveId(params: Params['params']): Promise<number | null> {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  return isNaN(id) ? null : id
}

// ─── GET /api/warehouse/material/[id] ────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const id = await resolveId(params)
  if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const material = await prisma.material.findUnique({
      where: { id },
      include: {
        requisitions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!material || material.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    return Response.json(material)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/[id] GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

// ─── PATCH /api/warehouse/material/[id] ──────────────────────────────────────

const patchSchema = z.object({
  supplierName:    z.string().min(1).optional(),
  importStatus:    z.string().optional(),
  yarnType:        z.string().min(1).optional(),
  lot:             z.string().optional(),
  spool:           z.number().int().positive().optional(),
  weightKgNet:     z.number().positive().optional(),
  weightKgSum:     z.number().positive().optional(),
  weightKgPackage: z.number().positive().optional(),
  weightPNet:      z.number().optional(),
  weightPSum:      z.number().optional(),
  weightPPackage:  z.number().optional(),
  averageKg:       z.number().optional(),
  averageP:        z.number().optional(),
  pallet:          z.number().int().min(0).optional(),
  box:             z.number().int().min(0).optional(),
  sack:            z.number().int().min(0).optional(),
  emp:             z.string().optional(),
  note:            z.string().optional(),
  // same YYYY-MM-DD format as entry POST; null clears the date
  importDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  try {
    await requirePermission(session, 'material.history')
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }

  const id = await resolveId(params)
  if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const existing = await prisma.material.findUnique({ where: { id } })
    if (!existing || existing.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const { importDate, ...rest } = parsed.data
    const data = {
      ...rest,
      // Bangkok midnight, same as synced rows — an unchanged date round-trips to the identical instant
      ...(importDate !== undefined && { importDate: importDate === null ? null : bangkokMidnight(importDate) }),
    }
    const changedBy = session?.user?.email ?? session?.user?.name ?? 'unknown'

    const updated = await prisma.$transaction(async (tx) => {
      // lock the import so two edits (or an edit and a delete) apply one after the other
      await tx.$queryRaw`SELECT id FROM materials WHERE id = ${id} FOR UPDATE`
      const before = await tx.material.findUnique({ where: { id } })
      if (!before || before.deletedAt !== null) throw new PackageReturnError('Not found', 404)

      // Field-level diff: only fields whose value actually changed get an audit row
      const changes = (Object.keys(data) as (keyof typeof data)[])
        .map(field => ({
          field,
          oldValue: auditValue(field, before[field as keyof typeof before]),
          newValue: auditValue(field, data[field]),
        }))
        .filter(c => c.oldValue !== c.newValue)

      const row = await tx.material.update({ where: { id }, data })
      if (changes.length > 0) {
        await tx.auditLog.createMany({
          data: changes.map(c => ({
            tableName: MATERIAL_AUDIT_TABLE,
            recordKey: materialRecordKey(id),
            fieldName: c.field,
            oldValue: c.oldValue,
            newValue: c.newValue,
            changedBy,
          })),
        })
      }
      // packaging quantities / company changed → ต้องส่งคืน follows (409 rolls the edit back)
      await syncImportObligations(tx, before, row, changedBy)
      return row
    })
    return Response.json({ success: true, data: updated })
  } catch (err: unknown) {
    if (err instanceof PackageReturnError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/[id] PATCH] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/warehouse/material/[id] ─────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  try {
    await requirePermission(session, 'material.history')
  } catch (err) {
    if (err instanceof PermissionError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }

  const id = await resolveId(params)
  if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const existing = await prisma.material.findUnique({ where: { id } })
    if (!existing || existing.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const changedBy = session?.user?.email ?? session?.user?.name ?? 'unknown'
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM materials WHERE id = ${id} FOR UPDATE`
      const row = await tx.material.findUnique({ where: { id }, select: { deletedAt: true } })
      if (!row || row.deletedAt !== null) throw new PackageReturnError('Not found', 404)
      // The import's ต้องส่งคืน goes with it; refused (409) once anything was returned against it —
      // those ใบคืน must be cancelled first, else the company keeps a due with no นำเข้า behind it.
      await deleteImportObligations(tx, id, changedBy)
      await tx.material.update({ where: { id }, data: { deletedAt: new Date() } })
      await tx.auditLog.create({
        data: {
          tableName: MATERIAL_AUDIT_TABLE,
          recordKey: materialRecordKey(id),
          fieldName: 'deleted',
          oldValue: 'false',
          newValue: 'true',
          changedBy,
        },
      })
    })
    return Response.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof PackageReturnError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/[id] DELETE] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
