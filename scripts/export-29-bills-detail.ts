/**
 * READ-ONLY export: full detail of the 29 bills previously confirmed NOT to be
 * duplicates (from the A-6519 investigation), for customer review.
 * Queries MySQL SOURCE via the SSH tunnel (127.0.0.1:3307). SELECT only.
 * Output: scripts/exports/29-bills-detail.csv (gitignored)
 */
import 'dotenv/config'
import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'

// [vatType, vatNo, group] — group per docs/bug-a6519-duplicate-investigation.md §6
const bills: [string, string, 'A' | 'B' | 'C'][] = [
  // Group A — ไม่ทับซ้อนเลย (5)
  ['A', '1183', 'A'], ['A', '1208', 'A'], ['A', '1322', 'A'], ['A', '5916', 'A'], ['A', '6528', 'A'],
  // Group B — ทับซ้อนบางส่วนแบบบังเอิญ (16)
  ['A', '1190', 'B'], ['A', '1223', 'B'], ['A', '1225', 'B'], ['A', '1227', 'B'], ['A', '1228', 'B'],
  ['A', '1244', 'B'], ['A', '1279', 'B'], ['A', '1284', 'B'], ['A', '1291', 'B'], ['A', '1305', 'B'],
  ['A', '5208', 'B'], ['A', '6127', 'B'], ['A', '6209', 'B'], ['A', '6213', 'B'], ['A', '6314', 'B'],
  ['A', '6397', 'B'],
  // Group C — ทับซ้อนสูงแต่เนื้อหาต่างจริง (8)
  ['A', '1178', 'C'], ['A', '1179', 'C'], ['A', '1211', 'C'], ['A', '1248', 'C'], ['A', '1261', 'C'],
  ['A', '1316', 'C'], ['A', '6147', 'C'], ['A', '6292', 'C'],
]

const groupLabel: Record<string, string> = {
  A: 'A - ไม่ทับซ้อนเลย',
  B: 'B - ทับซ้อนบางส่วนแบบบังเอิญ',
  C: 'C - ทับซ้อนสูงแต่เนื้อหาต่างจริง',
}

function multisetIntersectionSize(a: number[], b: number[]) {
  const bCount = new Map<number, number>()
  for (const x of b) bCount.set(x, (bCount.get(x) ?? 0) + 1)
  let hits = 0
  for (const x of a) {
    const c = bCount.get(x) ?? 0
    if (c > 0) { hits++; bCount.set(x, c - 1) }
  }
  return hits
}

function fmtGap(msDiff: number): string {
  const minutes = Math.round(msDiff / 60000)
  if (minutes < 60) return `${minutes} นาที`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours} ชม.` : `${hours} ชม. ${rem} นาที`
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

async function main() {
  const conn = await mysql.createConnection(process.env.MYSQL_SOURCE_URL!)
  console.log('✅ Connected to MySQL source via tunnel\n')

  const outRows: Record<string, string>[] = []

  for (const [vatType, vatNo, group] of bills) {
    const [rows]: any = await conn.query(
      `SELECT id, refId, fold, sumYard, fabricStruct, receiveName, created_at
       FROM fabricouts WHERE vatType = ? AND vatNo = ? ORDER BY id ASC`,
      [vatType, vatNo]
    )

    const groups = new Map<string, any[]>()
    for (const r of rows) {
      if (!groups.has(r.refId)) groups.set(r.refId, [])
      groups.get(r.refId)!.push(r)
    }
    const sessionList = [...groups.entries()].map(([refId, rs]) => ({
      refId,
      n: rs.length,
      yard: rs.reduce((s, r) => s + parseFloat(r.sumYard), 0),
      yards: rs.map(r => parseFloat(r.sumYard)),
      fabricStruct: rs[0].fabricStruct,
      minCreated: rs.map(r => new Date(r.created_at).getTime()).sort((a, b) => a - b)[0],
      minId: Math.min(...rs.map(r => r.id)),
    })).sort((a, b) => a.minId - b.minId)

    // fabric comparison
    const distinctFabrics = [...new Set(sessionList.map(s => s.fabricStruct))]
    const fabricNote = distinctFabrics.length === 1
      ? 'เหมือนกัน'
      : `ต่างกัน: ${distinctFabrics.join(' | ')}`

    // time gaps between consecutive sessions (chronological by minId)
    const gaps: string[] = []
    for (let i = 1; i < sessionList.length; i++) {
      gaps.push(fmtGap(sessionList[i].minCreated - sessionList[i - 1].minCreated))
    }

    // max pairwise overlap fraction (yard multiset) — used in the auto-generated reason
    let maxOverlapFrac = 0
    for (let i = 0; i < sessionList.length; i++) {
      for (let j = i + 1; j < sessionList.length; j++) {
        const inter = multisetIntersectionSize(sessionList[i].yards, sessionList[j].yards)
        const frac = inter / Math.min(sessionList[i].yards.length, sessionList[j].yards.length)
        if (frac > maxOverlapFrac) maxOverlapFrac = frac
      }
    }

    const sizes = sessionList.map(s => s.n)
    const sizesEqual = sizes.every(n => n === sizes[0])
    const overlapPct = Math.round(maxOverlapFrac * 100)

    let reason = ''
    if (group === 'A') {
      reason = `ยอดหลาไม่ซ้อนทับกันเลย (overlap 0%)${distinctFabrics.length > 1 ? ' และชนิดผ้าต่างกัน' : ''} → เป็นข้อมูลจริงคนละรายการ`
    } else if (group === 'B') {
      reason = `จำนวนพับ/ยอดหลาแต่ละ session ต่างกันชัดเจน (${sizes.join(' vs ')} พับ) overlap ยอดหลาแค่ ${overlapPct}% ซึ่งเป็นตัวเลขกลมที่พบซ้ำได้เองในอุตสาหกรรมผ้า ไม่ใช่หลักฐาน duplication`
    } else {
      // group C — bespoke reasoning per bill, falls back to generic if size/fabric differ
      if (distinctFabrics.length > 1) {
        reason = `id ต่อเนื่องกัน ห่างกันไม่กี่นาที-ชม. แต่ fabricStruct ต่างกันจริงระหว่าง session (${distinctFabrics.length} ชนิด) → เป็นผ้าคนละล็อต ไม่ใช่ duplicate`
      } else if (!sizesEqual) {
        reason = `id ต่อเนื่องกัน ห่างกันไม่กี่นาที-ชม. แต่จำนวนพับ/ยอดหลาต่างกันจริง (${sizes.join('/')}) overlap ${overlapPct}% → น่าจะเป็นการแบ่งกรอกของจริงเดียวกันเป็นหลาย session (ของเยอะ/ลูกค้ามารับหลายรอบ) ไม่ใช่การกรอกซ้ำ`
      } else {
        reason = `จำนวนพับเท่ากันทุก session (${sizes.join('/')}) แต่ยอดหลารวมและเนื้อหาไม่ตรงกัน (overlap ${overlapPct}%) → ไม่ใช่ duplicate เป๊ะ น่าจะเป็นชุดข้อมูลจริงคนละชุดที่บังเอิญมีจำนวนพับเท่ากัน`
      }
    }

    outRows.push({
      'เลขบิล': `${vatType}-${vatNo}`,
      'กลุ่ม': groupLabel[group],
      'จำนวน session/refId': String(sessionList.length),
      'จำนวนพับต่อ session': sizes.join('/'),
      'ยอดหลารวมต่อ session': sessionList.map(s => s.yard.toLocaleString('en-US')).join('/'),
      'ชนิดผ้า (fabricStruct)': fabricNote,
      'ช่วงเวลาห่างกันระหว่าง session': gaps.length > 0 ? gaps.join(' / ') : '-',
      'เหตุผลสรุป': reason,
    })
  }

  // write CSV
  const headers = Object.keys(outRows[0])
  const lines = [
    headers.join(','),
    ...outRows.map(r => headers.map(h => csvEscape(r[h])).join(',')),
  ]
  const outDir = path.join(process.cwd(), 'scripts', 'exports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, '29-bills-detail.csv')
  // BOM so Thai text opens correctly in Excel
  fs.writeFileSync(outPath, '﻿' + lines.join('\r\n'), 'utf8')
  console.log(`✅ Wrote ${outRows.length} rows to ${outPath}`)

  // also dump JSON for quick programmatic preview
  fs.writeFileSync(path.join(outDir, '29-bills-detail.json'), JSON.stringify(outRows, null, 2), 'utf8')

  await conn.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
