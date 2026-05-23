/**
 * backfill-fabriccode.ts
 * UPDATE stockfabrics.fabricCode จาก MySQL stockfabrics.fabricId
 * สำหรับ row ที่ fabricCode ยังเป็น NULL
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

const BATCH = 500

async function main() {
  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')

  const db = await mysql.createConnection(mysqlUrl)
  console.log('✅ เชื่อมต่อ MySQL สำเร็จ')

  const [rows]: any = await db.query(
    'SELECT id, fabricId FROM stockfabrics WHERE fabricId IS NOT NULL AND fabricId <> \'\''
  )
  console.log(`📥 พบข้อมูล fabricId ใน MySQL: ${rows.length} แถว`)

  let updated = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch: { id: number; fabricId: string }[] = rows.slice(i, i + BATCH)
    await Promise.all(
      batch.map(r =>
        prisma.$executeRawUnsafe(
          `UPDATE stockfabrics SET "fabricCode" = $1 WHERE id = $2 AND ("fabricCode" IS NULL OR "fabricCode" = '')`,
          String(r.fabricId),
          Number(r.id)
        )
      )
    )
    updated += batch.length
    process.stdout.write(`\r  อัปเดต: ${updated}/${rows.length}...`)
  }

  console.log(`\n✅ backfill เสร็จ — ${updated} แถว`)

  const [stat]: any = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int FILTER (WHERE "fabricCode" IS NOT NULL AND "fabricCode" <> '') AS has_code,
      COUNT(*)::int FILTER (WHERE "fabricCode" IS NULL OR "fabricCode" = '')       AS no_code
    FROM stockfabrics WHERE deleted_at IS NULL
  `)
  console.log(`\nสรุป:  มีรหัสผ้า ${stat.has_code} แถว  |  ยังว่าง ${stat.no_code} แถว`)

  await db.end()
  await prisma.$disconnect()
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
