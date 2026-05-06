import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'ไม่ได้รับอนุญาต' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''
  const type = searchParams.get('type') ?? ''

  const where = {
    deletedAt: null,
    ...(q ? {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { tax: { contains: q, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(type ? { type } : {}),
  }

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: { name: 'asc' },
  })

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('ซัพพลายเออร์')

  sheet.columns = [
    { header: 'ลำดับ', key: 'index', width: 8 },
    { header: 'รหัส', key: 'id', width: 10 },
    { header: 'ชื่อ', key: 'name', width: 32 },
    { header: 'เลขที่ผู้เสียภาษี', key: 'tax', width: 20 },
    { header: 'ที่อยู่', key: 'address', width: 40 },
    { header: 'โทรศัพท์', key: 'tel', width: 16 },
    { header: 'อีเมล', key: 'email', width: 26 },
    { header: 'ประเภท', key: 'type', width: 16 },
    { header: 'วันที่เพิ่ม', key: 'createdAt', width: 16 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } }

  suppliers.forEach((s, i) => {
    const d = s.createdAt
    const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear() + 543}`
    sheet.addRow({
      index: i + 1,
      id: s.id,
      name: s.name,
      tax: s.tax ?? '',
      address: s.address ?? '',
      tel: s.tel ?? '',
      email: s.email ?? '',
      type: s.type ?? '',
      createdAt: dateStr,
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="suppliers.xlsx"',
    },
  })
}
