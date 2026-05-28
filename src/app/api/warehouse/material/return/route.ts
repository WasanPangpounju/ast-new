import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const page  = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = 20
  const search   = searchParams.get('search')   ?? ''
  const dateFrom = searchParams.get('dateFrom') ?? ''
  const dateTo   = searchParams.get('dateTo')   ?? ''

  const where: Record<string, unknown> = { deletedAt: null }
  if (search) where.yarnType = { contains: search, mode: 'insensitive' }
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
