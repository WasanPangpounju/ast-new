/**
 * patch-customer-replace.ts
 *
 * อัปเดต altPurchaseOrder ใน PostgreSQL จาก customerReplace ใน MySQL
 * โดย UPDATE เฉพาะ record ที่มี customerReplace ไม่ว่างใน MySQL
 * ไม่ TRUNCATE / ไม่กระทบ data อื่น
 *
 * ใช้งาน:
 *   npx tsx scripts/patch-customer-replace.ts
 *   npx tsx scripts/patch-customer-replace.ts --dry-run
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')

  console.log(DRY_RUN ? '🔍 DRY RUN\n' : '🔄 patch altPurchaseOrder ← customerReplace\n')

  const db = await mysql.createConnection(mysqlUrl)

  // ดึงเฉพาะ record ที่มี customerReplace ไม่ว่าง
  const [rows]: any = await db.query(`
    SELECT id, vatNo, vatType, customerReplace
    FROM fabricouts
    WHERE customerReplace IS NOT NULL AND customerReplace != ''
  `)
  console.log(`พบ ${rows.length} record ใน MySQL ที่มี customerReplace`)

  if (rows.length === 0) {
    console.log('ไม่มีอะไรต้องอัปเดต')
    await db.end()
    await prisma.$disconnect()
    return
  }

  let updated = 0
  let skipped = 0

  for (const row of rows as any[]) {
    const existing = await prisma.fabricOut.findFirst({
      where: { id: Number(row.id), deletedAt: null },
      select: { id: true, altPurchaseOrder: true },
    })

    if (!existing) { skipped++; continue }

    if (DRY_RUN) {
      console.log(`  [dry] id=${row.id} vatType=${row.vatType} vatNo=${row.vatNo} → "${row.customerReplace}"`)
      updated++
      continue
    }

    await prisma.fabricOut.update({
      where: { id: Number(row.id) },
      data: { altPurchaseOrder: String(row.customerReplace) },
    })
    updated++
  }

  console.log(`\n✅ อัปเดตแล้ว ${updated} record, ข้าม ${skipped} record (ไม่พบใน PG)`)

  await db.end()
  await prisma.$disconnect()
}

main().catch(e => {
  console.error('\n❌ Error:', e.message)
  process.exit(1)
})
