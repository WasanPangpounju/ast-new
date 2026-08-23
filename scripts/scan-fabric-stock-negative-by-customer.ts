/**
 * scan-fabric-stock-negative-by-customer.ts
 *
 * READ-ONLY: for every (customer, fabric) combination in PostgreSQL, compute
 * รับเข้า (stockfabrics, received) vs ส่งออก (fabricouts, delivered) and find
 * combinations where ส่งออก > รับเข้า (negative remaining) — i.e. the same
 * pattern found for พรชัยวิรัช's #527/17 60" order (fabric substitution).
 *
 * Grouping key mirrors the existing stock-summary report formula
 * (src/app/api/warehouse/reports/stock-summary/route.ts): fabricStruct +
 * fabricPattern + normalized fabricW, but ALSO split by customer (the
 * existing report aggregates all customers together, hiding per-customer
 * negatives).
 *
 * Does not write anything.
 * Usage: npx tsx scripts/scan-fabric-stock-negative-by-customer.ts
 */

import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('=== scan-fabric-stock-negative-by-customer.ts (READ-ONLY) ===\n')

  // หน้ากว้างในข้อมูลจริงมีหลายรูปแบบ เช่น "50", "50/V1-V1" — ถือว่าเป็นหน้ากว้างเดียวกัน
  // โดยพิจารณาเฉพาะตัวเลขนำหน้า (เดียวกับ src/app/api/warehouse/reports/stock-summary/route.ts)
  const fabricWNorm = `COALESCE(substring(trim("fabricW") from '^([0-9]+(?:\\.[0-9]+)?)'), trim("fabricW"))`
  // ทดสอบพบว่า fabricStruct ในตาราง stockfabrics เก็บแบบ "KE 20 * KE 20 / 104 * 50"
  // (มีช่องว่างระหว่างตัวอักษรกับตัวเลข) แต่ fabricouts เก็บแบบ "KE20  * KE20  / 104 * 50"
  // (ไม่มีช่องว่าง) — ต้องลบช่องว่างทั้งหมดออกเพื่อเทียบให้ตรงกัน ไม่ใช่แค่ยุบช่องว่างเหลือตัวเดียว
  const structNorm = `upper(regexp_replace(trim("fabricStruct"), '\\s+', '', 'g'))`

  const inRows = await prisma.$queryRawUnsafe(`
    SELECT
      trim("customer") as customer,
      ${structNorm} as "fabricStructNorm",
      ${fabricWNorm} as "fabricWNorm",
      -- representative label: most frequent fabricCode for this group
      (array_agg("fabricCode" ORDER BY "fabricCode"))[1] as "fabricCode",
      SUM("sumYard")::float as "sumYard"
    FROM stockfabrics
    WHERE deleted_at IS NULL AND "customer" IS NOT NULL
    GROUP BY trim("customer"), ${structNorm}, ${fabricWNorm}
  `) as any[]

  const outRows = await prisma.$queryRawUnsafe(`
    SELECT
      trim("customerName") as customer,
      ${structNorm} as "fabricStructNorm",
      ${fabricWNorm} as "fabricWNorm",
      SUM("sumYard")::float as "sumYard"
    FROM fabricouts
    WHERE deleted_at IS NULL AND "customerName" IS NOT NULL
    GROUP BY trim("customerName"), ${structNorm}, ${fabricWNorm}
  `) as any[]

  console.log(`In-groups (customer x fabric, stockfabrics): ${inRows.length}`)
  console.log(`Out-groups (customer x fabric, fabricouts): ${outRows.length}`)

  type Group = { customer: string; fabricStructNorm: string; fabricWNorm: string; fabricCode: string | null; inYard: number; outYard: number }
  const map = new Map<string, Group>()
  for (const r of inRows) {
    const key = `${r.customer}||${r.fabricStructNorm}||${r.fabricWNorm}`
    map.set(key, { customer: r.customer, fabricStructNorm: r.fabricStructNorm, fabricWNorm: r.fabricWNorm, fabricCode: r.fabricCode, inYard: Number(r.sumYard ?? 0), outYard: 0 })
  }
  for (const r of outRows) {
    const key = `${r.customer}||${r.fabricStructNorm}||${r.fabricWNorm}`
    const ex = map.get(key)
    if (ex) ex.outYard = Number(r.sumYard ?? 0)
    else map.set(key, { customer: r.customer, fabricStructNorm: r.fabricStructNorm, fabricWNorm: r.fabricWNorm, fabricCode: null, inYard: 0, outYard: Number(r.sumYard ?? 0) })
  }

  const all = [...map.values()].map(g => ({ ...g, remaining: g.inYard - g.outYard }))
  const negative = all.filter(g => g.remaining < 0).sort((a, b) => a.remaining - b.remaining)

  console.log(`\nTotal (customer, fabric) combinations: ${all.length}`)
  console.log(`Combinations with ส่งออก > รับเข้า (remaining < 0): ${negative.length}`)

  console.log('\n' + '='.repeat(100))
  console.log('TOP 20 - เรียงจากติดลบมากที่สุด')
  console.log('='.repeat(100))
  console.log(
    'ลูกค้า'.padEnd(45) + 'รหัสผ้า/โครงสร้าง'.padEnd(30) + 'รับเข้า'.padEnd(12) + 'ส่งออก'.padEnd(12) + 'คงเหลือ'
  )
  for (const g of negative.slice(0, 20)) {
    const label = g.fabricCode ?? `${g.fabricStructNorm} / ${g.fabricWNorm}"`
    console.log(
      `${(g.customer ?? '-').slice(0, 43).padEnd(45)}${label.slice(0, 28).padEnd(30)}` +
      `${g.inYard.toFixed(2).padEnd(12)}${g.outYard.toFixed(2).padEnd(12)}${g.remaining.toFixed(2)}`
    )
  }

  // แยก 2 กลุ่ม: (a) รับเข้า=0 ทั้งหมด (ไม่เคยบันทึกสต็อกเข้าเลย - ปัญหาเชิงระบบที่รู้อยู่แล้ว
  // ตามที่ src/app/api/warehouse/reports/stock-summary/route.ts มี clamp logic รองรับอยู่)
  // vs (b) รับเข้า>0 แต่ยังส่งออกเกิน (รูปแบบเดียวกับที่เจอในกรณีพรชัยวิรัช - ใกล้เคียงกว่า)
  const zeroIn = negative.filter(g => g.inYard === 0)
  const partialIn = negative.filter(g => g.inYard > 0)
  console.log(`\nในจำนวน ${negative.length} รายการที่ติดลบ:`)
  console.log(`  - รับเข้า = 0 ทั้งหมด (ไม่เคยมีสต็อกเข้าบันทึกเลย): ${zeroIn.length} รายการ`)
  console.log(`  - รับเข้า > 0 แต่ส่งออกเกิน (มีสต็อกบางส่วน แล้วส่งเกิน คล้ายเคสพรชัยวิรัช): ${partialIn.length} รายการ`)

  console.log('\n' + '='.repeat(100))
  console.log('รับเข้า > 0 แต่ส่งออกเกิน (ใกล้เคียงรูปแบบเคสพรชัยวิรัชมากที่สุด) - TOP 20')
  console.log('='.repeat(100))
  console.log(
    'ลูกค้า'.padEnd(45) + 'รหัสผ้า/โครงสร้าง'.padEnd(30) + 'รับเข้า'.padEnd(12) + 'ส่งออก'.padEnd(12) + 'คงเหลือ'
  )
  for (const g of partialIn.slice(0, 20)) {
    const label = g.fabricCode ?? `${g.fabricStructNorm} / ${g.fabricWNorm}"`
    console.log(
      `${(g.customer ?? '-').slice(0, 43).padEnd(45)}${label.slice(0, 28).padEnd(30)}` +
      `${g.inYard.toFixed(2).padEnd(12)}${g.outYard.toFixed(2).padEnd(12)}${g.remaining.toFixed(2)}`
    )
  }

  // Highlight where พรชัยวิรัช sits in this ranking, for reference
  const pcwRank = negative.findIndex(g => g.customer?.includes('พรชัยวิรัช'))
  console.log(`\nพรชัยวิรัช อยู่อันดับที่ ${pcwRank >= 0 ? pcwRank + 1 : '(ไม่พบในรายการติดลบเลย - ดูรายละเอียดด้านล่าง)'} จากทั้งหมด ${negative.length}`)
  const pcwAll = all.filter(g => g.customer?.includes('พรชัยวิรัช')).sort((a, b) => a.remaining - b.remaining)
  console.log('รายการทั้งหมดของพรชัยวิรัช (ไม่ใช่แค่ที่ติดลบ):')
  for (const g of pcwAll) {
    console.log(`  -> ${g.fabricCode ?? g.fabricStructNorm} | in=${g.inYard.toFixed(2)} out=${g.outYard.toFixed(2)} remaining=${g.remaining.toFixed(2)}`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
