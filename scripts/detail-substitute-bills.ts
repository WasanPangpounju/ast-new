/**
 * detail-substitute-bills.ts
 *
 * READ-ONLY: full per-fold detail for the 2 substitute-fabric bills found
 * under order SO6810/14 (พรชัยวิรัช, fabricId #527/17 60"): A5246 and A5516.
 * Prints every field from both MySQL (fabricouts) and PostgreSQL (FabricOut)
 * and verifies they match row-for-row.
 *
 * Usage: npx tsx scripts/detail-substitute-bills.ts
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

const BILLS = [
  { vatType: 'A', vatNo: 5246 },
  { vatType: 'A', vatNo: 5516 },
]

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
  console.log('=== detail-substitute-bills.ts (READ-ONLY) ===\n')
  const db = await mysql.createConnection(process.env.MYSQL_SOURCE_URL!)

  for (const bill of BILLS) {
    console.log('#'.repeat(90))
    console.log(`BILL ${bill.vatType}${bill.vatNo}`)
    console.log('#'.repeat(90))

    // NOTE: fold is stored as VARCHAR in MySQL, so `ORDER BY fold` sorts
    // lexicographically ("1","10","11"...) not numerically. Order by id
    // instead (ids were assigned sequentially in original fold order) and
    // compare by id, not by array position.
    const [mRows]: any = await db.query(
      `SELECT * FROM fabricouts WHERE vatType=? AND vatNo=? ORDER BY id ASC`,
      [bill.vatType, bill.vatNo]
    )

    const pRows = await prisma.fabricOut.findMany({
      where: { vatType: bill.vatType, vatNo: bill.vatNo },
      orderBy: { id: 'asc' },
    })

    console.log(`\nMySQL rows: ${mRows.length}   PostgreSQL rows: ${pRows.length}\n`)

    // ── Bill-level summary (from first row, since spec fields are identical across folds) ──
    const m0 = mRows[0]
    const p0 = pRows[0]

    console.log('--- BILL-LEVEL SUMMARY ---')
    console.log(`เลขบิล (vatType+vatNo):     ${m0.vatType}${m0.vatNo}   |   PG: ${p0.vatType}${p0.vatNo}`)
    console.log(`no (running serial):        ${m0.no}   |   PG: ${p0.no}`)
    console.log(`วันที่ส่ง (createDate):      ${fmtDate(m0.createDate)}   |   PG: ${fmtDate(p0.createDate)}`)
    console.log(`ลูกค้าที่รับ (customerName): ${m0.customerName}   |   PG: ${p0.customerName}`)
    console.log(`ผู้รับ (receiveName):        ${m0.receiveName}   |   PG: ${p0.receiveName}`)
    console.log(`orderId:                    ${m0.orderId}   |   PG: ${p0.orderId}`)
    console.log(`purchaseOrder:               ${m0.purchaseOrder}   |   PG: ${p0.purchaseOrder}`)
    console.log(`รหัสผ้าที่บิล (customerReplace / altPurchaseOrder): "${m0.customerReplace}"   |   PG: "${p0.altPurchaseOrder}"`)
    console.log(`--- สเปกที่บิลระบุ (ส่งให้ลูกค้าเห็น) ---`)
    console.log(`  fabricStruct:  "${m0.fabricStruct}"   |   PG: "${p0.fabricStruct}"`)
    console.log(`  fabricPattern: "${m0.fabricPattern}"   |   PG: "${p0.fabricPattern}"`)
    console.log(`  fabricW:       "${m0.fabricW}"   |   PG: "${p0.fabricW}"`)
    console.log(`--- สเปกที่หยิบจากสต็อกจริง ---`)
    console.log(`  stockCustomer:      "${m0.stockCustomer}"   |   PG: "${p0.stockCustomer}"`)
    console.log(`  stockFabricStruct:  "${m0.stockFabricStruct}"   |   PG: "${p0.stockFabricStruct}"`)
    console.log(`  stockFabricPattern: "${m0.stockFabricPattern}"   |   PG: "${p0.stockFabricPattern}"`)
    console.log(`  stockFabricW:       "${m0.stockFabricW}"   |   PG: "${p0.stockFabricW}"`)
    console.log(`fabricStructReplace:   MySQL="${m0.fabricStructReplace}"   |   PG altFabricStruct="${p0.altFabricStruct}"`)

    const foldCount = mRows.length
    const totalYard = mRows.reduce((s: number, r: any) => s + n(r.sumYard), 0)
    const pgTotalYard = pRows.reduce((s, r) => s + r.sumYard, 0)
    console.log(`\nจำนวนพับรวม: MySQL=${foldCount}   PG=${pRows.length}`)
    console.log(`จำนวนหลารวม: MySQL=${totalYard.toFixed(2)}   PG=${pgTotalYard.toFixed(2)}`)

    console.log('\n--- ความแตกต่างระหว่างสเปกที่บิลระบุ กับ สต็อกที่หยิบจริง ---')
    const structSame = (m0.fabricStruct || '').replace(/\s+/g, '') === (m0.stockFabricStruct || '').replace(/\s+/g, '')
    const custSame = (m0.customerName || '').trim() === (m0.stockCustomer || '').trim()
    console.log(`  โครงสร้างผ้าตรงกันหรือไม่: ${structSame ? 'ตรงกัน (สเปกเดียวกัน)' : 'ไม่ตรงกัน (คนละสเปก)'}`)
    console.log(`  ลูกค้าเจ้าของสต็อกตรงกับลูกค้าที่รับหรือไม่: ${custSame ? 'ตรงกัน' : `ไม่ตรงกัน (สต็อกเดิมเป็นของ "${m0.stockCustomer}")`}`)

    // ── Row-by-row match check MySQL vs PG ────────────────────────────────
    console.log('\n--- ตรวจแต่ละพับ (fold) ทีละแถว MySQL vs PostgreSQL ---')
    console.log('พับ'.padEnd(5) + 'หลา(mysql/pg)'.padEnd(18) + 'id(mysql/pg)'.padEnd(16) + 'ตรงกันหรือไม่')
    let allMatch = true
    for (let i = 0; i < mRows.length; i++) {
      const m = mRows[i]
      const p = pRows[i]
      const yardMatch = p && Math.abs(n(m.sumYard) - p.sumYard) < 0.01
      const idMatch = p && m.id === p.id
      const structMatch = p && (m.fabricStruct || '') === (p.fabricStruct || '')
      const stockMatch = p && (m.stockCustomer || '') === (p.stockCustomer || '') && (m.stockFabricStruct || '') === (p.stockFabricStruct || '')
      const ok = !!p && yardMatch && idMatch && structMatch && stockMatch
      if (!ok) allMatch = false
      console.log(
        `${String(m.fold).padEnd(5)}${(n(m.sumYard) + '/' + (p ? p.sumYard : '-')).padEnd(18)}${(m.id + '/' + (p ? p.id : '-')).padEnd(16)}${ok ? 'OK' : '*** MISMATCH ***'}`
      )
    }
    console.log(`\n=> ทุกแถว (${mRows.length} พับ) ${allMatch ? 'ตรงกันสมบูรณ์ระหว่าง MySQL และ PostgreSQL' : 'พบความไม่ตรงกัน! ดูรายละเอียดด้านบน'}`)
    console.log()
  }

  await db.end()
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
