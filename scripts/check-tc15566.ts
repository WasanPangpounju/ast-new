import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

async function main() {
  const db = await mysql.createConnection(process.env.MYSQL_SOURCE_URL!)

  // MySQL: row count, sum fold, sum yard
  const [mysqlRows]: any = await db.query(`
    SELECT
      COUNT(*) AS row_count,
      SUM(fold) AS sum_fold,
      SUM(sumYard) AS sum_yard,
      MIN(fold) AS min_fold,
      MAX(fold) AS max_fold,
      fabricStruct, fabricPattern, fabricW
    FROM stockfabrics
    WHERE fabricId = 'TC15566'
    GROUP BY fabricStruct, fabricPattern, fabricW
    ORDER BY sum_yard DESC
  `)
  console.log('\n=== MySQL ===')
  for (const r of mysqlRows) {
    console.log(`  struct: ${r.fabricStruct}`)
    console.log(`  pattern: ${r.fabricPattern}`)
    console.log(`  fabricW: ${r.fabricW}`)
    console.log(`  row_count: ${r.row_count}  |  sum_fold: ${r.sum_fold}  |  sum_yard: ${r.sum_yard}`)
    console.log(`  fold range: ${r.min_fold} ~ ${r.max_fold}`)
    console.log()
  }

  // PG: เหมือนกัน
  const pgRows: any = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int AS row_count,
      SUM(fold)::int AS sum_fold,
      ROUND(SUM("sumYard")::numeric, 2) AS sum_yard,
      MIN(fold)::int AS min_fold,
      MAX(fold)::int AS max_fold,
      "fabricStruct", "fabricPattern", "fabricW"
    FROM stockfabrics
    WHERE "fabricCode" = 'TC15566'
      AND deleted_at IS NULL
    GROUP BY "fabricStruct", "fabricPattern", "fabricW"
    ORDER BY sum_yard DESC
  `)
  console.log('=== PostgreSQL ===')
  for (const r of pgRows) {
    console.log(`  struct: ${r.fabricStruct}`)
    console.log(`  pattern: ${r.fabricPattern}`)
    console.log(`  fabricW: ${r.fabricW}`)
    console.log(`  row_count: ${r.row_count}  |  sum_fold: ${r.sum_fold}  |  sum_yard: ${r.sum_yard}`)
    console.log(`  fold range: ${r.min_fold} ~ ${r.max_fold}`)
    console.log()
  }

  await db.end()
  await prisma.$disconnect()
}

main().catch(e => { console.error(e.message); process.exit(1) })
