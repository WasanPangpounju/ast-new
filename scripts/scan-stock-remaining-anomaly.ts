// สแกนทั้งระบบ (READ-ONLY) หา yarnType ที่ค่าเฉลี่ย "คงเหลือ" (remainingWeightKg/remainingSpool)
// สูง/ต่ำผิดปกติเทียบกับค่าเฉลี่ย "ทั้งหมด" (total) หรือ "ใช้ไปแล้ว" (used) — แบบเดียวกับ
// TC 45 COMB (65:35) G 10 (avgRemaining 7.78 vs avgTotal 2.358 vs avgUsed 1.931)
//
// ใช้สูตรเดียวกับหน้าสต็อกจริง (MATERIAL_STOCK_CTES / AGGREGATE_COLUMNS ใน src/lib/materialStock.ts)
// ไม่มีการ UPDATE/DELETE/INSERT ใดๆ — query อย่างเดียว
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { prisma } from '../src/lib/prisma'
import { MATERIAL_STOCK_CTES, MATERIAL_STOCK_JOINS, AGGREGATE_COLUMNS } from '../src/lib/materialStock'

type YarnRow = {
  yarnType: string
  supplierCount: number
  totalSpool: number
  usedSpool: number
  remainingSpool: number
  totalWeightKg: string | number
  usedWeightKg: string | number
  remainingWeightKg: string | number
}

type CompanyRow = {
  yarnType: string
  supplierName: string
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
      COUNT(DISTINCT m."supplierName")::int AS "supplierCount",
      ${AGGREGATE_COLUMNS}
    FROM materials m
    ${MATERIAL_STOCK_JOINS}
    WHERE m."deletedAt" IS NULL
    GROUP BY m."yarnType"
    ORDER BY m."yarnType"
  `)
}

async function getCompanyLevel(): Promise<CompanyRow[]> {
  return prisma.$queryRawUnsafe<CompanyRow[]>(`
    WITH ${MATERIAL_STOCK_CTES}
    SELECT
      m."yarnType",
      m."supplierName",
      ${AGGREGATE_COLUMNS}
    FROM materials m
    ${MATERIAL_STOCK_JOINS}
    WHERE m."deletedAt" IS NULL
    GROUP BY m."yarnType", m."supplierName"
    ORDER BY m."yarnType", m."supplierName"
  `)
}

type Analyzed = {
  yarnType: string
  supplierName: string // '' = group-level (yarnType only)
  totalSpool: number
  usedSpool: number
  remainingSpool: number
  totalWeightKg: number
  usedWeightKg: number
  remainingWeightKg: number
  avgTotal: number | null
  avgUsed: number | null
  avgRemaining: number | null
  ratioToTotal: number | null
  ratioToUsed: number | null
  remainingPctOfTotal: number | null
  flag: string
}

function analyze(r: {
  yarnType: string
  supplierName?: string
  totalSpool: number
  usedSpool: number
  remainingSpool: number
  totalWeightKg: string | number
  usedWeightKg: string | number
  remainingWeightKg: string | number
}): Analyzed {
  const totalSpool = r.totalSpool
  const usedSpool = r.usedSpool
  const remainingSpool = r.remainingSpool
  const totalWeightKg = Number(r.totalWeightKg)
  const usedWeightKg = Number(r.usedWeightKg)
  const remainingWeightKg = Number(r.remainingWeightKg)

  const avgTotal = totalSpool > 0 ? totalWeightKg / totalSpool : null
  const avgUsed = usedSpool > 0 ? usedWeightKg / usedSpool : null
  const avgRemaining = remainingSpool > 0 ? remainingWeightKg / remainingSpool : null
  const ratioToTotal = avgRemaining !== null && avgTotal !== null && avgTotal !== 0 ? avgRemaining / avgTotal : null
  const ratioToUsed = avgRemaining !== null && avgUsed !== null && avgUsed !== 0 ? avgRemaining / avgUsed : null
  const remainingPctOfTotal = totalSpool > 0 ? (remainingSpool / totalSpool) * 100 : null

  let flag = 'normal'
  if (remainingSpool < 0 || remainingWeightKg < 0) {
    flag = 'negative-remaining'
  } else if (ratioToTotal !== null && ratioToTotal > 2) {
    flag = 'high (>2x total)'
  } else if (ratioToTotal !== null && ratioToTotal < 0.5) {
    flag = 'low (<0.5x total)'
  }

  return {
    yarnType: r.yarnType,
    supplierName: r.supplierName ?? '',
    totalSpool,
    usedSpool,
    remainingSpool,
    totalWeightKg,
    usedWeightKg,
    remainingWeightKg,
    avgTotal,
    avgUsed,
    avgRemaining,
    ratioToTotal,
    ratioToUsed,
    remainingPctOfTotal,
    flag,
  }
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: Analyzed[]): string {
  const cols: (keyof Analyzed)[] = [
    'yarnType', 'supplierName', 'totalSpool', 'usedSpool', 'remainingSpool',
    'totalWeightKg', 'usedWeightKg', 'remainingWeightKg',
    'avgTotal', 'avgUsed', 'avgRemaining', 'ratioToTotal', 'ratioToUsed',
    'remainingPctOfTotal', 'flag',
  ]
  const header = cols.join(',')
  const lines = rows.map((r) =>
    cols
      .map((c) => {
        const v = r[c]
        if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(4).replace(/\.?0+$/, '') || '0' : ''
        return csvEscape(v)
      })
      .join(',')
  )
  return [header, ...lines].join('\n')
}

async function main() {
  const [yarnRows, companyRows] = await Promise.all([getYarnTypeLevel(), getCompanyLevel()])

  const yarnAnalyzed = yarnRows.map((r) => analyze(r))
  const companyAnalyzed = companyRows.map((r) => analyze(r))

  console.log(`\n=== สแกนระดับ yarnType: ${yarnAnalyzed.length} ชนิดด้าย ===\n`)

  const highYarn = yarnAnalyzed.filter((r) => r.flag === 'high (>2x total)').sort((a, b) => (b.ratioToTotal ?? 0) - (a.ratioToTotal ?? 0))
  const lowYarn = yarnAnalyzed.filter((r) => r.flag === 'low (<0.5x total)').sort((a, b) => (a.ratioToTotal ?? 0) - (b.ratioToTotal ?? 0))
  const negYarn = yarnAnalyzed.filter((r) => r.flag === 'negative-remaining')

  console.log(`ratio สูงผิดปกติ (avgRemaining > 2x avgTotal): ${highYarn.length} ชนิด`)
  console.log(`ratio ต่ำผิดปกติ (avgRemaining < 0.5x avgTotal): ${lowYarn.length} ชนิด`)
  console.log(`remaining ติดลบที่ระดับ yarnType: ${negYarn.length} ชนิด`)
  console.log(`รวมผิดปกติ: ${highYarn.length + lowYarn.length + negYarn.length} / ${yarnAnalyzed.length} (${(((highYarn.length + lowYarn.length + negYarn.length) / yarnAnalyzed.length) * 100).toFixed(1)}%)`)

  console.log('\n=== Top 15 สูงผิดปกติที่สุด (ratio avgRemaining/avgTotal) ===\n')
  console.log('yarnType | totalSpool | remainingSpool | remaining%ofTotal | avgTotal | avgUsed | avgRemaining | ratioToTotal')
  for (const r of highYarn.slice(0, 15)) {
    console.log(
      `${r.yarnType} | ${r.totalSpool.toLocaleString()} | ${r.remainingSpool.toLocaleString()} | ${r.remainingPctOfTotal?.toFixed(1)}% | ${r.avgTotal?.toFixed(3)} | ${r.avgUsed?.toFixed(3) ?? 'n/a'} | ${r.avgRemaining?.toFixed(3)} | ${r.ratioToTotal?.toFixed(2)}x`
    )
  }

  console.log('\n=== Top 15 ต่ำผิดปกติที่สุด (ratio avgRemaining/avgTotal) ===\n')
  console.log('yarnType | totalSpool | remainingSpool | remaining%ofTotal | avgTotal | avgUsed | avgRemaining | ratioToTotal')
  for (const r of lowYarn.slice(0, 15)) {
    console.log(
      `${r.yarnType} | ${r.totalSpool.toLocaleString()} | ${r.remainingSpool.toLocaleString()} | ${r.remainingPctOfTotal?.toFixed(1)}% | ${r.avgTotal?.toFixed(3)} | ${r.avgUsed?.toFixed(3) ?? 'n/a'} | ${r.avgRemaining?.toFixed(3)} | ${r.ratioToTotal?.toFixed(2)}x`
    )
  }

  if (negYarn.length) {
    console.log('\n=== ระดับ yarnType ที่ remaining ติดลบ ===\n')
    for (const r of negYarn) {
      console.log(`${r.yarnType} | remainingSpool=${r.remainingSpool.toLocaleString()} | remainingWeightKg=${r.remainingWeightKg.toFixed(2)}`)
    }
  }

  // แยกลึกลงระดับ company เฉพาะ yarnType ที่ถูก flag (สูง/ต่ำ/ติดลบ) เพื่อดูว่ากระจุกบริษัทไหน
  const flaggedYarnTypes = new Set([...highYarn, ...lowYarn, ...negYarn].map((r) => r.yarnType))
  const companyBreakdown = companyAnalyzed.filter((r) => flaggedYarnTypes.has(r.yarnType))

  const exportsDir = 'scripts/exports'
  const yarnCsvPath = `${exportsDir}/stock-remaining-anomaly-by-yarntype.csv`
  const companyCsvPath = `${exportsDir}/stock-remaining-anomaly-by-company.csv`

  writeFileSync(yarnCsvPath, toCsv(yarnAnalyzed))
  writeFileSync(companyCsvPath, toCsv(companyBreakdown))

  console.log(`\nExport: ${yarnCsvPath} (${yarnAnalyzed.length} แถว, ทุก yarnType)`)
  console.log(`Export: ${companyCsvPath} (${companyBreakdown.length} แถว, breakdown ราย supplierName เฉพาะ yarnType ที่ flag)`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
