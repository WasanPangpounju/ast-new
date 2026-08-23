/**
 * check-order4198-null-stock.ts
 *
 * READ-ONLY: for order id 4198 (SO6810/14, พรชัยวิรัช, fabricId #527/17 60"),
 * list every fabricouts/FabricOut row and flag which ones have stock* fields
 * (stockCustomer/stockFabricStruct/stockFabricPattern/stockFabricW) set to NULL.
 *
 * Checks both MySQL and PostgreSQL. Does not write anything.
 *
 * Usage: npx tsx scripts/check-order4198-null-stock.ts
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

function fmtDate(v: any): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return d.toISOString().slice(0, 10)
}
function n(v: any): number {
  const x = parseFloat(v)
  return isNaN(x) ? 0 : x
}

async function main() {
  console.log('=== check-order4198-null-stock.ts (READ-ONLY) ===\n')
  const db = await mysql.createConnection(process.env.MYSQL_SOURCE_URL!)

  // ── MySQL ────────────────────────────────────────────────────────────────
  const [mRows]: any = await db.query(
    `SELECT id, createDate, vatType, vatNo, customerName, fold, sumYard,
            stockCustomer, stockFabricStruct, stockFabricPattern, stockFabricW
     FROM fabricouts WHERE orderId = 4198 ORDER BY id ASC`
  )

  const mByBill = new Map<string, any[]>()
  for (const r of mRows) {
    const key = `${r.vatType}${r.vatNo}`
    if (!mByBill.has(key)) mByBill.set(key, [])
    mByBill.get(key)!.push(r)
  }

  console.log(`[MySQL] Total fabricouts rows under order 4198: ${mRows.length}`)
  console.log(`[MySQL] Distinct bills: ${mByBill.size}\n`)
  console.log('[MySQL] Per-bill: rows with ANY stock* field NULL')
  console.log('บิล'.padEnd(10) + 'วันที่'.padEnd(12) + 'พับทั้งหมด'.padEnd(12) + 'พับที่ stock=NULL'.padEnd(20) + 'stockCustomer ตัวอย่าง')
  let mTotalNullRows = 0
  for (const [bill, rows] of [...mByBill.entries()].sort((a, b) => a[1][0].createDate < b[1][0].createDate ? -1 : 1)) {
    const nullRows = rows.filter(r => !r.stockCustomer && !r.stockFabricStruct && !r.stockFabricPattern && !r.stockFabricW)
    const partialNullRows = rows.filter(r => (!r.stockCustomer || !r.stockFabricStruct || !r.stockFabricPattern || !r.stockFabricW) && !(!r.stockCustomer && !r.stockFabricStruct && !r.stockFabricPattern && !r.stockFabricW))
    mTotalNullRows += nullRows.length
    console.log(
      `${bill.padEnd(10)}${fmtDate(rows[0].createDate).padEnd(12)}${String(rows.length).padEnd(12)}` +
      `${(nullRows.length + (partialNullRows.length ? ` (+${partialNullRows.length} partial)` : '')).padEnd(20)}` +
      `${rows[0].stockCustomer ?? '(null)'}`
    )
  }
  console.log(`\n[MySQL] Total rows with ALL 4 stock fields NULL: ${mTotalNullRows} / ${mRows.length}`)

  // ── PostgreSQL ───────────────────────────────────────────────────────────
  const pRows = await prisma.fabricOut.findMany({
    where: { orderId: 4198 },
    select: {
      id: true, createDate: true, vatType: true, vatNo: true, customerName: true, fold: true, sumYard: true,
      stockCustomer: true, stockFabricStruct: true, stockFabricPattern: true, stockFabricW: true, deletedAt: true,
    },
    orderBy: { id: 'asc' },
  })
  const pByBill = new Map<string, typeof pRows>()
  for (const r of pRows) {
    const key = `${r.vatType}${r.vatNo}`
    if (!pByBill.has(key)) pByBill.set(key, [])
    pByBill.get(key)!.push(r)
  }

  console.log(`\n[PostgreSQL] Total FabricOut rows under order 4198: ${pRows.length}`)
  console.log(`[PostgreSQL] Distinct bills: ${pByBill.size}\n`)
  console.log('[PostgreSQL] Per-bill: rows with ANY stock* field NULL')
  console.log('บิล'.padEnd(10) + 'วันที่'.padEnd(12) + 'พับทั้งหมด'.padEnd(12) + 'พับที่ stock=NULL'.padEnd(20) + 'stockCustomer ตัวอย่าง')
  let pTotalNullRows = 0
  for (const [bill, rows] of [...pByBill.entries()].sort((a, b) => a[1][0].createDate < b[1][0].createDate ? -1 : 1)) {
    const nullRows = rows.filter(r => !r.stockCustomer && !r.stockFabricStruct && !r.stockFabricPattern && !r.stockFabricW)
    const partialNullRows = rows.filter(r => (!r.stockCustomer || !r.stockFabricStruct || !r.stockFabricPattern || !r.stockFabricW) && !(!r.stockCustomer && !r.stockFabricStruct && !r.stockFabricPattern && !r.stockFabricW))
    pTotalNullRows += nullRows.length
    console.log(
      `${bill.padEnd(10)}${fmtDate(rows[0].createDate).padEnd(12)}${String(rows.length).padEnd(12)}` +
      `${(nullRows.length + (partialNullRows.length ? ` (+${partialNullRows.length} partial)` : '')).padEnd(20)}` +
      `${rows[0].stockCustomer ?? '(null)'}`
    )
  }
  console.log(`\n[PostgreSQL] Total rows with ALL 4 stock fields NULL: ${pTotalNullRows} / ${pRows.length}`)

  // ── Cross-check ──────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(70)}\nCROSS-CHECK\n${'='.repeat(70)}`)
  console.log(`MySQL rows: ${mRows.length}, PostgreSQL rows: ${pRows.length} -> ${mRows.length === pRows.length ? 'MATCH' : 'DIFFER'}`)
  console.log(`MySQL null-stock rows: ${mTotalNullRows}, PostgreSQL null-stock rows: ${pTotalNullRows} -> ${mTotalNullRows === pTotalNullRows ? 'MATCH' : 'DIFFER'}`)

  // list any full-null rows in detail
  const mNullDetail = mRows.filter((r: any) => !r.stockCustomer && !r.stockFabricStruct && !r.stockFabricPattern && !r.stockFabricW)
  if (mNullDetail.length) {
    console.log('\n[MySQL] Full detail of rows with all stock* fields NULL:')
    for (const r of mNullDetail) {
      console.log(`  id=${r.id} bill=${r.vatType}${r.vatNo} date=${fmtDate(r.createDate)} fold=${r.fold} yard=${r.sumYard} customer="${r.customerName}"`)
    }
  } else {
    console.log('\n[MySQL] No rows found with all stock* fields NULL under order 4198.')
  }

  await db.end()
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
