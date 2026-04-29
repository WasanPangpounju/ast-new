import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

async function main() {
  process.stdout.write('Backfilling fabricOut.purchaseOrder and orderId from MySQL...\n')

  const db = await mysql.createConnection(process.env.MYSQL_SOURCE_URL!)

  const [rows]: any = await db.query(
    'SELECT id, purchaseOrder, orderId FROM fabricouts WHERE purchaseOrder IS NOT NULL OR orderId IS NOT NULL ORDER BY id ASC'
  )
  await db.end()

  process.stdout.write('MySQL rows with purchase_order or order_id: ' + rows.length + '\n')
  process.stdout.write('Sample:\n' + JSON.stringify(rows.slice(0, 3), null, 2) + '\n\n')

  let fixed = 0, skipped = 0
  for (const row of rows) {
    try {
      await prisma.fabricOut.update({
        where: { id: Number(row.id) },
        data: {
          purchaseOrder: row.purchaseOrder ?? null,
          orderId: row.orderId ? Number(row.orderId) : null,
        },
      })
      fixed++
    } catch (e: any) {
      skipped++
      if (skipped <= 5) process.stdout.write(`  skip id=${row.id}: ${e.message.slice(0, 80)}\n`)
    }
  }

  process.stdout.write(`Done: ${fixed} updated, ${skipped} skipped\n`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
