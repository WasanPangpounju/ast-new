import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

async function main() {
  process.stdout.write('Backfilling remaining fabricOut.purchaseOrder via orderId JOIN...\n')

  const db = await mysql.createConnection(process.env.MYSQL_SOURCE_URL!)

  const [rows]: any = await db.query(`
    SELECT f.id, p.purchaseOrder
    FROM fabricouts f
    INNER JOIN ast_purchaseorders p ON f.orderId = p.id
    WHERE f.purchaseOrder IS NULL AND f.orderId IS NOT NULL
    ORDER BY f.id ASC
  `)
  await db.end()

  process.stdout.write('Rows to fix via JOIN: ' + rows.length + '\n')

  let fixed = 0, skipped = 0
  for (const row of rows) {
    try {
      await prisma.fabricOut.update({
        where: { id: Number(row.id) },
        data: { purchaseOrder: row.purchaseOrder }
      })
      fixed++
      if (fixed % 2000 === 0) process.stdout.write('  progress: ' + fixed + '/' + rows.length + '\n')
    } catch (e: any) {
      skipped++
    }
  }
  process.stdout.write('Fixed: ' + fixed + ', Skipped: ' + skipped + '\n')

  const total = await prisma.fabricOut.count({ where: { purchaseOrder: { not: null } } })
  process.stdout.write('Total fabricOuts with purchaseOrder: ' + total + '\n')
}
main().catch(console.error).finally(() => prisma.$disconnect())
