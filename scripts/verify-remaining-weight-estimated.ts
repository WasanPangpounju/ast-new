// READ-ONLY verification of the new remainingWeightKgEstimated field added to AGGREGATE_COLUMNS.
// Checks: flagged/negative yarnType no longer negative, normal yarnType unaffected in direction,
// and system-wide total matches the ~1,655,581 kg predicted in the impact assessment.
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { MATERIAL_STOCK_CTES, MATERIAL_STOCK_JOINS, AGGREGATE_COLUMNS } from '../src/lib/materialStock'

type Row = {
  yarnType: string
  totalSpool: number
  remainingSpool: number
  remainingWeightKg: string | number
  remainingWeightKgEstimated: string | number
}

async function getAll(): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(`
    WITH ${MATERIAL_STOCK_CTES}
    SELECT m."yarnType", ${AGGREGATE_COLUMNS}
    FROM materials m
    ${MATERIAL_STOCK_JOINS}
    WHERE m."deletedAt" IS NULL
    GROUP BY m."yarnType"
    ORDER BY m."yarnType"
  `)
}

const FLAGGED = [
  'KE 7/2 จงสถิตย์', 'T 150 (AA)', 'TC 45 CARD (80:20)', 'C 7/2 OE มาดีสปินนิ่ง (ใหญ่)',
  'TC 45 COMB (65:35) G 10', 'KE 7/2',
]
const NEGATIVE = [
  'C 20/2  (PST)', 'C 7 OE CEL', 'CP 40/2 จีน', 'C 10/2 กังวาล',
  'CVC 45 COMB', 'CB 40 (BAMBOO)', 'C 7/2 OE มาดีสปินนิ่ง (เล็ก)', 'CVC 10/2',
]
const NORMAL_SAMPLE = 3 // just take first N alphabetically that aren't in the flagged/negative sets

async function main() {
  const rows = await getAll()
  const byName = new Map(rows.map((r) => [r.yarnType, r]))

  console.log('=== 1. Previously-flagged (high-ratio) yarnType — sanity check on estimated value ===')
  console.log('yarnType | totalSpool | remainingSpool | remainingWeightKgEstimated | negative?')
  for (const name of FLAGGED) {
    const r = byName.get(name)
    if (!r) { console.log(`${name} | NOT FOUND`); continue }
    const est = Number(r.remainingWeightKgEstimated)
    console.log(`${r.yarnType} | ${r.totalSpool} | ${r.remainingSpool} | ${est.toFixed(2)} | ${est < 0 ? 'YES <-- FAIL' : 'no'}`)
  }

  console.log('\n=== 2. Previously negative-remaining yarnType — must be 0/positive now ===')
  console.log('yarnType | old remainingWeightKg | new remainingWeightKgEstimated | fixed?')
  let allFixed = true
  for (const name of NEGATIVE) {
    const r = byName.get(name)
    if (!r) { console.log(`${name} | NOT FOUND`); continue }
    const oldVal = Number(r.remainingWeightKg)
    const newVal = Number(r.remainingWeightKgEstimated)
    const fixed = newVal >= 0
    if (!fixed) allFixed = false
    console.log(`${r.yarnType} | ${oldVal.toFixed(2)} | ${newVal.toFixed(2)} | ${fixed ? 'YES' : 'NO <-- FAIL'}`)
  }
  console.log(`All 8 fixed: ${allFixed ? 'YES' : 'NO <-- FAIL'}`)

  console.log('\n=== 3. Normal yarnType sample — regression check (should look sane, not wildly different) ===')
  const flaggedOrNegative = new Set([...FLAGGED, ...NEGATIVE, 'TC 7 OE', 'CVC 45 COMB (60:40)', 'CVC 40 COMB', 'T 300 (A)', 'CP 40/2 พิพัฒน์', 'CD 20 CARD', 'TR 40/2', 'CP 50 COMPACK', 'C 80/2', 'CP 32/2 จีน', 'KE 20 ย้อมขาว', 'TC 14 COMB', 'KE 7'])
  const normalRows = rows.filter((r) => !flaggedOrNegative.has(r.yarnType)).slice(0, NORMAL_SAMPLE)
  console.log('yarnType | totalSpool | remainingSpool | old remainingWeightKg | new remainingWeightKgEstimated | diff%')
  for (const r of normalRows) {
    const oldVal = Number(r.remainingWeightKg)
    const newVal = Number(r.remainingWeightKgEstimated)
    const diffPct = oldVal !== 0 ? ((newVal - oldVal) / oldVal) * 100 : null
    console.log(`${r.yarnType} | ${r.totalSpool} | ${r.remainingSpool} | ${oldVal.toFixed(2)} | ${newVal.toFixed(2)} | ${diffPct !== null ? diffPct.toFixed(1) + '%' : 'n/a'}`)
  }

  console.log('\n=== 4. System-wide total (should be ~1,655,581 kg per impact assessment) ===')
  const sumOld = rows.reduce((s, r) => s + Number(r.remainingWeightKg), 0)
  const sumNew = rows.reduce((s, r) => s + Number(r.remainingWeightKgEstimated), 0)
  console.log(`Σ remainingWeightKg (old)            : ${sumOld.toFixed(2)} kg`)
  console.log(`Σ remainingWeightKgEstimated (new)   : ${sumNew.toFixed(2)} kg`)
  console.log(`yarnType count: ${rows.length} (expected 177)`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
