import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client/client'
import type { NextRequest } from 'next/server'
import type { Session } from 'next-auth'

type Params = { params: Promise<{ id: string }> }

async function resolveId(params: Params['params']): Promise<number | null> {
  const { id: idStr } = await params
  const id = parseInt(idStr, 10)
  return Number.isNaN(id) ? null : id
}

// ─── GET /api/warehouse/bill/drafts/[id] ──────────────────────────────────────

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    await requirePermission(session, 'warehouse.bill-create')
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  const id = await resolveId(params)
  if (id == null) return Response.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const draft = await prisma.billDraft.findUnique({ where: { id } })
    if (!draft) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ success: true, data: draft })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bill/drafts/[id] GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

// ─── PATCH /api/warehouse/bill/drafts/[id] ────────────────────────────────────
// Optimistic locking: the caller must send back the `version` it last read.
// updateMany (not update) targets id+version together, so a stale write
// touches 0 rows instead of throwing — that's how a real 404 is told apart
// from "someone else saved this draft first", which reports 409 so the
// client knows to reload before retrying.

const patchSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  let session: Session | null
  try {
    session = await auth()
    await requirePermission(session, 'warehouse.bill-create')
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  const id = await resolveId(params)
  if (id == null) return Response.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const userId = Number(session!.user!.id)
    const result = await prisma.billDraft.updateMany({
      where: { id, version: parsed.data.version },
      data: {
        data: parsed.data.data as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedByUserId: userId,
      },
    })

    if (result.count === 0) {
      const exists = await prisma.billDraft.findUnique({ where: { id }, select: { id: true } })
      if (!exists) return Response.json({ error: 'Not found' }, { status: 404 })
      return Response.json(
        { error: 'แบบร่างนี้ถูกแก้ไขโดยผู้ใช้อื่นไปแล้ว กรุณาโหลดใหม่' },
        { status: 409 },
      )
    }

    const draft = await prisma.billDraft.findUnique({ where: { id } })
    return Response.json({ success: true, data: draft })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bill/drafts/[id] PATCH] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/warehouse/bill/drafts/[id] ───────────────────────────────────

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await auth()
    await requirePermission(session, 'warehouse.bill-create')
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  const id = await resolveId(params)
  if (id == null) return Response.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const result = await prisma.billDraft.deleteMany({ where: { id } })
    if (result.count === 0) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bill/drafts/[id] DELETE] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
