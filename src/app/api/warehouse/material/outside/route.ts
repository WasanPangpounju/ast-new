import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@/generated/prisma/client/client'

const LBS_PER_KG = 2.2046

const outsideSchema = z.object({
  withdrawId:     z.string().min(1).optional(),
  lot:            z.string().optional(),
  yarnType:       z.string().min(1),
  supplierName:   z.string().optional(),
  spool:          z.number().int().positive(),
  weightWithdrawn: z.number().positive(),
  weightPSum:     z.number().optional(),
  weightKgSum:    z.number().optional(),
  weightPPackage: z.number().optional(),
  weightKgPackage: z.number().optional(),
  averageP:       z.number().optional(),
  averageKg:      z.number().optional(),
  materialId:     z.number().int().optional(),
  note:           z.string().optional(),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = outsideSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { withdrawId, lot, yarnType, supplierName, spool, weightWithdrawn,
          weightPSum, weightKgSum, weightPPackage, weightKgPackage,
          averageP, averageKg, materialId, note } = parsed.data

  let resolvedMaterialId = materialId ?? null
  if (resolvedMaterialId == null && (supplierName || yarnType)) {
    const found = await prisma.material.findFirst({
      where: {
        deletedAt: null,
        ...(yarnType    ? { yarnType }    : {}),
        ...(supplierName ? { supplierName } : {}),
        ...(lot         ? { lot }         : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (found) resolvedMaterialId = found.id
  } else if (resolvedMaterialId != null) {
    const material = await prisma.material.findUnique({ where: { id: resolvedMaterialId } })
    if (!material || material.deletedAt !== null) {
      return Response.json({ error: 'Material not found' }, { status: 404 })
    }
  }

  try {
    const data = await prisma.materialOutside.create({
      data: {
        withdrawId:      withdrawId ?? crypto.randomUUID(),
        lot:             lot || null,
        yarnType,
        supplierName:    supplierName || null,
        spool,
        weightWithdrawn,
        weightPSum:      weightPSum      ?? null,
        weightKgSum:     weightKgSum     ?? null,
        weightPPackage:  weightPPackage  ?? null,
        weightKgPackage: weightKgPackage ?? null,
        averageP:        averageP        ?? null,
        averageKg:       averageKg       ?? null,
        note:            note            || null,
        ...(resolvedMaterialId != null && { materialId: resolvedMaterialId }),
      },
    })
    return Response.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/outside POST] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q         = (params.get('q') ?? '').trim()
  const page      = Math.max(1, parseInt(params.get('page')  ?? '1',  10))
  const limit     = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10)))
  const dateFrom  = params.get('dateFrom')
  const dateTo    = params.get('dateTo')

  const where: Prisma.MaterialOutsideWhereInput = { deletedAt: null }

  if (dateFrom || dateTo) {
    const createdAtFilter: Prisma.DateTimeFilter = {}
    if (dateFrom) createdAtFilter.gte = new Date(dateFrom)
    if (dateTo)   createdAtFilter.lte = new Date(dateTo)
    where.createdAt = createdAtFilter
  }

  if (q) {
    where.OR = [
      { withdrawId:   { contains: q, mode: 'insensitive' } },
      { yarnType:     { contains: q, mode: 'insensitive' } },
      { supplierName: { contains: q, mode: 'insensitive' } },
      { lot:          { contains: q, mode: 'insensitive' } },
    ]
  }

  try {
    const [data, total] = await Promise.all([
      prisma.materialOutside.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          material: {
            select: { lot: true, yarnType: true, supplierName: true },
          },
        },
      }),
      prisma.materialOutside.count({ where }),
    ])

    return Response.json({
      data: data.map((row) => ({
        ...row,
        weightWithdrawnP: row.weightWithdrawn * LBS_PER_KG,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/outside GET] error:', msg)
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
    const existing = await prisma.materialOutside.findUnique({ where: { id } })
    if (!existing || existing.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.materialOutside.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/outside DELETE] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
