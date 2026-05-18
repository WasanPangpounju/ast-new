import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { NextRequest } from 'next/server'

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
})

export async function PATCH(req: NextRequest, { params }: Params) {
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

    const updated = await prisma.material.update({
      where: { id },
      data: parsed.data,
    })
    return Response.json({ success: true, data: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/[id] PATCH] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/warehouse/material/[id] ─────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = await resolveId(params)
  if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const existing = await prisma.material.findUnique({ where: { id } })
    if (!existing || existing.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.material.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/[id] DELETE] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
