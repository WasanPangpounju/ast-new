import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const vatType = searchParams.get('vatType') ?? 'all'
  const asOfDate = searchParams.get('asOfDate')

  const dateFilter = asOfDate ? `AND "createDate" < '${new Date(asOfDate).toISOString()}'` : ''
  const vatFilter = (vatType && vatType !== 'all') ? `AND "vatType" = '${vatType}'` : ''

  // หน้ากว้างในข้อมูลจริงมีหลายรูปแบบ เช่น "50", "50/V1-V1", "50/V-PST"
  // ให้ถือว่าเป็นหน้ากว้างเดียวกันโดยพิจารณาเฉพาะตัวเลขนำหน้า (ก่อน "/" หรือช่องว่างหรืออักษร)
  const fabricWNorm = `COALESCE(substring(trim("fabricW") from '^([0-9]+(?:\\.[0-9]+)?)'), trim("fabricW"))`

  const inRows = await prisma.$queryRawUnsafe(`
    SELECT
      "fabricStruct", "fabricPattern", ${fabricWNorm} as "fabricW",
      SUM(fold)::int as fold,
      ROUND(SUM("sumYard")::numeric, 2)::float as "sumYard"
    FROM stockfabrics
    WHERE deleted_at IS NULL ${dateFilter}
    GROUP BY "fabricStruct", "fabricPattern", ${fabricWNorm}
  `) as any[]

  const outRows = await prisma.$queryRawUnsafe(`
    SELECT
      "fabricStruct", "fabricPattern", ${fabricWNorm} as "fabricW",
      SUM(fold)::int as fold,
      ROUND(SUM("sumYard")::numeric, 2)::float as "sumYard"
    FROM fabricouts
    WHERE deleted_at IS NULL ${vatFilter} ${dateFilter}
    GROUP BY "fabricStruct", "fabricPattern", ${fabricWNorm}
  `) as any[]

  const totalIn = inRows.reduce((s: number, r: any) => s + Number(r.sumYard ?? 0), 0)
  const totalOut = outRows.reduce((s: number, r: any) => s + Number(r.sumYard ?? 0), 0)

  const map = new Map<string, any>()
  for (const r of inRows) {
    const key = `${r.fabricStruct}||${r.fabricPattern}||${r.fabricW}`
    map.set(key, { fabricStruct: r.fabricStruct, fabricPattern: r.fabricPattern, fabricW: r.fabricW, inYard: Number(r.sumYard ?? 0), outYard: 0 })
  }
  for (const r of outRows) {
    const key = `${r.fabricStruct}||${r.fabricPattern}||${r.fabricW}`
    const ex = map.get(key)
    if (ex) ex.outYard = Number(r.sumYard ?? 0)
    else map.set(key, { fabricStruct: r.fabricStruct, fabricPattern: r.fabricPattern, fabricW: r.fabricW, inYard: 0, outYard: Number(r.sumYard ?? 0) })
  }
  // หมายเหตุ: เดิมมี .filter(r => r.balanceYard !== 0) ตัดแถวที่ยอดรับเข้า/ส่งออกเท่ากันพอดีออกจากตาราง
  // แต่การ์ดสรุปยอด (totalIn/totalOut) รวมทุกแถวรวมถึงแถวที่ถูกตัดออกด้วย ทำให้ยอดในตาราง
  // ไม่เท่ากับยอดในการ์ดสรุป (ยิ่งเห็นชัดขึ้นหลังรวมกลุ่มด้วยหน้ากว้าง normalize เพราะมีแถวที่ยอดเท่ากันพอดีเพิ่มขึ้น)
  // จึงตัด filter ออก ให้ตารางแสดงครบทุกกลุ่มเพื่อให้ผลรวมตรงกับการ์ดเสมอ
  //
  // ถ้ารับเข้าสะสม = 0 หรือน้อยกว่าส่งออกสะสม (ข้อมูลผิดปกติ เช่น struct/หน้ากว้างตอนนำเข้ากับ
  // ตอนเบิกออกถูกบันทึกไม่ตรงกัน ทำให้คงเหลือติดลบ) ให้ตรึงรับเข้า = ส่งออก และคงเหลือ = 0
  // พร้อมตั้ง flag ไว้ให้ฝั่งแสดงผลรู้ว่าเป็นค่าที่ถูกตรึง (ไม่ใช่คงเหลือ 0 จากยอดสมดุลจริง)
  const clamp = (inYard: number, outYard: number) => {
    const anomaly = inYard === 0 || inYard < outYard
    return anomaly
      ? { inYard: outYard, outYard, balanceYard: 0, balanceAnomaly: true }
      : { inYard, outYard, balanceYard: inYard - outYard, balanceAnomaly: false }
  }

  const details = Array.from(map.values())
    .map(r => ({ fabricStruct: r.fabricStruct, fabricPattern: r.fabricPattern, fabricW: r.fabricW, ...clamp(r.inYard, r.outYard) }))
    .sort((a, b) => (a.fabricStruct ?? '').localeCompare(b.fabricStruct ?? '', 'th'))

  const totals = clamp(totalIn, totalOut)

  return Response.json({ totalIn: totals.inYard, totalOut: totals.outYard, balance: totals.balanceYard, balanceAnomaly: totals.balanceAnomaly, asOfDate, details })
}
