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

// Isolates the fan-out fix from the outside/return netting: same as oldFormula's
// scope (requisitions only) but pre-aggregated by materialId so it doesn't fan out.
async function fanoutFixedReqOnly(): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(`
    WITH
      req AS (
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

async function newFormula(): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(`
    WITH
      req AS (
        SELECT "materialId", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
        FROM materialrequisitions
        WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
        GROUP BY "materialId"
      ),
      out_w AS (
        SELECT "materialId", SUM(spool) AS spool, SUM("weightWithdrawn") AS weight
        FROM material_outsides
        WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
        GROUP BY "materialId"
      ),
      ret AS (
        SELECT "materialId", SUM(spool) AS spool, SUM("weightReturn") AS weight
        FROM material_returns
        WHERE "deletedAt" IS NULL AND "materialId" IS NOT NULL
        GROUP BY "materialId"
      )
    SELECT
      m."yarnType",
      m."supplierName",
      SUM(m.spool)::int                                                            AS "totalSpool",
      (COALESCE(SUM(req.spool), 0) + COALESCE(SUM(out_w.spool), 0))::int           AS "usedSpool",
      (SUM(m.spool)
        - COALESCE(SUM(req.spool), 0)
        - COALESCE(SUM(out_w.spool), 0)
        + COALESCE(SUM(ret.spool), 0))::int                                        AS "remainingSpool",
      SUM(m."weightKgSum")                                                          AS "totalWeightKg",
      (COALESCE(SUM(req.weight), 0) + COALESCE(SUM(out_w.weight), 0))              AS "usedWeightKg",
      (SUM(m."weightKgSum")
        - COALESCE(SUM(req.weight), 0)
        - COALESCE(SUM(out_w.weight), 0)
        + COALESCE(SUM(ret.weight), 0))                                            AS "remainingWeightKg"
    FROM materials m
    LEFT JOIN req   ON req."materialId"   = m.id
    LEFT JOIN out_w ON out_w."materialId" = m.id
    LEFT JOIN ret   ON ret."materialId"   = m.id
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
  const [before, mid, after] = await Promise.all([oldFormula(), fanoutFixedReqOnly(), newFormula()])

  const key = (r: Row) => `${r.yarnType}|||${r.supplierName}`
  const beforeMap = new Map(before.map((r) => [key(r), r]))
  const midMap = new Map(mid.map((r) => [key(r), r]))
  const afterMap = new Map(after.map((r) => [key(r), r]))

  const allKeys = new Set([...beforeMap.keys(), ...midMap.keys(), ...afterMap.keys()])

  const diffs: { yarnType: string; supplierName: string; midSpool: number; afterSpool: number; midKg: number; afterKg: number }[] = []

  for (const k of allKeys) {
    const m = midMap.get(k)
    const a = afterMap.get(k)
    const midSpool = m?.remainingSpool ?? 0
    const afterSpool = a?.remainingSpool ?? 0
    const midKg = Number(m?.remainingWeightKg ?? 0)
    const afterKg = Number(a?.remainingWeightKg ?? 0)
    if (midSpool !== afterSpool || Math.abs(midKg - afterKg) > 0.001) {
      const [yarnType, supplierName] = k.split('|||')
      diffs.push({ yarnType, supplierName, midSpool, afterSpool, midKg, afterKg })
    }
  }

  diffs.sort((x, y) => (y.midSpool - y.afterSpool) - (x.midSpool - x.afterSpool))

  const tBefore = totals(before)
  const tMid = totals(mid)
  const tAfter = totals(after)

  console.log(`\nTotal yarnType/supplier groups: ${allKeys.size}\n`)

  console.log('=== STEP A -> B: fan-out fix only (pre-aggregate requisitions by materialId; still no outside/return netting) ===')
  console.log('This is a PRE-EXISTING bug, unrelated to the returns feature — some materials have 100s-1000s of requisition rows,')
  console.log('and the old query joined them directly then GROUP BY yarnType/supplierName, multiplying m.spool per matching row.')
  console.log(`remainingSpool:    A(current live)=${tBefore.spool.toLocaleString()}  B(fan-out fixed)=${tMid.spool.toLocaleString()}  delta=${(tMid.spool - tBefore.spool).toLocaleString()} (${(((tMid.spool - tBefore.spool) / tBefore.spool) * 100).toFixed(2)}%)`)
  console.log(`remainingWeightKg: A(current live)=${tBefore.kg.toFixed(2)}  B(fan-out fixed)=${tMid.kg.toFixed(2)}  delta=${(tMid.kg - tBefore.kg).toFixed(2)} (${(((tMid.kg - tBefore.kg) / tBefore.kg) * 100).toFixed(2)}%)`)

  console.log('\n=== STEP B -> C: the actual formula change requested (subtract เบิกภายนอก, add คืนเข้าสต็อก) ===')
  console.log(`remainingSpool:    B(fan-out fixed only)=${tMid.spool.toLocaleString()}  C(full fix)=${tAfter.spool.toLocaleString()}  delta=${(tAfter.spool - tMid.spool).toLocaleString()} (${(((tAfter.spool - tMid.spool) / tMid.spool) * 100).toFixed(2)}%)`)
  console.log(`remainingWeightKg: B(fan-out fixed only)=${tMid.kg.toFixed(2)}  C(full fix)=${tAfter.kg.toFixed(2)}  delta=${(tAfter.kg - tMid.kg).toFixed(2)} (${(((tAfter.kg - tMid.kg) / tMid.kg) * 100).toFixed(2)}%)`)
  console.log('(This step is entirely from material_outsides, since material_returns has 0 rows right now.)')

  console.log('\n=== STEP A -> C: net effect of this change as shipped (what users will actually see change) ===')
  console.log(`remainingSpool:    A=${tBefore.spool.toLocaleString()}  C=${tAfter.spool.toLocaleString()}  delta=${(tAfter.spool - tBefore.spool).toLocaleString()} (${(((tAfter.spool - tBefore.spool) / tBefore.spool) * 100).toFixed(2)}%)`)
  console.log(`remainingWeightKg: A=${tBefore.kg.toFixed(2)}  C=${tAfter.kg.toFixed(2)}  delta=${(tAfter.kg - tBefore.kg).toFixed(2)} (${(((tAfter.kg - tBefore.kg) / tBefore.kg) * 100).toFixed(2)}%)`)

  console.log('\n=== Per yarnType/supplier diffs isolating outside-withdrawal effect only (B vs C, top 30 by spool delta) ===')
  console.log('yarnType | supplierName | midSpool(B) | afterSpool(C) | midKg(B) | afterKg(C)')
  for (const d of diffs.slice(0, 30)) {
    console.log(`${d.yarnType} | ${d.supplierName} | ${d.midSpool} | ${d.afterSpool} | ${d.midKg.toFixed(2)} | ${d.afterKg.toFixed(2)}`)
  }

  const negatives = after.filter((r) => r.remainingSpool < 0 || Number(r.remainingWeightKg) < 0)
  console.log(`\n=== Negative remaining values after fix: ${negatives.length} ===`)
  for (const n of negatives) {
    console.log(`${n.yarnType} | ${n.supplierName} | remainingSpool=${n.remainingSpool} | remainingWeightKg=${Number(n.remainingWeightKg).toFixed(2)}`)
  }

  const [returnCount, returnNullMatId, outsideCount, outsideNullMatId] = await Promise.all([
    prisma.materialReturn.count({ where: { deletedAt: null } }),
    prisma.materialReturn.count({ where: { deletedAt: null, materialId: null } }),
    prisma.materialOutside.count({ where: { deletedAt: null } }),
    prisma.materialOutside.count({ where: { deletedAt: null, materialId: null } }),
  ])
  console.log('\n=== Source table row counts ===')
  console.log(`material_returns:  total=${returnCount}  materialId=null (excluded from formula)=${returnNullMatId}`)
  console.log(`material_outsides: total=${outsideCount}  materialId=null (excluded from formula)=${outsideNullMatId}`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
