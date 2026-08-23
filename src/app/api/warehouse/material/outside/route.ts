import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@/generated/prisma/client/client'
import { buildOutsideObligationsData, PackageReturnError } from '@/lib/package-return-obligations'

const LBS_PER_KG = 2.2046

const outsideSchema = z.object({
  withdrawId:      z.string().min(1).optional(),
  lot:             z.string().optional(),
  yarnType:        z.string().min(1),
  supplierName:    z.string().optional(),
  spool:           z.number().int().positive(),
  weightWithdrawn: z.number().positive(),
  weightPSum:      z.number().optional(),
  weightKgSum:     z.number().optional(),
  weightPPackage:  z.number().optional(),
  weightKgPackage: z.number().optional(),
  averageP:        z.number().optional(),
  averageKg:       z.number().optional(),
  materialId:      z.number().int().optional(),
  note:            z.string().optional(),
  withdrawDate:    z.string().optional(),
  pallet:          z.number().int().optional(),
  palletType:      z.string().optional(),
  box:             z.number().int().optional(),
  sack:            z.number().int().optional(),
  sackType:        z.string().optional(),
  paperBar:        z.number().int().optional(),
  spoolType:       z.string().optional(),
  returnPallet:    z.boolean().optional(),
  returnBox:       z.boolean().optional(),
  returnSack:      z.boolean().optional(),
  returnSpool:     z.boolean().optional(),
  returnPaperBar:  z.boolean().optional(),
  recipient:       z.string().optional(),
  usageNote:       z.string().optional(),
  paymentComment:  z.string().optional(),
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
          averageP, averageKg, materialId, note, withdrawDate,
          pallet, palletType, box, sack, sackType, paperBar, spoolType,
          returnPallet, returnBox, returnSack, returnSpool, returnPaperBar,
          recipient, usageNote, paymentComment } = parsed.data

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
    const data = await prisma.$transaction(async tx => {
      const outside = await tx.materialOutside.create({
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
          withdrawDate:    withdrawDate ? new Date(withdrawDate) : new Date(),
          pallet:          pallet          ?? null,
          palletType:      palletType      || null,
          box:             box             ?? null,
          sack:            sack            ?? null,
          sackType:        sackType        || null,
          paperBar:        paperBar        ?? null,
          spoolType:       spoolType       || null,
          returnPallet:    returnPallet    ?? false,
          returnBox:       returnBox       ?? false,
          returnSack:      returnSack      ?? false,
          returnSpool:     returnSpool     ?? false,
          returnPaperBar:  returnPaperBar  ?? false,
          recipient:       recipient       || null,
          usageNote:       usageNote       || null,
          paymentComment:  paymentComment  || null,
          ...(resolvedMaterialId != null && { materialId: resolvedMaterialId }),
        },
      })

      const obligationsData = buildOutsideObligationsData(outside, recipient || null)
      if (obligationsData.length > 0) {
        await tx.packageReturnObligation.createMany({ data: obligationsData })
      }

      return outside
    })
    return Response.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/outside POST] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

const patchSchema = z.object({
  supplierName:    z.string().nullable().optional(),
  yarnType:        z.string().min(1).optional(),
  lot:             z.string().nullable().optional(),
  spool:           z.number().int().positive().optional(),
  weightWithdrawn: z.number().positive().optional(),
  weightPSum:      z.number().nullable().optional(),
  weightKgSum:     z.number().nullable().optional(),
  weightPPackage:  z.number().nullable().optional(),
  weightKgPackage: z.number().nullable().optional(),
  averageP:        z.number().nullable().optional(),
  averageKg:       z.number().nullable().optional(),
  note:            z.string().nullable().optional(),
  withdrawDate:    z.string().optional(),
  pallet:          z.number().int().nullable().optional(),
  palletType:      z.string().nullable().optional(),
  box:             z.number().int().nullable().optional(),
  sack:            z.number().int().nullable().optional(),
  sackType:        z.string().nullable().optional(),
  paperBar:        z.number().int().nullable().optional(),
  spoolType:       z.string().nullable().optional(),
  returnPallet:    z.boolean().optional(),
  returnBox:       z.boolean().optional(),
  returnSack:      z.boolean().optional(),
  returnSpool:     z.boolean().optional(),
  returnPaperBar:  z.boolean().optional(),
  recipient:       z.string().nullable().optional(),
  usageNote:       z.string().nullable().optional(),
  paymentComment:  z.string().nullable().optional(),
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

  try {
    const existing = await prisma.materialOutside.findUnique({ where: { id } })
    if (!existing || existing.deletedAt !== null) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const { withdrawDate, ...rest } = parsed.data
    const updated = await prisma.materialOutside.update({
      where: { id },
      data: {
        ...rest,
        ...(withdrawDate !== undefined && { withdrawDate: new Date(withdrawDate) }),
      },
    })
    return Response.json({ success: true, data: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/outside PATCH] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const withdrawId   = (params.get('withdrawId')   ?? '').trim()
  const yarnType     = (params.get('yarnType')     ?? '').trim()
  const supplierName = (params.get('supplierName') ?? '').trim()
  const lot          = (params.get('lot')          ?? '').trim()
  const recipient    = (params.get('recipient')    ?? '').trim()
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

  if (withdrawId)   where.withdrawId   = { contains: withdrawId, mode: 'insensitive' }
  if (yarnType)     where.yarnType     = { contains: yarnType, mode: 'insensitive' }
  if (supplierName) where.supplierName = { contains: supplierName, mode: 'insensitive' }
  if (lot)          where.lot          = { contains: lot, mode: 'insensitive' }
  if (recipient)    where.recipient    = { contains: recipient, mode: 'insensitive' }

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

    // Block deletion while any package-return obligation tied to this withdrawal is still
    // open — deleting the source record used to silently orphan the obligation (it stayed
    // PENDING/PARTIALLY_RETURNED forever with no way to trace it back). Once every obligation
    // is RETURNED (or already soft-deleted), there's nothing left to strand.
    const openObligations = await prisma.packageReturnObligation.findMany({
      where: { materialOutsideId: id, deletedAt: null, status: { not: 'RETURNED' } },
      select: { category: true, variant: true, qtyDue: true, qtyReturned: true, status: true },
    })
    if (openObligations.length > 0) {
      const summary = openObligations
        .map(o => `${o.category}${o.variant ? `(${o.variant})` : ''} ${o.qtyReturned}/${o.qtyDue} ${o.status}`)
        .join(', ')
      throw new PackageReturnError(
        `ลบไม่ได้ — มีรายการค้างคืนบรรจุภัณฑ์ที่ยังไม่เสร็จสิ้น: ${summary}`,
        409
      )
    }

    await prisma.materialOutside.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return Response.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof PackageReturnError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[material/outside DELETE] error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
