/**
 * list-partial-stock-negative-full.ts
 *
 * READ-ONLY: full-field listing of the 11 (customer, fabric) combinations
 * where stockfabrics (รับเข้า) > 0 but fabricouts (ส่งออก) exceeds it —
 * the closest analog to the พรชัยวิรัช substitute-fabric pattern.
 * Same grouping/normalization as scan-fabric-stock-negative-by-customer.ts.
 *
 * Usage: npx tsx scripts/list-partial-stock-negative-full.ts
 */

import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  const fabricWNorm = `COALESCE(substring(trim("fabricW") from '^([0-9]+(?:\\.[0-9]+)?)'), trim("fabricW"))`
  const structNorm = `upper(regexp_replace(trim("fabricStruct"), '\\s+', '', 'g'))`

  const inRows = await prisma.$queryRawUnsafe(`
    SELECT
      trim("customer") as customer,
      ${structNorm} as "fabricStructNorm",
      ${fabricWNorm} as "fabricWNorm",
      trim("fabricStruct") as "fabricStructRaw",
      (array_agg("fabricCode" ORDER BY "fabricCode"))[1] as "fabricCode",
      SUM("sumYard")::float as "sumYard"
    FROM stockfabrics
    WHERE deleted_at IS NULL AND "customer" IS NOT NULL
    GROUP BY trim("customer"), ${structNorm}, ${fabricWNorm}, trim("fabricStruct")
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

  type Group = { customer: string; fabricStructNorm: string; fabricWNorm: string; fabricStructRaw: string; fabricCode: string | null; inYard: number; outYard: number }
  const map = new Map<string, Group>()
  for (const r of inRows) {
    const key = `${r.customer}||${r.fabricStructNorm}||${r.fabricWNorm}`
    const ex = map.get(key)
    if (ex) ex.inYard += Number(r.sumYard ?? 0)
    else map.set(key, { customer: r.customer, fabricStructNorm: r.fabricStructNorm, fabricWNorm: r.fabricWNorm, fabricStructRaw: r.fabricStructRaw, fabricCode: r.fabricCode, inYard: Number(r.sumYard ?? 0), outYard: 0 })
  }
  for (const r of outRows) {
    const key = `${r.customer}||${r.fabricStructNorm}||${r.fabricWNorm}`
    const ex = map.get(key)
    if (ex) ex.outYard = Number(r.sumYard ?? 0)
    else map.set(key, { customer: r.customer, fabricStructNorm: r.fabricStructNorm, fabricWNorm: r.fabricWNorm, fabricStructRaw: '', fabricCode: null, inYard: 0, outYard: Number(r.sumYard ?? 0) })
  }

  const all = [...map.values()].map(g => ({ ...g, remaining: g.inYard - g.outYard }))
  const partialIn = all.filter(g => g.remaining < 0 && g.inYard > 0).sort((a, b) => a.remaining - b.remaining)

  console.log(`Total combinations with รับเข้า > 0 AND ส่งออก > รับเข้า: ${partialIn.length}\n`)

  console.log('| ลำดับ | ลูกค้า | รหัสผ้า | โครงสร้างผ้า | รับเข้า (หลา) | ส่งออก (หลา) | คงเหลือ (หลา) | ขาดกี่ % |')
  console.log('|---|---|---|---|---:|---:|---:|---:|')
  let i = 1
  for (const g of partialIn) {
    const pct = (g.remaining / g.inYard) * 100
    console.log(
      `| ${i} | ${g.customer} | ${g.fabricCode ?? '-'} | ${g.fabricStructRaw || g.fabricStructNorm} / ${g.fabricWNorm}" | ` +
      `${g.inYard.toFixed(2)} | ${g.outYard.toFixed(2)} | ${g.remaining.toFixed(2)} | ${pct.toFixed(1)}% |`
    )
    i++
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
