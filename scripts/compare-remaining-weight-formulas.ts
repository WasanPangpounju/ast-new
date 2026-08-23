// READ-ONLY. Compares the CURRENT remainingWeightKg formula
// (total - used + return, direct subtraction) against a PROPOSED formula
// (remainingSpool * avgWeightPerSpool, where avgWeightPerSpool = totalWeightKg/totalSpool)
// at yarnType-level, system-wide. No UPDATE/DELETE/INSERT — query only.
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { MATERIAL_STOCK_CTES, MATERIAL_STOCK_JOINS, AGGREGATE_COLUMNS } from '../src/lib/materialStock'

type YarnRow = {
  yarnType: string
  totalSpool: number
  usedSpool: number
  remainingSpool: number
  totalWeightKg: string | number
  usedWeightKg: string | number
  remainingWeightKg: string | number
}

async function getYarnTypeLevel(): Promise<YarnRow[]> {
  return prisma.$queryRawUnsafe<YarnRow[]>(`
    WITH ${MATERIAL_STOCK_CTES}
    SELECT
      m."yarnType",
      ${AGGREGATE_COLUMNS}
    FROM materials m
    ${MATERIAL_STOCK_JOINS}
    WHERE m."deletedAt" IS NULL
    GROUP BY m."yarnType"
    ORDER BY m."yarnType"
  `)
}

function analyze(r: YarnRow) {
  const totalSpool = r.totalSpool
  const remainingSpool = r.remainingSpool
  const totalWeightKg = Number(r.totalWeightKg)
  const usedWeightKg = Number(r.usedWeightKg)
  const oldRemainingWeightKg = Number(r.remainingWeightKg)

  const avgTotal = totalSpool > 0 ? totalWeightKg / totalSpool : 0
  // Proposed formula: remainingSpool * avgWeightPerSpool(from totalWeightKg/totalSpool)
  const newRemainingWeightKg = remainingSpool * avgTotal

  const avgUsed = r.usedSpool > 0 ? usedWeightKg / r.usedSpool : null
  const avgOldRemaining = remainingSpool > 0 ? oldRemainingWeightKg / remainingSpool : null
  const ratioToTotal = avgOldRemaining !== null && avgTotal !== 0 ? avgOldRemaining / avgTotal : null

  let flag = 'normal'
  if (remainingSpool < 0 || oldRemainingWeightKg < 0) flag = 'negative-remaining'
  else if (ratioToTotal !== null && ratioToTotal > 2) flag = 'high (>2x total)'
  else if (ratioToTotal !== null && ratioToTotal < 0.5) flag = 'low (<0.5x total)'

  return {
    yarnType: r.yarnType,
    totalSpool,
    usedSpool: r.usedSpool,
    remainingSpool,
    totalWeightKg,
    usedWeightKg,
    oldRemainingWeightKg,
    newRemainingWeightKg,
    diffKg: newRemainingWeightKg - oldRemainingWeightKg,
    avgTotal,
    avgUsed,
    avgOldRemaining,
    ratioToTotal,
    flag,
  }
}

async function main() {
  const rows = await getYarnTypeLevel()
  const analyzed = rows.map(analyze)

  // ── System-wide totals ──────────────────────────────────────────────
  const sumOld = analyzed.reduce((s, r) => s + r.oldRemainingWeightKg, 0)
  const sumNew = analyzed.reduce((s, r) => s + r.newRemainingWeightKg, 0)
  const sumTotal = analyzed.reduce((s, r) => s + r.totalWeightKg, 0)
  const sumDiff = sumNew - sumOld

  console.log('=== System-wide totals (177 yarnType) ===')
  console.log(`Σ totalWeightKg (all imports)         : ${sumTotal.toFixed(2)} kg`)
  console.log(`Σ remainingWeightKg (OLD formula)      : ${sumOld.toFixed(2)} kg`)
  console.log(`Σ remainingWeightKg (NEW formula)      : ${sumNew.toFixed(2)} kg`)
  console.log(`Diff (NEW - OLD)                        : ${sumDiff.toFixed(2)} kg (${((sumDiff / sumOld) * 100).toFixed(2)}% of OLD, ${((sumDiff / sumTotal) * 100).toFixed(2)}% of Σtotal)`)

  // ── Flagged (27) + negative (8) ──────────────────────────────────────
  const flagged = analyzed.filter((r) => r.flag !== 'normal').sort((a, b) => (b.ratioToTotal ?? 0) - (a.ratioToTotal ?? 0))
  const negative = analyzed.filter((r) => r.flag === 'negative-remaining')

  console.log(`\n=== Flagged yarnType: ${flagged.length} (should be 27) ===`)
  console.log(`Negative-remaining yarnType: ${negative.length} (should be 8)`)

  console.log('\n=== Per-yarnType comparison (flagged only) ===')
  console.log('yarnType | totalSpool | remainingSpool | OLD kg | NEW kg | diff kg | flag')
  for (const r of flagged) {
    console.log(
      `${r.yarnType} | ${r.totalSpool.toLocaleString()} | ${r.remainingSpool.toLocaleString()} | ${r.oldRemainingWeightKg.toFixed(2)} | ${r.newRemainingWeightKg.toFixed(2)} | ${r.diffKg.toFixed(2)} | ${r.flag}`
    )
  }

  // ── Impact on average-weight endpoint math ──────────────────────────
  // averageKgRemaining = remainingWeightKg / remainingSpool.
  // Under NEW formula: remainingWeightKg = remainingSpool * avgTotal
  //   => averageKgRemaining_NEW = remainingSpool * avgTotal / remainingSpool = avgTotal (always, when remainingSpool>0)
  console.log('\n=== Effect on /api/warehouse/material/average-weight ===')
  console.log('Under NEW formula, averageKgRemaining collapses to exactly averageKgTotal (totalWeightKg/totalSpool)')
  console.log('for every row with remainingSpool > 0 — the two fields become mathematically identical (redundant).')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
