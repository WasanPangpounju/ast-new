import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

type Row = {
  yarnType: string
  supplierName: string
  totalSpool: number
  usedSpool: number
  remainingSpool: number
  totalWeightKg: string | number
  usedWeightKg: string | number
  remainingWeightKg: string | number
}

// Old query: LEFT JOIN materialrequisitions directly, no pre-aggregate — fans
// out m.spool/weightKgSum once per matching requisition row before GROUP BY.
async function oldFormula(): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(`
    SELECT
      m."yarnType",
      m."supplierName",
      SUM(m.spool)::int                                                  AS "totalSpool",
      COALESCE(SUM(r.spool), 0)::int                                     AS "usedSpool",
      (SUM(m.spool) - COALESCE(SUM(r.spool), 0))::int                   AS "remainingSpool",
      SUM(m."weightKgSum")                                               AS "totalWeightKg",
      COALESCE(SUM(r."weightWithdrawn"), 0)                              AS "usedWeightKg",
      (SUM(m."weightKgSum") - COALESCE(SUM(r."weightWithdrawn"), 0))    AS "remainingWeightKg"
    FROM materials m
    LEFT JOIN materialrequisitions r
      ON r."materialId" = m.id AND r."deletedAt" IS NULL
    WHERE m."deletedAt" IS NULL
    GROUP BY m."yarnType", m."supplierName"
    ORDER BY m."yarnType", m."supplierName"
  `)
}

// Fixed query: pre-aggregates materialrequisitions by materialId in a CTE
// before joining, so materials no longer fan out. Formula unchanged (total - req).
async function fanoutFixed(): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(`
    WITH req AS (
      SELECT "materialId", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
      FROM materialrequisitions
      WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
      GROUP BY "materialId"
    )
    SELECT
      m."yarnType",
      m."supplierName",
      SUM(m.spool)::int                                                  AS "totalSpool",
      COALESCE(SUM(req.spool), 0)::int                                   AS "usedSpool",
      (SUM(m.spool) - COALESCE(SUM(req.spool), 0))::int                 AS "remainingSpool",
      SUM(m."weightKgSum")                                               AS "totalWeightKg",
      COALESCE(SUM(req.weight), 0)                                       AS "usedWeightKg",
      (SUM(m."weightKgSum") - COALESCE(SUM(req.weight), 0))             AS "remainingWeightKg"
    FROM materials m
    LEFT JOIN req ON req."materialId" = m.id
    WHERE m."deletedAt" IS NULL
    GROUP BY m."yarnType", m."supplierName"
    ORDER BY m."yarnType", m."supplierName"
  `)
}

function totals(rows: Row[]) {
  return {
    spool: rows.reduce((s, r) => s + r.remainingSpool, 0),
    kg: rows.reduce((s, r) => s + Number(r.remainingWeightKg), 0),
  }
}

async function main() {
  const [before, after] = await Promise.all([oldFormula(), fanoutFixed()])

  const key = (r: Row) => `${r.yarnType}|||${r.supplierName}`
  const beforeMap = new Map(before.map((r) => [key(r), r]))
  const afterMap = new Map(after.map((r) => [key(r), r]))
  const allKeys = new Set([...beforeMap.keys(), ...afterMap.keys()])

  const diffs: { yarnType: string; supplierName: string; beforeSpool: number; afterSpool: number; beforeKg: number; afterKg: number }[] = []

  for (const k of allKeys) {
    const b = beforeMap.get(k)
    const a = afterMap.get(k)
    const beforeSpool = b?.remainingSpool ?? 0
    const afterSpool = a?.remainingSpool ?? 0
    const beforeKg = Number(b?.remainingWeightKg ?? 0)
    const afterKg = Number(a?.remainingWeightKg ?? 0)
    if (beforeSpool !== afterSpool || Math.abs(beforeKg - afterKg) > 0.001) {
      const [yarnType, supplierName] = k.split('|||')
      diffs.push({ yarnType, supplierName, beforeSpool, afterSpool, beforeKg, afterKg })
    }
  }

  diffs.sort((x, y) => (y.beforeSpool - y.afterSpool) - (x.beforeSpool - x.afterSpool))

  const tBefore = totals(before)
  const tAfter = totals(after)

  console.log(`\nTotal yarnType/supplier groups: ${allKeys.size}\n`)

  console.log('=== Fan-out fix only (pre-aggregate materialrequisitions by materialId before join) ===')
  console.log('Scope: this fix touches ONLY the join fan-out bug. Formula stays total - req (no outside-withdrawal')
  console.log('or return netting — that is a separate change tracked on feature/package-return-tracking / feature/material-return-ui).')
  console.log(`remainingSpool:    before=${tBefore.spool.toLocaleString()}  after=${tAfter.spool.toLocaleString()}  delta=${(tAfter.spool - tBefore.spool).toLocaleString()} (${(((tAfter.spool - tBefore.spool) / tBefore.spool) * 100).toFixed(2)}%)`)
  console.log(`remainingWeightKg: before=${tBefore.kg.toFixed(2)}  after=${tAfter.kg.toFixed(2)}  delta=${(tAfter.kg - tBefore.kg).toFixed(2)} (${(((tAfter.kg - tBefore.kg) / tBefore.kg) * 100).toFixed(2)}%)`)

  console.log(`\n=== Per yarnType/supplier diffs (top 30 by spool delta) ===`)
  console.log('yarnType | supplierName | beforeSpool | afterSpool | beforeKg | afterKg')
  for (const d of diffs.slice(0, 30)) {
    console.log(`${d.yarnType} | ${d.supplierName} | ${d.beforeSpool} | ${d.afterSpool} | ${d.beforeKg.toFixed(2)} | ${d.afterKg.toFixed(2)}`)
  }

  const negatives = after.filter((r) => r.remainingSpool < 0 || Number(r.remainingWeightKg) < 0)
  console.log(`\n=== Negative remaining values after fix: ${negatives.length} (left un-clamped as a data-quality signal, per instruction) ===`)
  for (const n of negatives) {
    console.log(`${n.yarnType} | ${n.supplierName} | remainingSpool=${n.remainingSpool} | remainingWeightKg=${Number(n.remainingWeightKg).toFixed(2)}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
