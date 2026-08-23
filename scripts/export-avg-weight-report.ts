/**
 * export-avg-weight-report.ts — READ ONLY. Exports 3 CSVs to scripts/exports/
 * for the material average-weight-per-spool outlier investigation
 * (see docs/... investigation, MEMORY project_material_avg_weight_outliers).
 * Does not write to the database in any way.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/prisma'

const OUT_DIR = path.join(__dirname, 'exports')
fs.mkdirSync(OUT_DIR, { recursive: true })

// Minimal CSV helper — quotes fields containing comma/quote/newline.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',')
  const lines = rows.map(r => columns.map(c => csvCell(r[c])).join(','))
  return [header, ...lines].join('\n') + '\n'
}

async function main() {
  // ── 1. Data entry error cases: id=460, id=3984 ──────────────────────────
  const errorIds = [460, 3984]
  const errorRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, "yarnType", "supplierName", lot, spool, sack, "weightKgSum",
           "weightKgNet", "weightKgPackage", "averageKg", "averageP"
    FROM materials WHERE id = ANY($1::int[])
  `, errorIds)

  const errorCsvRows = errorRows.map(r => {
    const spool = Number(r.spool)
    const weightKgNet = Number(r.weightKgNet)
    const correctedAverageKg = spool > 0 ? weightKgNet / spool : null
    const storedAverageKg = Number(r.averageKg)
    const impliedDivisor = storedAverageKg > 0 ? weightKgNet / storedAverageKg : null
    let evidence: string
    if (r.id === 460) {
      evidence =
        `averageKg เดิม (${storedAverageKg}) = weightKgNet(${weightKgNet}) / sack(${r.sack}), ` +
        `ไม่ใช่ / spool(${spool}). ${weightKgNet}/${r.sack} = ${(weightKgNet / Number(r.sack)).toFixed(4)} ตรงกับ averageKg เดิมเป๊ะ ` +
        `→ คำนวณผิดโดยหารด้วยจำนวนกระสอบแทนจำนวนลูก ค่าที่ถูกต้องคือ ${correctedAverageKg?.toFixed(4)} kg/ลูก`
    } else {
      evidence =
        `weightKgNet(${weightKgNet}) / averageKg เดิม(${storedAverageKg}) = ${impliedDivisor?.toFixed(2)} ≈ spool(${spool}) ` +
        `→ สูตรคำนวณ net/spool สอดคล้องกันเอง (ไม่ใช่ error จากการหารผิดตัวหาร) ค่า ${correctedAverageKg?.toFixed(4)} kg/ลูก (~${(correctedAverageKg! * 2.2046).toFixed(1)} lb) ` +
        `ยังคงสูงกว่าเกณฑ์ปกติ 4-5 ปอนด์มาก — spool=${spool} เท่ากับ box=${r.spool != null ? '(ดูคอลัมน์ box แยก)' : ''} ` +
        `บ่งชี้ว่าเป็นม้วนด้ายอุตสาหกรรมขนาดใหญ่ (cone) ไม่ใช่ลูกด้ายมาตรฐาน — ต้องให้ทีมคลังยืนยันว่าเป็นน้ำหนักจริงของ yarnType นี้หรือไม่`
    }
    return {
      id: r.id,
      yarnType: r.yarnType,
      supplierName: r.supplierName,
      lot: r.lot,
      spool: r.spool,
      sack: r.sack,
      weightKgSum: r.weightKgSum,
      weightKgNet: r.weightKgNet,
      weightKgPackage: r.weightKgPackage,
      averageKg_เดิม: storedAverageKg,
      averageP_เดิม: r.averageP,
      averageKg_ที่ควรเป็น_net_div_spool: correctedAverageKg?.toFixed(4),
      averageP_ที่ควรเป็น: correctedAverageKg != null ? (correctedAverageKg * 2.2046).toFixed(4) : '',
      หลักฐาน: evidence,
    }
  })
  const errorCsv = toCsv(errorCsvRows, [
    'id', 'yarnType', 'supplierName', 'lot', 'spool', 'sack',
    'weightKgSum', 'weightKgNet', 'weightKgPackage',
    'averageKg_เดิม', 'averageP_เดิม',
    'averageKg_ที่ควรเป็น_net_div_spool', 'averageP_ที่ควรเป็น', 'หลักฐาน',
  ])
  fs.writeFileSync(path.join(OUT_DIR, 'material-avg-weight-errors.csv'), '﻿' + errorCsv, 'utf8')

  // ── 2. Jongsatit supplier group ──────────────────────────────────────────
  const jsRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, "yarnType", "supplierName", lot, spool, "weightKgSum", "weightKgNet",
           "weightKgPackage", "averageKg", "averageP"
    FROM materials
    WHERE "supplierName" LIKE '%จงสถิตย์%' AND "averageKg" > 2.5
    ORDER BY "yarnType", "averageKg" DESC
  `)
  const jsDetailCsv = toCsv(
    jsRows.map(r => ({
      id: r.id, yarnType: r.yarnType, supplierName: r.supplierName, lot: r.lot,
      spool: r.spool, weightKgSum: r.weightKgSum, weightKgNet: r.weightKgNet,
      weightKgPackage: r.weightKgPackage, averageKg: r.averageKg, averageP: r.averageP,
    })),
    ['id', 'yarnType', 'supplierName', 'lot', 'spool', 'weightKgSum', 'weightKgNet', 'weightKgPackage', 'averageKg', 'averageP']
  )
  fs.writeFileSync(path.join(OUT_DIR, 'material-avg-weight-jongsatit.csv'), '﻿' + jsDetailCsv, 'utf8')

  // Group-by summary appended as a second CSV section is awkward — instead build the
  // group-by from the same query result in JS (keeps a single source of truth query).
  const groupMap = new Map<string, { count: number; spoolMin: number; spoolMax: number; avgMin: number; avgMax: number }>()
  for (const r of jsRows) {
    const key = r.yarnType
    const spool = Number(r.spool)
    const avg = Number(r.averageKg)
    const g = groupMap.get(key)
    if (!g) {
      groupMap.set(key, { count: 1, spoolMin: spool, spoolMax: spool, avgMin: avg, avgMax: avg })
    } else {
      g.count++
      g.spoolMin = Math.min(g.spoolMin, spool)
      g.spoolMax = Math.max(g.spoolMax, spool)
      g.avgMin = Math.min(g.avgMin, avg)
      g.avgMax = Math.max(g.avgMax, avg)
    }
  }
  const groupRows = [...groupMap.entries()]
    .map(([yarnType, g]) => ({ yarnType, ...g }))
    .sort((a, b) => b.count - a.count)
  const groupCsv = toCsv(
    groupRows.map(g => ({
      yarnType: g.yarnType, count: g.count,
      spool_min: g.spoolMin, spool_max: g.spoolMax,
      averageKg_min: g.avgMin.toFixed(4), averageKg_max: g.avgMax.toFixed(4),
    })),
    ['yarnType', 'count', 'spool_min', 'spool_max', 'averageKg_min', 'averageKg_max']
  )
  fs.writeFileSync(path.join(OUT_DIR, 'material-avg-weight-jongsatit-summary.csv'), '﻿' + groupCsv, 'utf8')

  // ── 3. TR20/TR16 nominal-spool group ─────────────────────────────────────
  const trRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, "yarnType", "supplierName", lot, spool, "weightKgSum", "weightKgNet",
           "weightKgPackage", "averageKg", "averageP"
    FROM materials
    WHERE "supplierName" LIKE '%อินโดไทยซินเทติคซ์%' AND "yarnType" LIKE 'TR%'
    ORDER BY "yarnType", id
  `)
  const trCsv = toCsv(
    trRows.map(r => ({
      id: r.id, yarnType: r.yarnType, lot: r.lot, spool: r.spool,
      weightKgNet: r.weightKgNet, averageKg: r.averageKg, averageP: r.averageP,
      is_exactly_3kg: Number(r.averageKg) === 3 ? 'YES' : 'no',
    })),
    ['id', 'yarnType', 'lot', 'spool', 'weightKgNet', 'averageKg', 'averageP', 'is_exactly_3kg']
  )
  fs.writeFileSync(path.join(OUT_DIR, 'material-avg-weight-tr-nominal.csv'), '﻿' + trCsv, 'utf8')

  // ── Console summary ───────────────────────────────────────────────────────
  console.log(`\n=== 1. material-avg-weight-errors.csv ===`)
  console.log(`rows: ${errorCsvRows.length}`)
  console.log(errorCsv)

  console.log(`\n=== 2. material-avg-weight-jongsatit.csv ===`)
  console.log(`rows: ${jsRows.length}`)
  console.log(jsDetailCsv.split('\n').slice(0, 6).join('\n'))
  console.log(`... (${jsRows.length} total rows)`)

  console.log(`\n=== 2b. material-avg-weight-jongsatit-summary.csv (group by yarnType) ===`)
  console.log(`rows: ${groupRows.length}`)
  console.log(groupCsv)

  console.log(`\n=== 3. material-avg-weight-tr-nominal.csv ===`)
  console.log(`rows: ${trRows.length}`)
  const exactly3 = trRows.filter(r => Number(r.averageKg) === 3).length
  console.log(`averageKg exactly 3.0 in ${exactly3}/${trRows.length} rows`)
  console.log(trCsv.split('\n').slice(0, 8).join('\n'))
  console.log(`... (${trRows.length} total rows)`)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error('ERROR', e)
  process.exit(1)
})
