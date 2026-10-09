import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SUPPLIER_AUDIT_TABLE } from '@/lib/supplier-names'
import type { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const supplier = await prisma.supplier.findFirst({
    where: { id: Number(id), deletedAt: null },
  })
  if (!supplier) return Response.json({ error: 'ไม่พบข้อมูล' }, { status: 404 })

  const coordinators = await prisma.coordinator.findMany({
    where: { tax: supplier.tax ?? '' },
    orderBy: { id: 'asc' },
  })

  return Response.json({ supplier, coordinators })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { name, tax, address, tel, email, type } = body

  if (!name?.trim()) return Response.json({ error: 'กรุณากรอกชื่อซัพพลายเออร์' }, { status: 400 })

  const supplierId = Number(id)
  const newName = name.trim()
  const changedBy = session.user?.email ?? session.user?.name ?? 'unknown'

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${supplierId} FOR UPDATE`
    const current = await tx.supplier.findFirst({ where: { id: supplierId, deletedAt: null }, select: { name: true } })
    if (!current) return { status: 404, error: 'ไม่พบข้อมูล' }

    if (current.name !== newName) {
      // Imports keep the name they were keyed in with (materials.supplierName); the old name is
      // remembered below so the package-return summary still counts them (lib/supplier-names.ts).
      // Refuse renames that would leave it unclear which supplier those imports belong to.
      const sharingOld = await tx.supplier.findMany({ where: { name: current.name, deletedAt: null, id: { not: supplierId } }, select: { id: true } })
      if (sharingOld.length) {
        return { status: 409, error: `เปลี่ยนชื่อไม่ได้ — มีซัพพลายเออร์อีก ${sharingOld.length} รายการที่ใช้ชื่อเดียวกัน (รหัส ${sharingOld.map((x) => x.id).join(', ')}) ใบรับเข้าที่ใช้ชื่อนี้จะไม่รู้ว่าเป็นของรายการไหน` }
      }
      const takingNew = await tx.supplier.findFirst({ where: { name: newName, deletedAt: null, id: { not: supplierId } }, select: { id: true } })
      if (takingNew) {
        return { status: 409, error: `เปลี่ยนชื่อไม่ได้ — ชื่อ "${newName}" เป็นของซัพพลายเออร์รหัส ${takingNew.id} อยู่แล้ว` }
      }
      await tx.auditLog.create({
        data: { tableName: SUPPLIER_AUDIT_TABLE, recordKey: String(supplierId), fieldName: 'name', oldValue: current.name, newValue: newName, changedBy },
      })
    }

    const supplier = await tx.supplier.update({
      where: { id: supplierId },
      data: {
        name: newName,
        tax: tax?.trim() ?? null,
        address: address?.trim() ?? null,
        tel: tel?.trim() ?? null,
        email: email?.trim() ?? null,
        type: type?.trim() ?? null,
      },
    })
    return { status: 200, supplier }
  })
  if (result.status !== 200) return Response.json({ error: result.error }, { status: result.status })
  const supplier = result.supplier

  return Response.json({ supplier })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { id } = await params
  await prisma.supplier.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  })

  return Response.json({ success: true })
}
