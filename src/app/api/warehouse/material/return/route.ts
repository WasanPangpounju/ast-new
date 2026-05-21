import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { NextRequest } from 'next/server'

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
