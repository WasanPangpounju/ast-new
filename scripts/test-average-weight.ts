import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { MATERIAL_STOCK_CTES, MATERIAL_STOCK_JOINS, AGGREGATE_COLUMNS, esc } from '../src/lib/materialStock'

async function independentAverage(yarnType: string, supplierName: string) {
  const [row] = await prisma.$queryRawUnsafe<{ remainingSpool: number; remainingWeightKg: number | string }[]>(`
    WITH ${MATERIAL_STOCK_CTES}
    SELECT ${AGGREGATE_COLUMNS}
    FROM materials m
    ${MATERIAL_STOCK_JOINS}
    WHERE m."deletedAt" IS NULL
      AND m."yarnType" = '${esc(yarnType)}'
      AND m."supplierName" = '${esc(supplierName)}'
  `)
  const remainingSpool = row?.remainingSpool ?? 0
  const remainingWeightKg = Number(row?.remainingWeightKg ?? 0)
  return { remainingSpool, remainingWeightKg, averageKg: remainingSpool > 0 ? remainingWeightKg / remainingSpool : null }
}

async function main() {
  // หา combo ที่มี remainingSpool > 0 จริง มาทดสอบ
  const candidates = await prisma.$queryRawUnsafe<{ yarnType: string; supplierName: string; remainingSpool: number }[]>(`
    WITH ${MATERIAL_STOCK_CTES}
    SELECT m."yarnType", m."supplierName", ${AGGREGATE_COLUMNS}
    FROM materials m
    ${MATERIAL_STOCK_JOINS}
    WHERE m."deletedAt" IS NULL
    GROUP BY m."yarnType", m."supplierName"
    HAVING (SUM(m.spool)
      - COALESCE(SUM("req".spool), 0) - COALESCE(SUM(out_w.spool), 0) - COALESCE(SUM(req_orphan.spool), 0)
      + COALESCE(SUM(ret.spool), 0)) > 0
    ORDER BY 3 DESC
    LIMIT 3
  `)

  console.log('=== Candidates with remainingSpool > 0 ===')
  console.log(candidates)

  for (const c of candidates) {
    const expected = await independentAverage(c.yarnType, c.supplierName)
    const url = `http://localhost:3000/api/warehouse/material/average-weight?yarnType=${encodeURIComponent(c.yarnType)}&supplierName=${encodeURIComponent(c.supplierName)}`
    const res = await fetch(url)
    const actual = await res.json()
    console.log(`\n--- ${c.yarnType} / ${c.supplierName} ---`)
    console.log('expected (direct query):', expected)
    console.log('actual   (API):         ', actual)
    const match = Math.abs((expected.averageKg ?? -1) - (actual.averageKg ?? -1)) < 1e-9
    console.log(match ? 'MATCH' : 'MISMATCH!!!')
  }

  // Edge case: yarnType+supplierName ที่ไม่มีอยู่ในสต็อกเลย
  const bogusUrl = `http://localhost:3000/api/warehouse/material/average-weight?yarnType=${encodeURIComponent('ZZZ-NONEXISTENT-YARN-9999')}&supplierName=${encodeURIComponent('ZZZ-NONEXISTENT-SUPPLIER-9999')}`
  const bogusRes = await fetch(bogusUrl)
  const bogusData = await bogusRes.json()
  console.log('\n--- Edge case: nonexistent combo ---')
  console.log('response:', bogusData)
  console.log(bogusData.averageKg === null ? 'OK: averageKg is null' : 'FAIL: expected null')

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
