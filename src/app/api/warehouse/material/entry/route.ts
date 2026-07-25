import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@/generated/prisma/client/client'
import { resolveSupplierId, buildImportObligationsData } from '@/lib/package-return-obligations'

const itemSchema = z.object({
  lot: z.string().min(1),
  spool: z.number().int().positive(),
  yarnType: z.string().min(1),
  supplierName: z.string().min(1),
  importStatus: z.string().optional(),
  weightKgNet: z.number().positive(),
  weightKgSum: z.number().positive(),
  weightKgPackage: z.number().positive(),
  pallet: z.number().int().optional(),
  palletType: z.string().optional(),
  box: z.number().int().optional(),
  sack: z.number().int().optional(),
  sackType: z.string().optional(),
  paperBar: z.number().int().optional(),
  spoolType: z.string().optional(),
  returnPallet: z.boolean().optional(),
  returnBox: z.boolean().optional(),
  returnSack: z.boolean().optional(),
  returnSpool: z.boolean().optional(),
  returnPaperBar: z.boolean().optional(),
  weightPNet: z.number().optional(),
  weightPSum: z.number().optional(),
  weightPPackage: z.number().optional(),
  averageKg: z.number().optional(),
  averageP: z.number().optional(),
  emp: z.string().optional(),
  note: z.string().optional(),
})

const entrySchema = z.object({
  items: z.array(itemSchema).min(1),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = entrySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { items } = parsed.data

  try {
    const created = await prisma.$transaction(async tx => {
      const materials = []
      for (const item of items) {
        const material = await tx.material.create({ data: { ...item } })
        materials.push(material)

        const { supplierId, needsSupplierAssignment } = await resolveSupplierId(tx, material.supplierName)
        const obligationsData = buildImportObligationsData(material, supplierId, needsSupplierAssignment)
        if (obligationsData.length > 0) {
          await tx.packageReturnObligation.createMany({ data: obligationsData })
        }
      }
      return materials
    })
    return Response.json({ success: true, count: created.length, ids: created.map(r => r.id) })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/entry POST] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10)))
  const status = params.get('status') ?? undefined
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')

  const where: Prisma.MaterialWhereInput = { deletedAt: null }

  if (status) where.importStatus = status

  if (dateFrom || dateTo) {
    const createdAtFilter: Prisma.DateTimeFilter = {}
    if (dateFrom) createdAtFilter.gte = new Date(dateFrom)
    if (dateTo) createdAtFilter.lte = new Date(dateTo)
    where.createdAt = createdAtFilter
  }

  if (q) {
    where.OR = [
      { lot: { contains: q, mode: 'insensitive' } },
      { yarnType: { contains: q, mode: 'insensitive' } },
      { supplierName: { contains: q, mode: 'insensitive' } },
      { emp: { contains: q, mode: 'insensitive' } },
    ]
  }

  try {
    const [data, total] = await Promise.all([
      prisma.material.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.material.count({ where }),
    ])

    return Response.json({
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/entry GET] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
