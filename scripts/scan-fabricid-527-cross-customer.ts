/**
 * scan-fabricid-527-cross-customer.ts
 *
 * READ-ONLY audit: for fabric code fabricId = '#527/17 60"' (owned by
 * "บริษัท พรชัยวิรัช จำกัด"), find fabricouts (delivery bills) tied to that
 * fabric's orders where the delivery's customerName is a DIFFERENT customer.
 *
 * Checks both old MySQL (fabricouts / ast_purchaseorders) and new
 * PostgreSQL (FabricOut / AstPurchaseOrder). Does not write anything.
 *
 * Usage: npx tsx scripts/scan-fabricid-527-cross-customer.ts
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

const FABRIC_ID = '#527/17 60"'
const OWNER_CUSTOMER_MATCH = 'พรชัยวิรัช'

function fmtDate(v: any): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  return d.toISOString().slice(0, 10)
}

function isOtherCustomer(name: string | null | undefined): boolean {
  const n = (name ?? '').trim()
  if (!n) return false
  return !n.includes(OWNER_CUSTOMER_MATCH)
}

async function main() {
  console.log(`=== scan-fabricid-527-cross-customer.ts (READ-ONLY) ===`)
  console.log(`fabricId = ${FABRIC_ID}\n`)

  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')
  const db = await mysql.createConnection(mysqlUrl)

  // ── MySQL side ────────────────────────────────────────────────────────────
  console.log('[MySQL] orders with this fabricId:')
  const [orders]: any = await db.query(
    `SELECT id, purchaseOrder, customerName, fabricId FROM ast_purchaseorders WHERE fabricId = ?`,
    [FABRIC_ID]
  )
  for (const o of orders) console.log(`  order id=${o.id} PO=${o.purchaseOrder} owner="${o.customerName}"`)
  const orderIds: number[] = orders.map((o: any) => o.id)
  const poStrings: string[] = orders.map((o: any) => o.purchaseOrder)

  const [foutsByOrderId]: any = orderIds.length
    ? await db.query(
        `SELECT id, createDate, no, vatType, vatNo, customerName, receiveName, fabricStruct, fabricPattern, fabricW, fold, sumYard, purchaseOrder, orderId
         FROM fabricouts WHERE orderId IN (${orderIds.join(',')})`
      )
    : [[]]
  const [foutsByPO]: any = poStrings.length
    ? await db.query(
        `SELECT id, createDate, no, vatType, vatNo, customerName, receiveName, fabricStruct, fabricPattern, fabricW, fold, sumYard, purchaseOrder, orderId
         FROM fabricouts WHERE purchaseOrder IN (${poStrings.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')})`
      )
    : [[]]

  const mysqlByIdMap = new Map<number, any>()
  for (const r of [...foutsByOrderId, ...foutsByPO]) mysqlByIdMap.set(r.id, r)
  const mysqlFouts = [...mysqlByIdMap.values()].sort((a, b) => a.id - b.id)

  console.log(`\n[MySQL] total fabricouts rows linked to these orders: ${mysqlFouts.length}`)
  const mysqlOther = mysqlFouts.filter(r => isOtherCustomer(r.customerName))
  console.log(`[MySQL] rows where fabricouts.customerName is NOT พรชัยวิรัช: ${mysqlOther.length}`)

  // ── PostgreSQL side ──────────────────────────────────────────────────────
  console.log('\n[PostgreSQL] orders with this fabricId:')
  const pgOrders = await prisma.astPurchaseOrder.findMany({
    where: { fabricId: FABRIC_ID },
    select: { id: true, purchaseOrder: true, customerName: true, fabricId: true },
  })
  for (const o of pgOrders) console.log(`  order id=${o.id} PO=${o.purchaseOrder} owner="${o.customerName}"`)
  const pgOrderIds = pgOrders.map(o => o.id)
  const pgPoStrings = pgOrders.map(o => o.purchaseOrder)

  const pgFoutsByOrderId = pgOrderIds.length
    ? await prisma.fabricOut.findMany({
        where: { orderId: { in: pgOrderIds } },
        select: {
          id: true, createDate: true, no: true, vatType: true, vatNo: true,
          customerName: true, receiveName: true, fabricStruct: true, fabricPattern: true,
          fabricW: true, fold: true, sumYard: true, purchaseOrder: true, orderId: true, deletedAt: true,
        },
      })
    : []
  const pgFoutsByPO = pgPoStrings.length
    ? await prisma.fabricOut.findMany({
        where: { purchaseOrder: { in: pgPoStrings } },
        select: {
          id: true, createDate: true, no: true, vatType: true, vatNo: true,
          customerName: true, receiveName: true, fabricStruct: true, fabricPattern: true,
          fabricW: true, fold: true, sumYard: true, purchaseOrder: true, orderId: true, deletedAt: true,
        },
      })
    : []
  const pgByIdMap = new Map<number, any>()
  for (const r of [...pgFoutsByOrderId, ...pgFoutsByPO]) pgByIdMap.set(r.id, r)
  const pgFouts = [...pgByIdMap.values()].sort((a, b) => a.id - b.id)

  console.log(`\n[PostgreSQL] total FabricOut rows linked to these orders: ${pgFouts.length}`)
  const pgOther = pgFouts.filter(r => isOtherCustomer(r.customerName))
  console.log(`[PostgreSQL] rows where FabricOut.customerName is NOT พรชัยวิรัช: ${pgOther.length}`)

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(78))
  console.log(`RESULT: fabricouts/FabricOut billed to a DIFFERENT customer for fabricId "${FABRIC_ID}"`)
  console.log('='.repeat(78))

  if (mysqlOther.length === 0) {
    console.log('\n[MySQL] -- none found --')
  } else {
    console.log('\n[MySQL]')
    console.log('เลขบิล'.padEnd(14) + 'วันที่'.padEnd(12) + 'ลูกค้าที่รับผ้า'.padEnd(45) + 'พับ/หลา')
    for (const r of mysqlOther) {
      const billNo = `${r.vatType ?? ''}${r.vatNo ?? ''}`
      console.log(
        `${billNo.padEnd(14)}${fmtDate(r.createDate).padEnd(12)}${(r.customerName ?? '-').padEnd(45)}` +
        `${r.fold ?? '-'} fold / ${r.sumYard ?? '-'} yard  (id=${r.id}, orderId=${r.orderId}, receiveName=${r.receiveName ?? '-'})`
      )
    }
  }

  if (pgOther.length === 0) {
    console.log('\n[PostgreSQL] -- none found --')
  } else {
    console.log('\n[PostgreSQL]')
    console.log('เลขบิล'.padEnd(14) + 'วันที่'.padEnd(12) + 'ลูกค้าที่รับผ้า'.padEnd(45) + 'พับ/หลา')
    for (const r of pgOther) {
      const billNo = `${r.vatType ?? ''}${r.vatNo ?? ''}`
      console.log(
        `${billNo.padEnd(14)}${fmtDate(r.createDate).padEnd(12)}${(r.customerName ?? '-').padEnd(45)}` +
        `${r.fold ?? '-'} fold / ${r.sumYard ?? '-'} yard  (id=${r.id}, orderId=${r.orderId}, deletedAt=${r.deletedAt ?? '-'})`
      )
    }
  }

  await db.end()
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
