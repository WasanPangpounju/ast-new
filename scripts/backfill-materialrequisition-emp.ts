/**
 * backfill-materialrequisition-emp.ts
 * UPDATE materialrequisitions.emp จาก MySQL materialstores.emp
 * join ผ่าน id ตรงๆ (id เก็บจาก MySQL 1:1 ตั้งแต่ sync-from-mysql.ts)
 *
 * เฉพาะแถวที่ emp ปัจจุบันเป็น null/ว่าง เท่านั้น — กันไม่ให้ทับแถวที่ preserve ไว้
 * (เช่น id=33711 ที่ไม่มีคู่ MySQL แล้วถูกกรอกมือ)
 *
 * ใช้งาน:
 *   npx tsx scripts/backfill-materialrequisition-emp.ts             (dry-run, นับจำนวนแถวที่จะกระทบ)
 *   npx tsx scripts/backfill-materialrequisition-emp.ts --execute   (รัน UPDATE จริง)
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

const EXECUTE = process.argv.includes('--execute')
const BATCH = 500

async function main() {
  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')

  const db = await mysql.createConnection(mysqlUrl)
  console.log('✅ เชื่อมต่อ MySQL สำเร็จ')

  const [mysqlRows]: any = await db.query(
    "SELECT id, emp FROM materialstores WHERE emp IS NOT NULL AND emp <> ''"
  )
  const empById = new Map<number, string>(
    mysqlRows.map((r: any) => [Number(r.id), String(r.emp)])
  )
  console.log(`📥 MySQL materialstores.emp ที่มีค่า: ${mysqlRows.length} แถว`)

  const pgRows = await prisma.materialRequisition.findMany({
    where: { OR: [{ emp: null }, { emp: '' }] },
    select: { id: true },
  })
  console.log(`📥 PG materialrequisitions ที่ emp ว่าง/null: ${pgRows.length} แถว`)

  const targets = pgRows
    .map(r => ({ id: r.id, emp: empById.get(r.id) }))
    .filter((r): r is { id: number; emp: string } => r.emp !== undefined)

  console.log(`\n🔍 dry-run: จะกระทบ ${targets.length} แถว (id ที่มีคู่ MySQL และมี emp)`)
  if (targets.length > 0) {
    console.log('  ตัวอย่าง 10 แถวแรก:', targets.slice(0, 10))
  }

  if (!EXECUTE) {
    console.log('\n(dry-run เท่านั้น — รันด้วย --execute เพื่อ UPDATE จริง)')
    await db.end()
    await prisma.$disconnect()
    return
  }

  let updated = 0
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    await Promise.all(
      batch.map(t =>
        prisma.materialRequisition.updateMany({
          where: { id: t.id, OR: [{ emp: null }, { emp: '' }] },
          data: { emp: t.emp },
        })
      )
    )
    updated += batch.length
    process.stdout.write(`\r  อัปเดต: ${updated}/${targets.length}...`)
  }
  console.log(`\n✅ backfill เสร็จ — ${updated} แถว`)

  await db.end()
  await prisma.$disconnect()
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
