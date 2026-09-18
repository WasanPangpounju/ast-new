import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requirePermission, PermissionError } from '@/lib/permissions'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client/client'
import type { NextRequest } from 'next/server'
import type { Session } from 'next-auth'

// `data` is deliberately unvalidated beyond "is an object" — see the BillDraft
// model comment in schema.prisma: it mirrors whatever bill/create/page.tsx's
// form state looks like today, and that shape has changed repeatedly.
const dataSchema = z.record(z.string(), z.unknown())

// ─── GET /api/warehouse/bill/drafts ───────────────────────────────────────────
// Lists every shared draft (newest-saved first) — no owner filter, any holder
// of warehouse.bill-create can see/resume any draft.

export async function GET(_request: NextRequest) {
  try {
    const session = await auth()
    await requirePermission(session, 'warehouse.bill-create')
  } catch (err: unknown) {
    if (err instanceof PermissionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  try {
    const drafts = await prisma.billDraft.findMany({
      orderBy: { updatedAt: 'desc' },
    })

    // No Prisma relation from BillDraft to User (see schema.prisma comment —
    // the model stays deliberately minimal), so the updater's display name is
    // resolved here with a separate batched lookup instead of an include.
    const userIds = Array.from(
      new Set(drafts.map(d => d.updatedByUserId).filter((id): id is number => id != null)),
    )
    const users = userIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : []
    const nameById = new Map(users.map(u => [u.id, u.name]))

    const data = drafts.map(d => ({
      ...d,
      updatedByName: d.updatedByUserId != null ? (nameById.get(d.updatedByUserId) ?? null) : null,
    }))

    return Response.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bill/drafts GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

// ─── POST /api/warehouse/bill/drafts ──────────────────────────────────────────
// Creates a new draft. Returns it at version 1 so the client has a version to
// send back on its first PATCH.

const createSchema = z.object({ data: dataSchema })

export async function POST(request: NextRequest) {
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

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const userId = Number(session!.user!.id)
    const draft = await prisma.billDraft.create({
      data: {
        data: parsed.data.data as Prisma.InputJsonValue,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    })
    return Response.json({ success: true, data: draft }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bill/drafts POST] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
