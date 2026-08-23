/**
 * scan-pornchaiwirat-substitute-fabric.ts
 *
 * READ-ONLY audit: for ALL orders of "บริษัท พรชัยวิรัช จำกัด", find fabricouts
 * (delivery bills) where the physical stock roll used (stockFabricStruct /
 * stockFabricPattern / stockFabricW / stockCustomer) differs from what was
 * billed/labeled on the delivery (fabricStruct / fabricPattern / fabricW /
 * customerName) — i.e. a substitute / different fabric used to fulfil the order.
 *
 * Checks both old MySQL and new PostgreSQL. Does not write anything.
 *
 * Usage: npx tsx scripts/scan-pornchaiwirat-substitute-fabric.ts
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

const CUSTOMER_MATCH = 'พรชัยวิรัช'

function fmtDate(v: any): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return d.toISOString().slice(0, 10)
}
function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, '').trim()
}

type Row = {
  id: number
  createDate: any
  vatType: string | null
  vatNo: any
  customerName: string | null
  receiveName: string | null
  fabricStruct: string | null
  fabricPattern: string | null
  fabricW: string | null
  fold: any
  sumYard: any
  orderId: number | null
  purchaseOrder: string | null
  customerReplace?: string | null
  stockCustomer: string | null
  stockFabricStruct: string | null
  stockFabricPattern: string | null
  stockFabricW: string | null
}

function analyze(label: string, orders: any[], fouts: Row[]) {
  const orderById = new Map(orders.map((o: any) => [o.id, o]))
  const orderByPO = new Map(orders.map((o: any) => [o.purchaseOrder, o]))

  const flagged = fouts.filter(f => f.stockCustomer || f.stockFabricStruct || f.stockFabricPattern || f.stockFabricW).map(f => {
    const stockCustDiffers = f.stockCustomer && norm(f.stockCustomer) !== norm(f.customerName)
    const structDiffers = f.stockFabricStruct && norm(f.stockFabricStruct) !== norm(f.fabricStruct)
    const patternDiffers = f.stockFabricPattern && norm(f.stockFabricPattern) !== norm(f.fabricPattern)
    return { ...f, stockCustDiffers, structDiffers, patternDiffers }
  }).filter(f => f.stockCustDiffers || f.structDiffers)

  // group by bill (vatType+vatNo)
  const byBill = new Map<string, typeof flagged>()
  for (const f of flagged) {
    const key = `${f.vatType ?? ''}${f.vatNo ?? ''}`
    if (!byBill.has(key)) byBill.set(key, [])
    byBill.get(key)!.push(f)
  }

  console.log(`\n${'='.repeat(78)}\n[${label}] SUMMARY\n${'='.repeat(78)}`)
  console.log(`Total fabricouts rows linked to พรชัยวิรัช orders: ${fouts.length}`)
  console.log(`Rows flagged (stock source customer or structure differs): ${flagged.length}`)
  console.log(`Distinct bills flagged: ${byBill.size}`)

  const sameSpecOtherCustomer = flagged.filter(f => f.stockCustDiffers && !f.structDiffers)
  const differentStruct = flagged.filter(f => f.structDiffers)
  console.log(`  - same fabric spec, but sourced from a DIFFERENT customer's stock: ${sameSpecOtherCustomer.length} rows`)
  console.log(`  - DIFFERENT fabric structure sourced from stock: ${differentStruct.length} rows`)

  const billList = [...byBill.entries()].map(([bill, rows]) => {
    const first = rows[0]
    const ord = first.orderId ? orderById.get(first.orderId) : (first.purchaseOrder ? orderByPO.get(first.purchaseOrder) : null)
    return {
      bill,
      createDate: fmtDate(first.createDate),
      PO: ord?.purchaseOrder ?? first.purchaseOrder ?? '-',
      customerReplace: first.customerReplace ?? null,
      billedFabricStruct: first.fabricStruct,
      billedFabricPattern: first.fabricPattern,
      billedFabricW: first.fabricW,
      customerName: first.customerName,
      stockCustomer: first.stockCustomer,
      stockFabricStruct: first.stockFabricStruct,
      stockFabricPattern: first.stockFabricPattern,
      stockFabricW: first.stockFabricW,
      structDiffers: rows.some(r => r.structDiffers),
      foldCount: rows.length,
      totalYard: rows.reduce((s, r) => s + (parseFloat(r.sumYard) || 0), 0),
      ids: rows.map(r => r.id),
    }
  }).sort((a, b) => (a.createDate < b.createDate ? -1 : 1))

  console.log(`\n[${label}] Bill detail:`)
  for (const b of billList) {
    console.log(
      `  บิล ${b.bill.padEnd(8)} วันที่ ${b.createDate}  PO=${b.PO}  รับผ้า="${b.customerName}"\n` +
      `    รหัสผ้าที่บิล: ${b.customerReplace ?? '-'}  โครงสร้างที่บิล: ${b.billedFabricStruct} / ${b.billedFabricPattern} / ${b.billedFabricW}\n` +
      `    -> สต็อกจริงที่ใช้: ลูกค้าเดิม="${b.stockCustomer}"  โครงสร้างสต็อกจริง: ${b.stockFabricStruct} / ${b.stockFabricPattern} / ${b.stockFabricW}` +
      `${b.structDiffers ? '  *** โครงสร้างผ้าไม่ตรงกัน ***' : ''}\n` +
      `    พับ=${b.foldCount}  รวมหลา=${b.totalYard.toFixed(2)}  (ids: ${b.ids.slice(0, 5).join(',')}${b.ids.length > 5 ? '...' : ''})`
    )
  }

  return { flagged, byBill, billList }
}

async function main() {
  console.log('=== scan-pornchaiwirat-substitute-fabric.ts (READ-ONLY) ===')

  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')
  const db = await mysql.createConnection(mysqlUrl)

  // ── MySQL ────────────────────────────────────────────────────────────────
  const [mOrders]: any = await db.query(
    `SELECT id, purchaseOrder, customerName, fabricId, fabricPattern, fabricStructure FROM ast_purchaseorders WHERE customerName LIKE ?`,
    [`%${CUSTOMER_MATCH}%`]
  )
  const mOrderIds = mOrders.map((o: any) => o.id)
  const mPoList = mOrders.map((o: any) => o.purchaseOrder)
  const [mFoutsRaw]: any = await db.query(
    `SELECT id, createDate, vatType, vatNo, customerName, receiveName, fabricStruct, fabricPattern, fabricW,
            fold, sumYard, orderId, purchaseOrder, customerReplace,
            stockCustomer, stockFabricStruct, stockFabricPattern, stockFabricW
     FROM fabricouts
     WHERE orderId IN (${mOrderIds.join(',')}) OR purchaseOrder IN (${mPoList.map((p: string) => `'${p.replace(/'/g, "''")}'`).join(',')})`
  )
  const mOrderIdSet = new Set(mOrderIds)
  // NOTE: ast_purchaseorders.purchaseOrder is NOT unique in the old MySQL data
  // (192 duplicate PO strings found across the table) — a fabricouts row whose
  // *own* orderId points to a DIFFERENT (non-พรชัยวิรัช) order must not be kept
  // just because its purchaseOrder text happens to collide with one of
  // พรชัยวิรัช's PO numbers. Only fall back to the purchaseOrder text match when
  // the row has no orderId at all.
  const mFouts = mFoutsRaw.filter((f: any) => (f.orderId ? mOrderIdSet.has(Number(f.orderId)) : true))
  const mysqlResult = analyze('MySQL', mOrders, mFouts)

  // ── PostgreSQL ───────────────────────────────────────────────────────────
  const pgOrders = await prisma.astPurchaseOrder.findMany({
    where: { customerName: { contains: CUSTOMER_MATCH } },
    select: { id: true, purchaseOrder: true, customerName: true, fabricId: true, fabricPattern: true, fabricStructure: true },
  })
  const pgOrderIds = pgOrders.map(o => o.id)
  const pgPoList = pgOrders.map(o => o.purchaseOrder)
  const pgFoutsRaw0 = await prisma.fabricOut.findMany({
    where: { OR: [{ orderId: { in: pgOrderIds } }, { purchaseOrder: { in: pgPoList } }] },
    select: {
      id: true, createDate: true, vatType: true, vatNo: true, customerName: true, receiveName: true,
      fabricStruct: true, fabricPattern: true, fabricW: true, fold: true, sumYard: true, orderId: true,
      purchaseOrder: true, altPurchaseOrder: true, stockCustomer: true, stockFabricStruct: true,
      stockFabricPattern: true, stockFabricW: true, deletedAt: true,
    },
  })
  const pgOrderIdSet = new Set(pgOrderIds)
  const pgFoutsRaw = pgFoutsRaw0.filter(f => (f.orderId ? pgOrderIdSet.has(f.orderId) : true))
  const pgFouts: Row[] = pgFoutsRaw.map(f => ({ ...f, customerReplace: f.altPurchaseOrder }))
  const pgResult = analyze('PostgreSQL', pgOrders, pgFouts)

  // ── Cross-check: same bill numbers flagged in both systems? ────────────────
  console.log(`\n${'='.repeat(78)}\nCROSS-CHECK MySQL vs PostgreSQL\n${'='.repeat(78)}`)
  const mBills = new Set(mysqlResult.byBill.keys())
  const pBills = new Set(pgResult.byBill.keys())
  const onlyInMysql = [...mBills].filter(b => !pBills.has(b))
  const onlyInPg = [...pBills].filter(b => !mBills.has(b))
  console.log(`Flagged bills in MySQL: ${mBills.size}, in PostgreSQL: ${pBills.size}`)
  console.log(`Bills flagged only in MySQL (missing flag in PG): ${onlyInMysql.join(', ') || '(none)'}`)
  console.log(`Bills flagged only in PostgreSQL (missing flag in MySQL): ${onlyInPg.join(', ') || '(none)'}`)

  await db.end()
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
