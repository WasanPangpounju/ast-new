import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@/generated/prisma/client/client'

const LBS_PER_KG = 2.2046

const requisitionSchema = z.object({
  materialId: z.number().int().optional(),
  withdrawId: z.string().min(1).optional(),
  department: z.string().min(1),
  spool: z.number().int().positive(),
  weightWithdrawn: z.number().positive(),
  note: z.string().optional(),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = requisitionSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { materialId, withdrawId, department, spool, weightWithdrawn, note } = parsed.data

  if (materialId != null) {
    const material = await prisma.material.findUnique({ where: { id: materialId } })
    if (!material || material.deletedAt !== null) {
      return Response.json({ error: 'Material not found' }, { status: 404 })
    }
  }

  try {
    const data = await prisma.materialRequisition.create({
      data: {
        withdrawId: withdrawId ?? crypto.randomUUID(),
        department,
        spool,
        weightWithdrawn,
        note,
        ...(materialId != null && { materialId }),
      },
    })
    return Response.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/requisition POST] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()
  const materialIdParam = params.get('materialId')
  const materialId = materialIdParam ? parseInt(materialIdParam, 10) : undefined
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10)))
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')

  const where: Prisma.MaterialRequisitionWhereInput = { deletedAt: null }

  if (materialId != null && !isNaN(materialId)) where.materialId = materialId

  if (dateFrom || dateTo) {
    const createdAtFilter: Prisma.DateTimeFilter = {}
    if (dateFrom) createdAtFilter.gte = new Date(dateFrom)
    if (dateTo) createdAtFilter.lte = new Date(dateTo)
    where.createdAt = createdAtFilter
  }

  if (q) {
    where.OR = [
      { withdrawId: { contains: q, mode: 'insensitive' } },
      { department: { contains: q, mode: 'insensitive' } },
      {
        material: {
          yarnType: { contains: q, mode: 'insensitive' },
        },
      },
    ]
  }

  try {
    const [data, total] = await Promise.all([
      prisma.materialRequisition.findMany({
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
      prisma.materialRequisition.count({ where }),
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
    console.error('[material/requisition GET] error:', msg)
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
    const existing = await prisma.materialRequisition.findUnique({ where: { id } })
    if (!existing || existing.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    await prisma.materialRequisition.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/requisition DELETE] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
