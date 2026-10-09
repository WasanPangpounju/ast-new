/**
 * verify-legacy-packages.ts — read-only check after migrate-legacy-packages.ts --apply.
 *
 * Recomputes the legacy page (PackageController::create) from the Postgres copies of
 * packages / packageasts / htrpackages + materials, and compares it per company with the
 * new system's summary (legacy scope). Over-returns are derived independently: htrpackages
 * quantities minus what the linked ใบคืน's entries actually allocated.
 * With --dump=<path> it also checks the 3 copies are identical to the mysqldump.
 *
 *   npx tsx scripts/verify-legacy-packages.ts [--dump=<ast-packages.sql>] [--supplier-map=<map.json>]
 *
 * Pass criteria: กล่อง / กระดาษกั้น equal per column; หลอด / พาเลท / กระสอบ equal by group total;
 * a difference counts as explained only when the signed adjustments add up to it exactly (over-return
 * clamped to 0, legacy rows not carried because the import is gone, capped at the import, duplicate
 * legacy rows, moved with the import to its current company, ใบคืน of merged legacy names).
 * Also: ต้องส่งคืน / คงค้าง ≤ นำเข้า on every company × column, and the legacy-screen formula samples.
 * Exit code 1 if anything fails.
 */

import 'dotenv/config'
import fs from 'node:fs'
import pg from 'pg'
import { verify } from './migrate-legacy-packages'
import { loadDump, loadSuppliers, type LegacyData, type Row } from './legacy-packages/lib'
import { columnOf, type ColumnKey } from '../src/lib/package-return-columns'

const args = process.argv.slice(2)
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : null)
const str = (v: unknown) => (v == null ? null : String(v))

/** Rebuilds dump-shaped rows from the Postgres copies so the legacy formula runs on what was migrated. */
async function loadFromPg(db: pg.Client): Promise<LegacyData> {
  const packages = (await db.query(`SELECT * FROM packages ORDER BY id`)).rows.map((p): Row => ({
    id: str(p.id), emp: p.emp, supplier_id: p.legacyDate, supplier_name: p.supplierName, spool: str(p.spool), sack: str(p.sack),
    box: str(p.box), pallet: str(p.pallet), package_status: p.packageStatus, created_at: iso(p.created_at),
  }))
  const packageasts = (await db.query(`SELECT * FROM packageasts ORDER BY id`)).rows.map((p): Row => ({
    id: str(p.id), emp: p.emp, ref_id: str(p.ref_id), supplier_name: p.supplierName, spool: str(p.spool), spool_type: p.spoolType,
    sack: str(p.sack), sack_type: p.sackType, box: str(p.box), box_type: p.boxType, pallet: str(p.pallet), pallet_type: p.palletType,
    partition: str(p.partition), partition_type: p.partitionType, package_status: p.packageStatus, created_at: iso(p.created_at),
  }))
  const htrpackages = (await db.query(`SELECT * FROM htrpackages ORDER BY id`)).rows.map((h): Row => ({
    id: str(h.id), emp: h.emp, supplier_name: h.supplierName, spool: str(h.spool), sack: str(h.sack), box: str(h.box), pallet: str(h.pallet),
    partition: str(h.partition), spool_paper: str(h.spoolPaper), spool_plastic: str(h.spoolPlastic), spoolC_paper: str(h.spoolCPaper),
    spoolC_plastic: str(h.spoolCPlastic), pallet_wood: str(h.palletWood), pallet_steel: str(h.palletSteel), created_at: iso(h.created_at),
    receiptId: str(h.receiptId),
  }))
  return { packages, packageasts, htrpackages }
}

/** Fields compared against the dump (legacy column names; numbers normalised, NULL partition = '0' default kept as-is). */
const DUMP_FIELDS: Record<keyof LegacyData, string[]> = {
  packages: ['emp', 'supplier_id', 'supplier_name', 'spool', 'sack', 'box', 'pallet', 'package_status', 'created_at'],
  packageasts: ['emp', 'ref_id', 'supplier_name', 'spool', 'spool_type', 'sack', 'sack_type', 'box', 'box_type', 'pallet', 'pallet_type', 'partition', 'partition_type', 'package_status', 'created_at'],
  htrpackages: ['emp', 'supplier_name', 'spool', 'sack', 'box', 'pallet', 'partition', 'spool_paper', 'spool_plastic', 'spoolC_paper', 'spoolC_plastic', 'pallet_wood', 'pallet_steel', 'created_at'],
}

function compareWithDump(pgData: LegacyData, dump: LegacyData): string[] {
  const problems: string[] = []
  const norm = (v: string | null | undefined) => (v == null ? null : /^\d+$/.test(v) ? String(Number(v)) : v)
  for (const t of Object.keys(DUMP_FIELDS) as (keyof LegacyData)[]) {
    if (pgData[t].length !== dump[t].length) problems.push(`${t}: ${pgData[t].length} rows in Postgres vs ${dump[t].length} in dump`)
    const byId = new Map(pgData[t].map((r) => [r.id, r]))
    for (const d of dump[t]) {
      const p = byId.get(String(Number(d.id)))
      if (!p) { problems.push(`${t}#${d.id} missing`); continue }
      for (const f of DUMP_FIELDS[t]) {
        // packages.created_at falls back to added_on when NULL in the dump
        const want = f === 'created_at' && d[f] == null && t === 'packages' ? d.added_on : d[f]
        if (norm(p[f]) !== norm(want)) problems.push(`${t}#${d.id}.${f}: pg=${p[f]} dump=${want}`)
      }
    }
  }
  return problems
}

const BUCKETS: Record<string, string> = {
  spoolPaper: 'หลอด', spoolPlastic: 'หลอด', spoolCPaper: 'หลอด', spoolCPlastic: 'หลอด', spoolUnspecified: 'หลอด',
  palletWood: 'พาเลท', palletSteel: 'พาเลท', palletUnspecified: 'พาเลท',
  sackPlastic: 'กระสอบ', sackJute: 'กระสอบ', sackUnspecified: 'กระสอบ', box: 'box', paperBar: 'paperBar',
}

async function main() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    const data = await loadFromPg(db)
    if (!data.packages.length) throw new Error('packages is empty — nothing migrated in this database')

    let dumpProblems: string[] = []
    const dumpPath = arg('dump')
    if (dumpPath) {
      dumpProblems = compareWithDump(data, loadDump(dumpPath))
      console.log(`copy vs dump: ${dumpProblems.length ? `${dumpProblems.length} differences` : 'identical'}`)
      for (const p of dumpProblems.slice(0, 20)) console.log('  ' + p)
    }

    // over-returns = htr quantity per bucket − entries allocated by its receipt in that bucket
    const entries = (await db.query(`
      SELECT e."receiptId", o.category::text, o.variant, e.qty, s.name supplier
        FROM package_return_entries e JOIN package_return_obligations o ON o.id = e."obligationId"
        JOIN suppliers s ON s.id = o."supplierId"
       WHERE e."deletedAt" IS NULL AND e."receiptId" IN (SELECT "receiptId" FROM htrpackages WHERE "receiptId" IS NOT NULL)`)).rows
    const receiptSupplier = new Map((await db.query(`SELECT r.id, s.name FROM package_return_receipts r JOIN suppliers s ON s.id = r."supplierId"`)).rows.map((r) => [String(r.id), r.name]))
    const overReturns: { supplier: string; htrId: number; field: string; bucket: string; qty: number }[] = []
    for (const h of data.htrpackages) {
      if (!h.receiptId) continue
      const v = (k: string) => Number(h[k] ?? 0)
      const want: Record<string, number> = {
        หลอด: v('spool') + v('spool_paper') + v('spool_plastic') + v('spoolC_paper') + v('spoolC_plastic'),
        พาเลท: v('pallet') + v('pallet_wood') + v('pallet_steel'), กระสอบ: v('sack'), box: v('box'), paperBar: v('partition'),
      }
      const got: Record<string, number> = {}
      for (const e of entries.filter((x) => String(x.receiptId) === h.receiptId)) {
        const b = BUCKETS[columnOf(e.category, e.variant) as ColumnKey]
        got[b] = (got[b] ?? 0) + e.qty
      }
      for (const [b, q] of Object.entries(want)) {
        const over = q - (got[b] ?? 0)
        if (over > 0) overReturns.push({ supplier: receiptSupplier.get(h.receiptId)!, htrId: Number(h.id), field: b, bucket: b, qty: over })
      }
    }

    const supplierMap = arg('supplier-map') ? JSON.parse(fs.readFileSync(arg('supplier-map')!, 'utf8')) : {}
    const result = await verify(db, data, await loadSuppliers(db), supplierMap, overReturns)

    for (const c of result.companies) {
      console.log(`${c.verdict.padEnd(16)} ${c.company}`)
      for (const x of c.checks.filter((x) => !x.ok)) {
        console.log(`    ${x.row} / ${x.what}: legacy ${x.legacy} new ${x.system} — ${x.explained ?? 'NOT EXPLAINED'}`)
      }
    }
    console.log(`unmatched legacy names: ${result.unmatched.map((u) => u.name).join(', ') || 'none'}`)
    console.log(`over-returns clamped: ${JSON.stringify(overReturns)}`)
    for (const s of result.samples) console.log(`sample "${s.name}" (legacy screen ${s.captured}): ${s.ok ? 'OK' : 'MISMATCH ' + s.diffs.join('; ')}`)
    const overImport = result.dueOverImport.filter((x) => !x.allowed)
    console.log(`ต้องส่งคืน/คงค้าง > นำเข้า: ${result.dueOverImport.length ? '' : 'none'}`)
    for (const x of result.dueOverImport) console.log(`    ${x.company} ${x.label}: นำเข้า ${x.imported} ต้องส่งคืน ${x.due} คงค้าง ${x.outstanding} — ${x.allowed ?? 'FAIL'}`)

    const fail = result.companies.filter((c) => c.verdict === 'FAIL').length
    const badSamples = result.samples.filter((s) => !s.ok).length
    const failed = fail || dumpProblems.length || overImport.length || badSamples
    console.log(failed ? `\nFAILED: ${fail} companies, ${overImport.length} cells over นำเข้า, ${badSamples} samples, ${dumpProblems.length} copy differences` : '\nALL PASS')
    if (failed) process.exitCode = 1
  } finally {
    await db.end()
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
