import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const vatType = searchParams.get('vatType') ?? 'all'
  const month = searchParams.get('month') ? Number(searchParams.get('month')) : null
  const year = searchParams.get('year') ? Number(searchParams.get('year')) : null

  const conditions: string[] = [`f.deleted_at IS NULL`]
  if (vatType && vatType !== 'all') conditions.push(`f."vatType" = '${vatType}'`)
  if (month && year) {
    const fromDate = new Date(year, month - 1, 1).toISOString()
    const toDate = new Date(year, month, 1).toISOString()
    conditions.push(`f."createDate" >= '${fromDate}' AND f."createDate" < '${toDate}'`)
  } else if (year) {
    const fromDate = new Date(year, 0, 1).toISOString()
    const toDate = new Date(year + 1, 0, 1).toISOString()
    conditions.push(`f."createDate" >= '${fromDate}' AND f."createDate" < '${toDate}'`)
  }

  const whereClause = conditions.join(' AND ')

  // เดิม GROUP BY แค่ vatType+vatNo (ต่อบิล) แล้วใช้ MAX() ดึง fabricStruct มาโชว์
  // ทำให้บิลที่มีสินค้าหลายชนิดผ้าถูกยุบเหลือแถวเดียว จึงเพิ่ม fabricStruct เข้าไปใน GROUP BY ด้วย
  // ให้แต่ละชนิดผ้าในบิลเดียวกันแยกเป็นคนละแถว ค่าที่แสดงจึงตรงกับข้อมูลจริงเสมอ
  // customerName/receiveName เป็นข้อมูลระดับบิล (เหมือนกันทุกแถวในบิลเดียวกัน) จึงใช้ MAX() ได้โดยไม่ต้องเข้า GROUP BY
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      f."vatType",
      f."vatNo"::text as "vatNo",
      MAX(f."customerName") as "customerName",
      MAX(f."receiveName") as "receiveName",
      f."fabricStruct",
      SUM(f.fold)::int as fold,
      ROUND(SUM(f."sumYard")::numeric, 2)::float as "sumYard",
      MIN(f."createDate") as "createDate"
    FROM fabricouts f
    WHERE ${whereClause}
    GROUP BY f."vatType", f."vatNo", f."fabricStruct"
    ORDER BY MIN(f."createDate") DESC, f."vatType", f."vatNo"
    LIMIT 500
  `) as any[]

  return Response.json({ rows: rows ?? [] })
}
