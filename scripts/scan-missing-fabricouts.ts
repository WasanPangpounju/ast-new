/**
 * scan-missing-fabricouts.ts
 *
 * READ-ONLY audit: compare fabricouts (บิลส่งผ้า) between old MySQL (Laravel)
 * and new PostgreSQL (Prisma) to find bills that exist in the old system but
 * are missing (or mismatched) in the new one.
 *
 * Does NOT write, migrate, or modify any data in either database.
 *
 * Usage:
 *   npx tsx scripts/scan-missing-fabricouts.ts
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'
import fs from 'fs'
import path from 'path'

type MysqlRow = {
  id: number
  refId: string | null
  no: string | number | null
  vatType: string | null
  vatNo: string | number | null
  fold: string | number | null
  sumYard: string | number | null
  fabricStruct: string | null
  fabricPattern: string | null
  fabricW: string | null
  customerName: string | null
  receiveName: string | null
  purchaseOrder: string | null
  purchase_order: string | null
  orderId: string | number | null
  order_id: string | number | null
  createDate: string | Date | null
  create_date: string | Date | null
}

function n(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const x = parseFloat(v)
  return isNaN(x) ? null : x
}

function fmtDate(v: any): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return d.toISOString().slice(0, 10)
}

async function main() {
  console.log('=== scan-missing-fabricouts.ts (READ-ONLY) ===\n')

  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')

  console.log('[1/4] Connecting to old MySQL (port 3307)...')
  const db = await mysql.createConnection(mysqlUrl)

  console.log('[2/4] Fetching fabricouts from MySQL...')
  const [rows]: any = await db.query('SELECT * FROM fabricouts ORDER BY id ASC')
  const mysqlRows: MysqlRow[] = rows
  console.log(`  -> ${mysqlRows.length} rows in MySQL fabricouts`)

  console.log('[3/4] Fetching FabricOut from PostgreSQL...')
  const pgRows = await prisma.fabricOut.findMany({
    select: {
      id: true,
      refId: true,
      no: true,
      vatType: true,
      vatNo: true,
      fold: true,
      sumYard: true,
      fabricStruct: true,
      fabricPattern: true,
      fabricW: true,
      customerName: true,
      receiveName: true,
      purchaseOrder: true,
      orderId: true,
      createDate: true,
      deletedAt: true,
    },
    orderBy: { id: 'asc' },
  })
  console.log(`  -> ${pgRows.length} rows in PostgreSQL FabricOut\n`)

  const pgById = new Map(pgRows.map(r => [r.id, r]))

  // ── Find rows missing entirely from PostgreSQL ────────────────────────────
  const missing: MysqlRow[] = []
  // ── Find rows present but soft-deleted in PostgreSQL ──────────────────────
  const softDeleted: { mysql: MysqlRow; pg: (typeof pgRows)[number] }[] = []
  // ── Find rows present but with mismatched key values ──────────────────────
  const mismatched: { mysql: MysqlRow; pg: (typeof pgRows)[number]; diffs: string[] }[] = []

  for (const m of mysqlRows) {
    const p = pgById.get(m.id)
    if (!p) {
      missing.push(m)
      continue
    }
    if (p.deletedAt) {
      softDeleted.push({ mysql: m, pg: p })
    }

    const diffs: string[] = []
    const mSumYard = n(m.sumYard)
    const mFold = n(m.fold)
    const mVatNo = n(m.vatNo)
    if (mSumYard !== null && p.sumYard !== null && Math.abs(mSumYard - p.sumYard) > 0.01) {
      diffs.push(`sumYard: mysql=${mSumYard} pg=${p.sumYard}`)
    }
    if (mFold !== null && p.fold !== null && mFold !== p.fold) {
      diffs.push(`fold: mysql=${mFold} pg=${p.fold}`)
    }
    if (mVatNo !== null && p.vatNo !== null && mVatNo !== p.vatNo) {
      diffs.push(`vatNo: mysql=${mVatNo} pg=${p.vatNo}`)
    }
    const mCust = (m.customerName ?? '').trim()
    const pCust = (p.customerName ?? '').trim()
    if (mCust && pCust && mCust !== pCust) {
      diffs.push(`customerName: mysql="${mCust}" pg="${pCust}"`)
    }
    const mStruct = (m.fabricStruct ?? '').trim()
    const pStruct = (p.fabricStruct ?? '').trim()
    if (mStruct && pStruct && mStruct !== pStruct) {
      diffs.push(`fabricStruct: mysql="${mStruct}" pg="${pStruct}"`)
    }
    if (diffs.length > 0) {
      mismatched.push({ mysql: m, pg: p, diffs })
    }
  }

  // ── Also check: rows in PostgreSQL with no matching MySQL id ──────────────
  const mysqlIds = new Set(mysqlRows.map(r => r.id))
  const extraInPg = pgRows.filter(p => !mysqlIds.has(p.id))

  console.log('[4/4] Analysis complete.\n')
  console.log('='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))
  console.log(`MySQL fabricouts rows:        ${mysqlRows.length}`)
  console.log(`PostgreSQL FabricOut rows:    ${pgRows.length}`)
  console.log(`Missing entirely from PG:     ${missing.length}`)
  console.log(`Present but soft-deleted:     ${softDeleted.length}`)
  console.log(`Present but value-mismatched: ${mismatched.length}`)
  console.log(`Rows in PG not in MySQL:      ${extraInPg.length} (new rows created after migration - expected, not an issue)`)
  console.log('')

  // ── Group missing rows by refId (one "bill"/delivery = one refId) ─────────
  const missingByRef = new Map<string, MysqlRow[]>()
  for (const m of missing) {
    const key = m.refId ?? `(no-refid)-${m.id}`
    if (!missingByRef.has(key)) missingByRef.set(key, [])
    missingByRef.get(key)!.push(m)
  }
  console.log(`Missing rows group into ${missingByRef.size} distinct bill(s) (by refId).\n`)

  // ── Group missing bills by customer ────────────────────────────────────────
  const byCustomer = new Map<string, { bills: Set<string>; rows: number; totalYard: number }>()
  for (const [ref, rowsForRef] of missingByRef) {
    const cust = rowsForRef[0].customerName?.trim() || '(ไม่ระบุลูกค้า)'
    if (!byCustomer.has(cust)) byCustomer.set(cust, { bills: new Set(), rows: 0, totalYard: 0 })
    const c = byCustomer.get(cust)!
    c.bills.add(ref)
    c.rows += rowsForRef.length
    c.totalYard += rowsForRef.reduce((s, r) => s + (n(r.sumYard) ?? 0), 0)
  }

  console.log('='.repeat(70))
  console.log('MISSING BILLS GROUPED BY CUSTOMER')
  console.log('='.repeat(70))
  const custSorted = [...byCustomer.entries()].sort((a, b) => b[1].bills.size - a[1].bills.size)
  for (const [cust, c] of custSorted) {
    console.log(`  ${cust.padEnd(30)} bills=${c.bills.size}  rows=${c.rows}  totalYard=${c.totalYard.toFixed(2)}`)
  }
  console.log('')

  // ── Detail listing (first 50 missing bills for console; full detail to file) ──
  console.log('='.repeat(70))
  console.log('MISSING BILL DETAIL (first 50 shown, full list written to file)')
  console.log('='.repeat(70))
  const missingBillList = [...missingByRef.entries()].map(([ref, rowsForRef]) => {
    const first = rowsForRef[0]
    return {
      refId: ref,
      no: first.no,
      vatType: first.vatType,
      vatNo: n(first.vatNo),
      customerName: first.customerName,
      receiveName: first.receiveName,
      purchaseOrder: first.purchaseOrder ?? first.purchase_order,
      createDate: fmtDate(first.createDate ?? first.create_date),
      fabricStruct: first.fabricStruct,
      fabricPattern: first.fabricPattern,
      fabricW: first.fabricW,
      foldCount: rowsForRef.length,
      totalYard: rowsForRef.reduce((s, r) => s + (n(r.sumYard) ?? 0), 0),
      mysqlIds: rowsForRef.map(r => r.id),
    }
  }).sort((a, b) => (a.createDate < b.createDate ? -1 : 1))

  for (const b of missingBillList.slice(0, 50)) {
    console.log(
      `  [${b.createDate}] no=${b.no ?? '-'} vatNo=${b.vatType ?? ''}${b.vatNo ?? ''} ` +
      `customer="${b.customerName ?? '-'}" fabric=${b.fabricStruct ?? '-'} ` +
      `folds=${b.foldCount} yard=${b.totalYard.toFixed(2)} mysqlIds=[${b.mysqlIds.join(',')}]`
    )
  }
  if (missingBillList.length > 50) {
    console.log(`  ... and ${missingBillList.length - 50} more (see exported file)`)
  }
  console.log('')

  if (mismatched.length > 0) {
    console.log('='.repeat(70))
    console.log(`VALUE MISMATCHES (rows exist in both but differ) - showing first 30 of ${mismatched.length}`)
    console.log('='.repeat(70))
    for (const m of mismatched.slice(0, 30)) {
      console.log(`  id=${m.mysql.id} customer="${m.mysql.customerName}" -> ${m.diffs.join('; ')}`)
    }
    console.log('')
  }

  if (softDeleted.length > 0) {
    console.log('='.repeat(70))
    console.log(`SOFT-DELETED IN PG (row exists but deletedAt set) - showing first 30 of ${softDeleted.length}`)
    console.log('='.repeat(70))
    for (const s of softDeleted.slice(0, 30)) {
      console.log(`  id=${s.mysql.id} customer="${s.mysql.customerName}" deletedAt=${s.pg.deletedAt?.toISOString()}`)
    }
    console.log('')
  }

  // ── Write full detail to file ──────────────────────────────────────────────
  const outDir = path.join(__dirname, 'exports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'missing-fabricouts-report.json')
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      mysqlRows: mysqlRows.length,
      pgRows: pgRows.length,
      missingRows: missing.length,
      missingBills: missingByRef.size,
      softDeletedRows: softDeleted.length,
      mismatchedRows: mismatched.length,
      extraInPgRows: extraInPg.length,
    },
    byCustomer: custSorted.map(([cust, c]) => ({
      customer: cust,
      bills: c.bills.size,
      rows: c.rows,
      totalYard: Number(c.totalYard.toFixed(2)),
    })),
    missingBills: missingBillList,
    mismatched: mismatched.map(m => ({
      id: m.mysql.id,
      refId: m.mysql.refId,
      customerName: m.mysql.customerName,
      diffs: m.diffs,
    })),
    softDeleted: softDeleted.map(s => ({
      id: s.mysql.id,
      refId: s.mysql.refId,
      customerName: s.mysql.customerName,
      deletedAt: s.pg.deletedAt,
    })),
  }, null, 2), 'utf-8')
  console.log(`Full detail written to: ${outPath}`)

  await db.end()
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
