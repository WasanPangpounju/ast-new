import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { NextRequest } from 'next/server'

// Legacy sentinel: FabricReturnPage ("ส่งคืนบรรจุภัณฑ์") reuses this same table/endpoint
// for packaging-returned-to-supplier logs, tagging rows with yarnType = PACKAGING_SENTINEL
// and weightReturn = 0. `scope` keeps that legacy data out of real material-stock-return
// listings (and vice versa) without a schema migration.
const PACKAGING_SENTINEL = 'บรรจุภัณฑ์'
const LBS_PER_KG = 2.2046

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const page  = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 20
  const scope    = searchParams.get('scope')    ?? 'material'
  const search   = searchParams.get('search')   ?? ''
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo   = searchParams.get('dateTo')   ?? ''

  const where: Record<string, unknown> = {
    deletedAt: null,
    yarnType: scope === 'packaging' ? PACKAGING_SENTINEL : { not: PACKAGING_SENTINEL },
  }
  if (search) {
    where.OR = [
      { returnId:     { contains: search, mode: 'insensitive' } },
      { yarnType:      { contains: search, mode: 'insensitive' } },
      { supplierName:  { contains: search, mode: 'insensitive' } },
      { lot:           { contains: search, mode: 'insensitive' } },
    ]
  }
  if (dateFrom || dateTo) {
    where.returnDate = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(dateTo + 'T23:59:59') } : {}),
    }
  }

  const [records, total] = await Promise.all([
    prisma.materialReturn.findMany({
      where,
      orderBy: { returnDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.materialReturn.count({ where }),
  ])

  return Response.json({
    records: records.map((r) => ({
      id:           r.id,
      returnId:     r.returnId,
      lot:          r.lot,
      yarnType:     r.yarnType,
      supplierName: r.supplierName,
      spool:        r.spool,
      weightReturn: r.weightReturn,
      weightReturnP: r.weightReturn * LBS_PER_KG,
      note:         r.note,
      returnDate:   r.returnDate.toISOString(),
      createdAt:    r.createdAt.toISOString(),
    })),
    total,
    page,
  })
}

const returnSchema = z.object({
  lot:          z.string().optional(),
  yarnType:     z.string().min(1),
  supplierName: z.string().optional(),
  spool:        z.number().int().positive(),
  weightReturn: z.number().positive(),
  materialId:   z.number().int().optional(),
  note:         z.string().optional(),
  returnDate:   z.string().optional(),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = returnSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const { lot, yarnType, supplierName, spool, weightReturn, materialId, note, returnDate } = parsed.data

  let resolvedMaterialId = materialId ?? null
  if (resolvedMaterialId == null && (supplierName || yarnType)) {
    const found = await prisma.material.findFirst({
      where: {
        deletedAt: null,
        ...(yarnType     ? { yarnType }     : {}),
        ...(supplierName ? { supplierName } : {}),
        ...(lot          ? { lot }          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (found) resolvedMaterialId = found.id
  }

  try {
    const data = await prisma.materialReturn.create({
      data: {
        returnId:    crypto.randomUUID(),
        lot:         lot || null,
        yarnType,
        supplierName: supplierName || null,
        spool,
        weightReturn,
        note:        note || null,
        returnDate:  returnDate ? new Date(returnDate) : new Date(),
        ...(resolvedMaterialId != null && { materialId: resolvedMaterialId }),
      },
    })
    return Response.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}

const patchSchema = z.object({
  lot:          z.string().nullable().optional(),
  yarnType:     z.string().min(1).optional(),
  supplierName: z.string().nullable().optional(),
  spool:        z.number().int().positive().optional(),
  weightReturn: z.number().positive().optional(),
  note:         z.string().nullable().optional(),
  returnDate:   z.string().optional(),
})

export async function PATCH(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get('id')
  const id = idParam ? parseInt(idParam, 10) : NaN
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Guard both directions of the scope split (see PACKAGING_SENTINEL comment above):
  // never let this endpoint turn a real material return into a packaging-sentinel row,
  // and never let it edit an existing packaging-sentinel row (that belongs to
  // FabricReturnPage's flow, not this one).
  if (parsed.data.yarnType === PACKAGING_SENTINEL) {
    return Response.json({ error: 'Invalid yarnType' }, { status: 400 })
  }

  const { lot, yarnType, supplierName, spool, weightReturn, note, returnDate } = parsed.data

  try {
    const existing = await prisma.materialReturn.findUnique({ where: { id } })
    if (!existing || existing.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.yarnType === PACKAGING_SENTINEL) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const updated = await prisma.materialReturn.update({
      where: { id },
      data: {
        ...(lot          !== undefined && { lot:          lot || null }),
        ...(yarnType      !== undefined && { yarnType }),
        ...(supplierName !== undefined && { supplierName: supplierName || null }),
        ...(spool        !== undefined && { spool }),
        ...(weightReturn !== undefined && { weightReturn }),
        ...(note         !== undefined && { note:         note || null }),
        ...(returnDate   !== undefined && { returnDate:   new Date(returnDate) }),
      },
    })
    return Response.json({ success: true, data: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get('id')
  const id = idParam ? parseInt(idParam, 10) : NaN
  if (isNaN(id)) {
    return Response.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const existing = await prisma.materialReturn.findUnique({ where: { id } })
    if (!existing || existing.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.materialReturn.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
