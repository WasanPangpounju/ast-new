/**
 * migrate-legacy-packages.ts
 *
 * Moves the legacy Laravel packaging data (MySQL packages / packageasts / htrpackages, cut over
 * 2026-08-02) into Postgres and builds the carried-forward balance for the ใบคืน page:
 *   1. copies the 3 tables as-is (original ids) into packages / packageasts / htrpackages
 *   2. carried-forward obligations under "ต้องส่งคืนต้องไม่เกินนำเข้า" (customer, 2026-10-09),
 *      see planCarryForward in legacy-packages/lib.ts:
 *        ก) only legacy due quantities that link to a material that still exists
 *           (packageasts by ref_id, packages-only rows by importStatus + time, any name)
 *        ข) owned by that material's current company
 *        ค) per material and group capped at the material's own นำเข้า (all its sources together)
 *        ง) subtypes carved out of the material's นำเข้า split (carveDue, shared with the summary)
 *      one obligation per material and column: legacyRef = "material:<id>/<column>",
 *      createdAt = the oldest legacy row behind it, note lists those rows
 *   3. one PackageReturnReceipt per htrpackages row, allocated oldest-obligation-first:
 *        typed field → its column, overflow → that group's ไม่ระบุชนิด
 *        untyped field → ไม่ระบุชนิด first, then the typed columns in page order
 *          (sack: ไม่ระบุชนิด > พลาสติก > ปอ)
 *        anything still left = over-return → not allocated (outstanding clamps at 0), reported
 *   4. verifies the result against the legacy page formula (legacy-packages/lib.ts) and the
 *      rule ต้องส่งคืน ≤ นำเข้า on every column, and writes a report
 *
 * Writes ONLY: packages, packageasts, htrpackages, package_return_obligations,
 *              package_return_receipts, package_return_entries
 * Reads only:  materials, suppliers
 *
 * One transaction. Default is a dry run (everything is written, verified, then ROLLBACK).
 *
 *   npx tsx scripts/migrate-legacy-packages.ts --dump=<ast-packages.sql> [--supplier-map=<map.json>] [--report=<dir>]
 *   npx tsx scripts/migrate-legacy-packages.ts --dump=... --apply        # COMMIT (refuses if blocked/failed)
 *   npx tsx scripts/migrate-legacy-packages.ts --rollback [--apply]      # remove everything this script wrote
 *
 * --supplier-map: JSON {"<legacy supplier_name>": <suppliers.id>} for names with no exact match.
 * Re-running after a commit aborts (target tables not empty) — use --rollback first.
 * DATABASE_URL selects the database.
 */

import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { COLUMN_GROUPS, columnOf, emptyTotals, importedTotals, SUMMARY_COLUMNS, type ColumnKey, type ColumnTotals } from '../src/lib/package-return-columns'
import { bangkokMidnight } from '../src/lib/bangkokDate'
import {
  CUTOVER, GROUPS, LEGACY_COLUMNS, addLegacy, emptyLegacyRows, int, legacyAsNew, legacySummary, loadDump,
  loadLegacyMaterials, loadPlanMaterials, loadSuppliers, newSummary, planCarryForward, resolveSupplier, sumOf, utc,
  type CarryPlan, type LegacyData, type LegacyKey, type LegacyRows, type NewRows, type Row, type SupplierRow,
} from './legacy-packages/lib'

const args = process.argv.slice(2)
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const APPLY = args.includes('--apply')
const ROLLBACK = args.includes('--rollback')
const DUMP = arg('dump')
const MAP_FILE = arg('supplier-map')
const REPORT_DIR = arg('report') ?? `legacy-package-report-${new Date().toISOString().replace(/[:.]/g, '-')}`

const WRITTEN_TABLES = ['packages', 'packageasts', 'htrpackages', 'package_return_obligations', 'package_return_receipts', 'package_return_entries']

interface Obl {
  key: string // = legacyRef
  legacyRef: string
  category: string
  variant: string | null
  qtyDue: number
  qtyReturned: number
  supplierId: number
  supplierName: string
  materialId: number
  createdAt: Date
  col: ColumnKey
  note: string
}

interface Alloc { oblKey: string; qty: number }

/** bucket = the column group the over-return is checked against: หลอด | พาเลท | กระสอบ | box | paperBar */
interface OverReturn { supplier: string; htrId: number; field: string; bucket: string; qty: number }

// ─── rollback ────────────────────────────────────────────────────────────────

async function rollback(db: pg.Client) {
  await db.query('BEGIN')
  await db.query(`LOCK TABLE ${WRITTEN_TABLES.join(', ')} IN SHARE ROW EXCLUSIVE MODE`)

  // Entries recorded in the new system against carried-forward obligations would be orphaned —
  // refuse instead of deleting user data.
  const foreign = await db.query(`
    SELECT e.id, e."receiptId", e."obligationId" FROM package_return_entries e
      JOIN package_return_obligations o ON o.id = e."obligationId"
     WHERE o."legacyRef" IS NOT NULL
       AND (e."receiptId" IS NULL OR e."receiptId" NOT IN (SELECT "receiptId" FROM htrpackages WHERE "receiptId" IS NOT NULL))`)
  if (foreign.rowCount) {
    await db.query('ROLLBACK')
    throw new Error(`rollback refused: ${foreign.rowCount} entries recorded in the new system point at carried-forward obligations (e.g. entry #${foreign.rows[0].id}). Cancel those ใบคืน first.`)
  }

  const receiptIds = (await db.query(`SELECT "receiptId" FROM htrpackages WHERE "receiptId" IS NOT NULL`)).rows.map((r) => r.receiptId)
  const counts: Record<string, number> = {}
  await db.query(`UPDATE htrpackages SET "receiptId" = NULL`)
  counts.package_return_entries = (await db.query(`DELETE FROM package_return_entries WHERE "receiptId" = ANY($1::int[])`, [receiptIds])).rowCount ?? 0
  counts.package_return_receipts = (await db.query(`DELETE FROM package_return_receipts WHERE id = ANY($1::int[])`, [receiptIds])).rowCount ?? 0
  counts.package_return_obligations = (await db.query(`DELETE FROM package_return_obligations WHERE "legacyRef" IS NOT NULL`)).rowCount ?? 0
  counts.htrpackages = (await db.query(`DELETE FROM htrpackages`)).rowCount ?? 0
  counts.packageasts = (await db.query(`DELETE FROM packageasts`)).rowCount ?? 0
  counts.packages = (await db.query(`DELETE FROM packages`)).rowCount ?? 0
  console.log('rows deleted:', counts)

  if (APPLY) { await db.query('COMMIT'); console.log('ROLLBACK APPLIED (committed)') }
  else { await db.query('ROLLBACK'); console.log('dry run — nothing changed (add --apply to commit the rollback)') }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function bulkInsert(db: pg.Client, table: string, cols: string[], rows: unknown[][], returning = '') {
  const out: Record<string, unknown>[] = []
  const per = Math.floor(30000 / cols.length)
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    const params: unknown[] = []
    const values = chunk.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}` }).join(',')})`)
    const res = await db.query(
      `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES ${values.join(',')} ${returning ? `RETURNING ${returning}` : ''}`,
      params
    )
    out.push(...res.rows)
  }
  return out
}

/** htrpackages.createDate is varchar "MM/DD/YYYY" (the real return date; created_at is when it was keyed in). */
function htrDate(h: Row): Date {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(h.createDate ?? '')
  if (m) return bangkokMidnight(`${m[3]}-${m[1]}-${m[2]}`)
  const c = utc(h.created_at)
  if (!c) throw new Error(`htrpackages#${h.id}: no usable date`)
  return c
}

const bucketOf = (col: ColumnKey) => Object.entries(GROUPS).find(([, keys]) => keys.includes(col))?.[0] ?? col
const STATUS = (ret: number, due: number) => (ret <= 0 ? 'PENDING' : ret >= due ? 'RETURNED' : 'PARTIALLY_RETURNED')
const LABEL = Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c.key, `${c.group}${c.label ? ' ' + c.label : ''}`])) as Record<ColumnKey, string>
/** COLUMN_GROUPS name → verify bucket name (กล่อง/กระดาษกั้น are checked per column as box/paperBar). */
const BUCKET_OF_GROUP: Record<string, string> = { หลอด: 'หลอด', พาเลท: 'พาเลท', กระสอบ: 'กระสอบ', กล่อง: 'box', กระดาษกั้น: 'paperBar' }
const fmtDue = (d: ColumnTotals) => SUMMARY_COLUMNS.filter((c) => d[c.key]).map((c) => `${LABEL[c.key]} ${d[c.key]}`).join(', ')

// ─── migrate ─────────────────────────────────────────────────────────────────

async function migrate(db: pg.Client) {
  if (!DUMP) throw new Error('--dump=<path to mysqldump of packages packageasts htrpackages> is required')
  const data = loadDump(DUMP)
  const supplierMap: Record<string, number> = MAP_FILE ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) : {}

  await db.query('BEGIN')
  await db.query(`LOCK TABLE ${WRITTEN_TABLES.join(', ')} IN SHARE ROW EXCLUSIVE MODE`)

  // ── preflight ──
  const pre = (await db.query(`SELECT
      (SELECT count(*) FROM packages)::int packages, (SELECT count(*) FROM packageasts)::int packageasts,
      (SELECT count(*) FROM htrpackages)::int htrpackages,
      (SELECT count(*) FROM package_return_obligations WHERE "legacyRef" IS NOT NULL)::int legacy_obligations,
      (SELECT count(*) FROM package_return_obligations)::int obligations,
      (SELECT count(*) FROM package_return_entries)::int entries,
      (SELECT count(*) FROM package_return_receipts)::int receipts,
      (SELECT count(*) FROM materials)::int materials`)).rows[0]
  if (pre.packages || pre.packageasts || pre.htrpackages || pre.legacy_obligations) {
    await db.query('ROLLBACK')
    throw new Error(`already migrated (or target not empty): ${JSON.stringify(pre)} — run with --rollback first`)
  }

  const suppliers = await loadSuppliers(db)
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  for (const [name, id] of Object.entries(supplierMap)) {
    if (!supplierById.has(id)) throw new Error(`--supplier-map: "${name}" → ${id} is not a live supplier`)
  }
  const plan = planCarryForward(data, await loadPlanMaterials(db), suppliers, supplierMap)

  // ── 1. copy the 3 tables ──
  const supplierOf = (name: string | null) => resolveSupplier(name ?? '', suppliers, supplierMap)
  await bulkInsert(db, 'packages',
    ['id', 'supplierId', 'supplierName', 'emp', 'spool', 'sack', 'box', 'pallet', 'packageStatus', 'legacyDate', 'materialId', 'created_at', 'updated_at'],
    data.packages.map((p) => [int(p.id, 'id'), supplierOf(p.supplier_name), p.supplier_name, p.emp, int(p.spool, 'spool'), int(p.sack, 'sack'), int(p.box, 'box'), int(p.pallet, 'pallet'),
      p.package_status, p.supplier_id, plan.packageMaterial.get(p.id!) ?? null, utc(p.created_at) ?? utc(p.added_on), utc(p.updated_at) ?? utc(p.created_at) ?? utc(p.added_on)]))
  await bulkInsert(db, 'packageasts',
    ['id', 'emp', 'ref_id', 'supplierName', 'spool', 'spoolType', 'sack', 'sackType', 'box', 'boxType', 'pallet', 'palletType', 'partition', 'partitionType', 'packageStatus', 'created_at', 'updated_at'],
    data.packageasts.map((p) => [int(p.id, 'id'), p.emp, int(p.ref_id, 'ref_id'), p.supplier_name,
      p.spool == null ? null : int(p.spool, 'spool'), p.spool_type, p.sack == null ? null : int(p.sack, 'sack'), p.sack_type,
      p.box == null ? null : int(p.box, 'box'), p.box_type, p.pallet == null ? null : int(p.pallet, 'pallet'), p.pallet_type,
      p.partition == null ? null : int(p.partition, 'partition'), p.partition_type, p.package_status, utc(p.created_at), utc(p.updated_at) ?? utc(p.created_at)]))
  await bulkInsert(db, 'htrpackages',
    ['id', 'supplierName', 'emp', 'spool', 'sack', 'box', 'pallet', 'partition', 'spoolPaper', 'spoolPlastic', 'spoolCPaper', 'spoolCPlastic', 'palletWood', 'palletSteel', 'createDate', 'created_at', 'updated_at'],
    data.htrpackages.map((h) => [int(h.id, 'id'), h.supplier_name, h.emp, int(h.spool, 'spool'), int(h.sack, 'sack'), int(h.box, 'box'), int(h.pallet, 'pallet'),
      h.partition == null ? null : int(h.partition, 'partition'), int(h.spool_paper, 'x'), int(h.spool_plastic, 'x'), int(h.spoolC_paper, 'x'), int(h.spoolC_plastic, 'x'),
      int(h.pallet_wood, 'x'), int(h.pallet_steel, 'x'), htrDate(h), utc(h.created_at), utc(h.updated_at) ?? utc(h.created_at)]))
  for (const t of ['packages', 'packageasts', 'htrpackages']) {
    await db.query(`SELECT setval(pg_get_serial_sequence('${t}','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ${t}), 1))`)
  }

  // ── 2. carried-forward obligations (planCarryForward) ──
  const obligations: Obl[] = plan.obligations.map((o) => ({
    key: o.legacyRef, legacyRef: o.legacyRef, category: o.category, variant: o.variant, qtyDue: o.qtyDue, qtyReturned: 0,
    supplierId: o.supplierId, supplierName: o.company, materialId: o.materialId, createdAt: o.createdAt, col: o.col,
    note: `ยอดยกมาจากระบบเดิม (${o.sources.join(', ')})`,
  }))
  // FIFO order = the receipts POST order (createdAt, then id ≈ insertion order)
  obligations.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.key.localeCompare(b.key))

  // ── 3. receipts from htrpackages ──
  const unmatchedHtr = new Map<string, number>()
  const htrSorted = [...data.htrpackages].sort((a, b) => htrDate(a).getTime() - htrDate(b).getTime() || int(a.id, 'id') - int(b.id, 'id'))
  const overReturns: OverReturn[] = []
  const untypedSpill: { supplier: string; htrId: number; field: string; col: ColumnKey; qty: number }[] = []
  const receipts: { htr: Row; supplierId: number | null; supplierName: string; allocs: Alloc[]; fields: Record<string, number>; note: string }[] = []

  for (const h of htrSorted) {
    const supplierId = supplierOf(h.supplier_name)
    const groupName = supplierId != null ? supplierById.get(supplierId)!.name : h.supplier_name!
    if (supplierId == null) unmatchedHtr.set(h.supplier_name!, (unmatchedHtr.get(h.supplier_name!) ?? 0) + 1)
    const pool = supplierId == null ? [] : obligations.filter((o) => o.supplierName === groupName)
    const allocs: Alloc[] = []
    const take = (col: ColumnKey, amount: number) => {
      for (const o of pool) {
        if (amount <= 0) break
        if (o.col !== col) continue
        const n = Math.min(amount, o.qtyDue - o.qtyReturned)
        if (n <= 0) continue
        o.qtyReturned += n
        allocs.push({ oblKey: o.key, qty: n })
        amount -= n
      }
      return amount
    }
    const hid = int(h.id, 'id')
    const v = (k: string) => int(h[k], `htrpackages#${hid}.${k}`)

    // typed fields first so untyped quantities don't eat a typed column's balance
    const typed: [string, ColumnKey, ColumnKey | null][] = [
      ['pallet_wood', 'palletWood', 'palletUnspecified'], ['pallet_steel', 'palletSteel', 'palletUnspecified'],
      ['box', 'box', null], ['partition', 'paperBar', null],
      ['spool_paper', 'spoolPaper', 'spoolUnspecified'], ['spool_plastic', 'spoolPlastic', 'spoolUnspecified'],
      ['spoolC_paper', 'spoolCPaper', 'spoolUnspecified'], ['spoolC_plastic', 'spoolCPlastic', 'spoolUnspecified'],
    ]
    for (const [field, col, fallback] of typed) {
      let left = take(col, v(field))
      if (left > 0 && fallback) left = take(fallback, left)
      if (left > 0) overReturns.push({ supplier: groupName, htrId: hid, field: LABEL[col], bucket: bucketOf(col), qty: left })
    }
    const untyped: [string, string, ColumnKey[]][] = [
      ['spool', 'หลอด (ระบบเดิมไม่ระบุชนิด)', ['spoolUnspecified', 'spoolPaper', 'spoolPlastic', 'spoolCPaper', 'spoolCPlastic']],
      ['pallet', 'พาเลท (ระบบเดิมไม่ระบุชนิด)', ['palletUnspecified', 'palletWood', 'palletSteel']],
      ['sack', 'กระสอบ (ระบบเดิมไม่ระบุชนิด)', ['sackUnspecified', 'sackPlastic', 'sackJute']],
    ]
    const untypedNotes: string[] = []
    for (const [field, label, order] of untyped) {
      const q = v(field)
      if (q <= 0) continue
      let left = q
      const parts: string[] = []
      for (const col of order) {
        const before = left
        left = take(col, left)
        if (before - left > 0) {
          parts.push(`${LABEL[col]} ${before - left}`)
          if (!col.endsWith('Unspecified')) untypedSpill.push({ supplier: groupName, htrId: hid, field: label, col, qty: before - left })
        }
      }
      if (left > 0) { overReturns.push({ supplier: groupName, htrId: hid, field: label, bucket: bucketOf(order[0]), qty: left }); parts.push(`คืนเกินยอดคงค้าง ${left}`) }
      untypedNotes.push(`${label} ${q} → ${parts.join(', ')}`)
    }

    // Receipt columns: legacy typed fields as recorded; an untyped quantity that landed on a typed
    // column is added to that column so the receipt row reads the same as its entries.
    const fields = {
      palletWood: v('pallet_wood'), palletSteel: v('pallet_steel'), box: v('box'), paperBar: v('partition'),
      spoolPaper: v('spool_paper'), spoolPlastic: v('spool_plastic'), spoolCPaper: v('spoolC_paper'), spoolCPlastic: v('spoolC_plastic'),
      sackPlastic: 0, sackJute: 0,
    } as Record<string, number>
    for (const s of untypedSpill.filter((s) => s.htrId === hid)) fields[s.col] += s.qty

    const over = overReturns.filter((o) => o.htrId === hid && !o.field.includes('ระบบเดิมไม่ระบุชนิด'))
    const note = [
      `ย้ายจากระบบเดิม (htrpackages #${hid}, บันทึก ${h.created_at} UTC)`,
      ...untypedNotes,
      ...over.map((o) => `${o.field} คืนเกินยอดคงค้าง ${o.qty} (ไม่นำไปตัดยอด)`),
    ].join(' · ')
    receipts.push({ htr: h, supplierId, supplierName: groupName, allocs, fields, note })
  }

  // ── insert obligations / receipts / entries ──
  const inserted = await bulkInsert(db, 'package_return_obligations',
    ['supplierId', 'needsSupplierAssignment', 'category', 'variant', 'sourceType', 'materialId', 'qtyDue', 'qtyReturned', 'status', 'note', 'legacyRef', 'createdAt', 'updatedAt'],
    obligations.map((o) => [o.supplierId, false, o.category, o.variant, 'MATERIAL_IMPORT', o.materialId, o.qtyDue, o.qtyReturned,
      STATUS(o.qtyReturned, o.qtyDue), o.note, o.legacyRef, o.createdAt, new Date()]),
    `id, "legacyRef"`)
  const oblId = new Map(inserted.map((r) => [r.legacyRef as string, r.id as number]))

  let receiptCount = 0
  let entryCount = 0
  for (const r of receipts) {
    if (r.supplierId == null) continue // blocked: package_return_receipts.supplierId is required
    const created = utc(r.htr.created_at)
    const returnDate = htrDate(r.htr)
    const res = await db.query(
      `INSERT INTO package_return_receipts ("supplierId","returnDate",emp,note,"palletWood","palletSteel",box,"sackPlastic","sackJute","paperBar",
         "spoolPaper","spoolPlastic","spoolCPaper","spoolCPlastic","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING id`,
      [r.supplierId, returnDate, r.htr.emp, r.note, r.fields.palletWood, r.fields.palletSteel, r.fields.box, r.fields.sackPlastic, r.fields.sackJute,
        r.fields.paperBar, r.fields.spoolPaper, r.fields.spoolPlastic, r.fields.spoolCPaper, r.fields.spoolCPlastic, created])
    const receiptId = res.rows[0].id as number
    receiptCount++
    await db.query(`UPDATE htrpackages SET "receiptId" = $1 WHERE id = $2`, [receiptId, int(r.htr.id, 'id')])
    // merge allocations per obligation (one entry per obligation per receipt, like the POST route)
    const perObl = new Map<string, number>()
    for (const a of r.allocs) perObl.set(a.oblKey, (perObl.get(a.oblKey) ?? 0) + a.qty)
    if (perObl.size) {
      await bulkInsert(db, 'package_return_entries',
        ['obligationId', 'receiptId', 'qty', 'returnedAt', 'emp', 'note', 'createdAt', 'updatedAt'],
        [...perObl].map(([k, q]) => [oblId.get(k), receiptId, q, returnDate, r.htr.emp, `ใบคืน #${receiptId}`, created, created]))
      entryCount += perObl.size
    }
  }

  // ── 4. verify ──
  const counts = (await db.query(`SELECT
      (SELECT count(*) FROM packages)::int packages, (SELECT count(*) FROM packageasts)::int packageasts,
      (SELECT count(*) FROM htrpackages)::int htrpackages,
      (SELECT count(*) FROM package_return_obligations WHERE "legacyRef" IS NOT NULL)::int legacy_obligations,
      (SELECT count(*) FROM package_return_receipts)::int - $1::int new_receipts,
      (SELECT count(*) FROM package_return_entries)::int - $2::int new_entries,
      (SELECT count(*) FROM materials)::int materials`, [pre.receipts, pre.entries])).rows[0]

  const verification = await verify(db, data, suppliers, supplierMap, overReturns)

  const companyOfName = (n: string) => { const id = supplierOf(n); return id == null ? null : supplierById.get(id)!.name }
  const blockedNames = [...unmatchedHtr.entries()]
  const blockedMaterials = plan.dropped.filter((d) => d.reason === 'บริษัทของใบรับเข้าไม่อยู่ในระบบ')
  const failed = verification.companies.filter((c) => c.verdict === 'FAIL')
  const overImport = verification.dueOverImport.filter((x) => !x.allowed)

  const report = {
    mode: APPLY ? 'APPLY' : 'DRY-RUN', database: (process.env.DATABASE_URL ?? '').replace(/:[^:@/]*@/, ':***@'), dump: DUMP,
    writtenTables: WRITTEN_TABLES, readOnlyTables: ['materials', 'suppliers'],
    dumpCounts: { packages: data.packages.length, packageasts: data.packageasts.length, htrpackages: data.htrpackages.length },
    before: pre, after: counts, receiptsCreated: receiptCount, entriesCreated: entryCount,
    pairing: { pairedPackages: plan.pairOf.size, unpairedPackages: plan.unpairedPackages.length, unpairedReturnRows: plan.unpairedReturns.map((r) => r.id) },
    carry: {
      sources: plan.sources.length, obligations: plan.obligations.length,
      // legacy due not carried forward, by reason (ก)
      dropped: plan.dropped.map((d) => ({ reason: d.reason, ref: d.source.ref, legacyName: d.source.legacyName, company: companyOfName(d.source.legacyName), createdAt: d.source.createdAt, due: fmtDue(d.source.due), dueTotals: d.source.due, note: d.note })),
      // capped at the material's นำเข้า (ค)
      cuts: plan.cuts,
      // legacy name's company ≠ the material's current company (ข)
      moved: plan.sources.filter((s) => s.materialId != null && plan.companyOfMaterial.get(s.materialId) != null && companyOfName(s.legacyName) !== plan.companyOfMaterial.get(s.materialId))
        .map((s) => ({ ref: s.ref, legacyName: s.legacyName, from: companyOfName(s.legacyName), to: plan.companyOfMaterial.get(s.materialId!), materialId: s.materialId, due: fmtDue(s.due) })),
      // packages-only rows linked by importStatus + time whose legacy name differs from the material's
      timeLinked: plan.sources.filter((s) => s.link === 'time').length,
    },
    unmatchedHtrNames: blockedNames.map(([name, htr]) => ({ name, htr })),
    overReturns, untypedSpill,
    verification,
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(path.join(REPORT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), renderMarkdown(report))
  console.log(renderConsole(report))
  console.log(`\nreport: ${path.resolve(REPORT_DIR)}`)

  if (!APPLY) { await db.query('ROLLBACK'); console.log('DRY RUN — rolled back, nothing changed') ; return }
  if (blockedNames.length || blockedMaterials.length || failed.length || overImport.length || !verification.samples.every((s) => s.ok)) {
    await db.query('ROLLBACK')
    throw new Error(`not committed: ${blockedNames.length} unmatched ใบคืน names, ${blockedMaterials.length} imports without a company, ${failed.length} companies FAIL, ${overImport.length} cells ต้องส่งคืน > นำเข้า, samples ${verification.samples.map((s) => `${s.name}=${s.ok ? 'OK' : 'MISMATCH'}`).join(' ')}`)
  }
  await db.query('COMMIT')
  console.log('APPLIED — committed')
}

// ─── verification ────────────────────────────────────────────────────────────

interface Check { row: string; what: string; legacy: number; system: number; ok: boolean; explained?: string }
interface CompanyResult {
  company: string; supplierIds: number[]; legacyNames: string[]; verdict: 'PASS' | 'PASS (อธิบายได้)' | 'FAIL'
  checks: Check[]; legacy: LegacyRows; legacyBuggy: LegacyRows; system: NewRows; spoolCPlasticBug: boolean
}
interface OverImportCell { company: string; col: ColumnKey; label: string; imported: number; due: number; outstanding: number; allowed: string | null }

/** Cells allowed to show ต้องส่งคืน/คงค้าง > นำเข้า, with the reason ("company|column" → reason). None today. */
const ALLOWED_OVER_IMPORT: Record<string, string> = {}

/** A summary column, or a group total ('หลอด' | 'พาเลท' | 'กระสอบ'). */
type SampleKey = ColumnKey | 'หลอด' | 'พาเลท' | 'กระสอบ'

/** Formula samples, one per legacy screenshot:
 *  - `screen`: the legacy page read off the screenshot (PackageController::create as users saw it,
 *    including the กระบอกพลาสติก bug); legacy keys, sack is one column there; only cells that show a
 *    number. Checked against legacySummary(raw name, bug = true).
 *  - `system`: what the new summary must show for that company's carried-forward part (legacy scope)
 *    after the rule ต้องส่งคืนต้องไม่เกินนำเข้า. */
const SCREEN_SAMPLES: {
  name: string; captured: string
  screen: Partial<Record<keyof LegacyRows, Partial<Record<LegacyKey, number>>>>
  system?: Partial<Record<keyof NewRows, Partial<Record<SampleKey, number>>>>
}[] = [
  {
    name: 'จีน', captured: '2026-10-07',
    screen: { imported: { spoolPaper: 117760, spoolPlastic: 10080, spoolUnspecified: 37276, sack: 12364, box: 722 } },
  },
  {
    name: 'บริษัท แพรกษาเท็กซ์ไทล์ จำกัด', captured: '2026-10-09',
    screen: {
      imported: { spoolPaper: 255, spoolPlastic: 633330, spoolUnspecified: 56041, sack: 12082, box: 0, palletWood: 70, palletSteel: 1761, palletUnspecified: 177, paperBar: 21507 },
      due: { spoolPaper: 0, spoolPlastic: 633330, spoolUnspecified: 10356, sack: 11569, box: 0, palletWood: 58, palletSteel: 1683, palletUnspecified: 24, paperBar: 21507 },
      returned: { spoolPaper: 0, spoolPlastic: 184620, spoolCPaper: 0, spoolCPlastic: 0, spoolUnspecified: 0, sack: 3651, box: 0, palletWood: 5, palletSteel: 455, palletUnspecified: 0, paperBar: 5226 },
      outstanding: { spoolPaper: 0, spoolPlastic: 448710, spoolCPaper: 0, spoolCPlastic: 0, spoolUnspecified: 10356, sack: 7918, box: 0, palletWood: 53, palletSteel: 1228, palletUnspecified: 24, paperBar: 16281 },
    },
    system: {
      due: { หลอด: 676154, กระสอบ: 11941, พาเลท: 1867, box: 0, paperBar: 21362 },
      returned: { spoolPlastic: 184620, กระสอบ: 3651, palletWood: 5, palletSteel: 455, paperBar: 5226 },
      outstanding: { หลอด: 491534, กระสอบ: 8290, พาเลท: 1407, box: 0, paperBar: 16136 },
    },
  },
  {
    name: 'บริษัท มาดีสปินนิ่ง', captured: '2026-10-09',
    screen: {
      imported: { spoolPlastic: 1400, spoolCPlastic: 91240, spoolUnspecified: 0, sack: 0, box: 0, palletWood: 762, palletUnspecified: -327, paperBar: 4738 },
      due: { spoolPlastic: 1400, spoolCPlastic: 91240, spoolUnspecified: 75, sack: 0, box: 0, palletWood: 745, palletUnspecified: 1, paperBar: 4738 },
      outstanding: { spoolPaper: 0, spoolPlastic: 1400, spoolCPaper: 0, spoolCPlastic: 91240, spoolUnspecified: 75, sack: 0, box: 0, palletWood: 745, palletSteel: 0, palletUnspecified: 1, paperBar: 4738 },
    },
    system: {
      due: { หลอด: 92640, spoolUnspecified: 0, palletWood: 418, palletUnspecified: 0, paperBar: 4738 },
      outstanding: { หลอด: 92640, palletWood: 418, palletUnspecified: 0, paperBar: 4738 },
    },
  },
  {
    name: 'บริษัท กังวาลเท็กซ์ไทล์ จำกัด', captured: '2026-10-09',
    screen: {
      imported: { spoolPaper: 75580, spoolPlastic: 244270, spoolCPlastic: 463753, spoolUnspecified: 40409, sack: 68558, box: 130, palletWood: 0, palletUnspecified: 0, paperBar: 0 },
      due: { spoolPaper: 75580, spoolPlastic: 243204, spoolCPlastic: 463753, spoolUnspecified: 42218, sack: 68575, box: 0, palletWood: 0, palletUnspecified: 0, paperBar: 0 },
      returned: { spoolPaper: 23795, spoolPlastic: 134335, spoolCPaper: 0, spoolCPlastic: 274200, spoolUnspecified: 0, sack: 35565, box: 0, palletWood: 0, palletSteel: 0, palletUnspecified: 0, paperBar: 0 },
      outstanding: { spoolPaper: 51785, spoolPlastic: 108869, spoolCPaper: 0, spoolCPlastic: 189553, spoolUnspecified: 42218, sack: 33010, box: 0, palletWood: 0, palletSteel: 0, palletUnspecified: 0, paperBar: 0 },
    },
    system: {
      due: { หลอด: 820729, กระสอบ: 68225 },
      returned: { spoolPaper: 23795, spoolPlastic: 134335, spoolCPlastic: 274200, กระสอบ: 35565 },
      outstanding: { หลอด: 388399, กระสอบ: 32660 },
    },
  },
]

/**
 * Per company: the legacy page (per raw supplier_name, as the old screen showed it) against the new
 * summary (legacy scope), every difference explained by a signed adjustment; plus the rule
 * ต้องส่งคืน ≤ นำเข้า on the full summary (legacy + new system), every column.
 */
export async function verify(
  db: pg.ClientBase, data: LegacyData, suppliers: SupplierRow[], supplierMap: Record<string, number>, overReturns: OverReturn[]
) {
  const materials = await loadLegacyMaterials(db)
  const plan: CarryPlan = planCarryForward(data, await loadPlanMaterials(db), suppliers, supplierMap)

  const names = new Set<string>([
    ...data.packages.map((p) => p.supplier_name!), ...data.packageasts.map((p) => p.supplier_name!),
    ...data.htrpackages.map((p) => p.supplier_name!), ...materials.map((m) => m.supplierName),
  ])
  // legacy base = the names the old screen showed under this company's own name (no map);
  // names reachable only through the supplier map were separate legacy entries
  const companyOf = (name: string) => { const id = resolveSupplier(name, suppliers, supplierMap); return id == null ? null : suppliers.find((s) => s.id === id)!.name }
  const baseCompanyOf = (name: string) => { const id = resolveSupplier(name, suppliers, {}); return id == null ? null : suppliers.find((s) => s.id === id)!.name }
  const byCompany = new Map<string, string[]>()
  const unmatched: { name: string; legacy: LegacyRows }[] = []
  for (const n of names) {
    const c = baseCompanyOf(n)
    if (c != null) byCompany.set(c, [...(byCompany.get(c) ?? []), n])
    else if (companyOf(n) == null) unmatched.push({ name: n, legacy: legacySummary(data, materials, n, false) })
  }
  for (const o of plan.obligations) if (!byCompany.has(o.company)) byCompany.set(o.company, [])

  // packageImport rows the legacy page counts under a company although the material is gone
  // (deleted in legacy) or now belongs to another company (supplierName edited after import).
  // The new import row follows the material, so its กระดาษกั้น differs by exactly these.
  const matSupplier = new Map(materials.map((m) => [m.id, m.supplierName]))
  const imports = data.packageasts.filter((p) => p.package_status === 'packageImport')
  const paperBarShift = (company: string, legacyNames: string[]) => {
    let orphan = 0, movedOut = 0, movedIn = 0
    for (const p of imports) {
      const q = int(p.partition, 'partition')
      if (!q) continue
      const ms = matSupplier.get(int(p.ref_id, 'ref_id'))
      const mine = legacyNames.includes(p.supplier_name!)
      if (mine && ms === undefined) orphan += q
      else if (ms === undefined) continue
      else if (mine && companyOf(ms) !== company) movedOut += q
      else if (!mine && companyOf(ms) === company) movedIn += q
    }
    return { orphan, movedOut, movedIn }
  }

  const BUCKET_COLS: Record<string, ColumnKey[]> = Object.fromEntries(COLUMN_GROUPS.map((g) => [BUCKET_OF_GROUP[g.group], g.cols]))
  const dueIn = (d: ColumnTotals, bucket: string) => BUCKET_COLS[bucket].reduce((s, c) => s + d[c], 0)
  const droppedRefs = new Set(plan.dropped.map((d) => d.source.ref))
  const htrBucket = (h: Row, bucket: string) => {
    const v = (k: string) => int(h[k], k)
    return ({
      หลอด: v('spool') + v('spool_paper') + v('spool_plastic') + v('spoolC_paper') + v('spoolC_plastic'),
      พาเลท: v('pallet') + v('pallet_wood') + v('pallet_steel'), กระสอบ: v('sack'), box: v('box'), paperBar: v('partition'),
    } as Record<string, number>)[bucket]
  }

  const companies: CompanyResult[] = []
  for (const [company, legacyNames] of [...byCompany].sort((a, b) => a[0].localeCompare(b[0], 'th'))) {
    const ids = suppliers.filter((s) => s.name === company).map((s) => s.id)
    let legacy = emptyLegacyRows()
    let legacyBuggy = emptyLegacyRows()
    for (const n of legacyNames) {
      legacy = addLegacy(legacy, legacySummary(data, materials, n, false))
      legacyBuggy = addLegacy(legacyBuggy, legacySummary(data, materials, n, true))
    }
    const system = await newSummary(db, company, ids)
    const shift = paperBarShift(company, legacyNames)
    const mine = (name: string) => legacyNames.includes(name)

    // ต้องส่งคืน: each legacy row is either carried to its material's company, dropped (ก) or cut (ค)
    const moves = (cols: ColumnKey[]) => {
      let dropped = 0, out = 0, inn = 0, carriedHere = 0
      for (const s of plan.sources) {
        const q = cols.reduce((t, c) => t + s.due[c], 0)
        if (!q) continue
        const to = s.materialId == null ? null : plan.companyOfMaterial.get(s.materialId)
        if (droppedRefs.has(s.ref)) { if (mine(s.legacyName)) dropped += q; continue }
        if (to === company) carriedHere += q
        if (mine(s.legacyName) && to !== company) out += q
        else if (!mine(s.legacyName) && to === company) inn += q
      }
      return { dropped, out, inn, carriedHere }
    }
    const dueAdjustments = (bucket: string): [string, number][] => {
      const m = moves(BUCKET_COLS[bucket])
      const cuts = plan.cuts.filter((c) => c.company === company && BUCKET_OF_GROUP[c.group] === bucket)
      return [
        ['ไม่มีใบรับเข้า (ไม่ยกมา)', -m.dropped],
        ['ย้ายบริษัทตามใบรับเข้า (ออก)', -m.out],
        ['ย้ายบริษัทตามใบรับเข้า (เข้า)', m.inn],
        ['แถวซ้ำ', -cuts.reduce((t, c) => t + c.duplicate, 0)],
        ['เกินจำนวนใน material', -cuts.reduce((t, c) => t + c.edited, 0)],
      ]
    }
    // one column: same moves, plus the column-level effect of capping + classifying by the นำเข้า split
    const columnDueAdjustments = (col: ColumnKey): [string, number][] => {
      const m = moves([col])
      const carried = plan.obligations.filter((o) => o.company === company && o.col === col).reduce((t, o) => t + o.qtyDue, 0)
      return [
        ['บั๊กกระบอกพลาสติกของหน้าเดิม (ต้องส่งคืนนับจากแถวนำเข้า)', legacy.due[col as LegacyKey] - legacyBuggy.due[col as LegacyKey]],
        ['ไม่มีใบรับเข้า (ไม่ยกมา)', -m.dropped],
        ['ย้ายบริษัทตามใบรับเข้า (ออก)', -m.out],
        ['ย้ายบริษัทตามใบรับเข้า (เข้า)', m.inn],
        ['จำกัดจำนวนและจัดชนิดตามฝั่งนำเข้า', carried - m.carriedHere],
      ]
    }
    // คืนแล้ว: legacy screen = ใบคืน under this name; new = ใบคืน of every name resolving here − over-returns
    const returnedAdjustments = (bucket: string): [string, number][] => {
      const otherNames = data.htrpackages.filter((h) => !mine(h.supplier_name!) && companyOf(h.supplier_name!) === company)
      return [
        ['ใบคืนของชื่อเดิมที่รวมเข้าบริษัทนี้', otherNames.reduce((t, h) => t + htrBucket(h, bucket), 0)],
        ['คืนเกินยอดคงค้าง (จำกัดที่ 0)', -overReturns.filter((o) => o.supplier === company && o.bucket === bucket).reduce((s, o) => s + o.qty, 0)],
      ]
    }
    const adjustments = (row: keyof LegacyRows, bucket: string): [string, number][] => {
      const a: [string, number][] = []
      if (row === 'imported' && bucket === 'paperBar') {
        a.push(['ใบรับเข้าที่ถูกลบในระบบเดิม', -shift.orphan], ['ใบรับเข้าที่ภายหลังเปลี่ยนเป็นบริษัทอื่น', -shift.movedOut],
          ['ใบรับเข้าที่ภายหลังเปลี่ยนมาเป็นบริษัทนี้', shift.movedIn])
      }
      if (row === 'due') a.push(...dueAdjustments(bucket))
      if (row === 'returned') a.push(...returnedAdjustments(bucket))
      if (row === 'outstanding') a.push(...dueAdjustments(bucket), ...returnedAdjustments(bucket).map(([w, n]): [string, number] => [w, -n]))
      return a.filter(([, n]) => n !== 0)
    }

    const checks: Check[] = []
    const push = (row: string, what: string, l: number, s: number, adj: [string, number][]) => {
      const explained = l !== s && l + adj.reduce((t, [, n]) => t + n, 0) === s
        ? adj.map(([why, n]) => `${why} ${n > 0 ? '+' : '−'}${Math.abs(n)}`).join(', ')
        : undefined
      checks.push({ row, what, legacy: l, system: s, ok: l === s, explained })
    }
    // legacy side = the old screen: legacySummary per raw name WITH the กระบอกพลาสติก bug
    const rows: [string, keyof LegacyRows][] = [['นำเข้า', 'imported'], ['ต้องส่งคืน', 'due'], ['คืนแล้ว', 'returned'], ['คงค้าง', 'outstanding']]
    const buckets: [string, string, ColumnKey[]][] = [
      ['box', LABEL.box, ['box']], ['paperBar', LABEL.paperBar, ['paperBar']],
      ...Object.entries(GROUPS).map(([g, keys]): [string, string, ColumnKey[]] => [g, `รวมกลุ่ม${g}`, keys]),
    ]
    for (const [label, lk] of rows) {
      for (const [bucket, what, keys] of buckets) push(label, what, legacyAsNew(legacyBuggy[lk], keys), sumOf(system[lk], keys), adjustments(lk, bucket))
    }
    // The bug moves quantity between กระบอกพลาสติก and ไม่ระบุชนิด inside หลอด (group totals unchanged),
    // so where it shows, those two columns are checked one by one with the bug as a stated reason.
    const spoolCPlasticBug = legacy.due.spoolCPlastic !== legacyBuggy.due.spoolCPlastic
    if (spoolCPlasticBug) {
      for (const col of ['spoolCPlastic', 'spoolUnspecified'] as const) {
        const adj = columnDueAdjustments(col).filter(([, n]) => n !== 0)
        push('ต้องส่งคืน', LABEL[col], legacyBuggy.due[col], system.due[col], adj)
        // คงค้าง: the same reasons, plus any change of คืนแล้ว in this column
        const retDiff = system.returned[col] - legacy.returned[col]
        push('คงค้าง', LABEL[col], legacyBuggy.outstanding[col], system.outstanding[col],
          [...adj, ['คืนแล้วต่างจากหน้าจอเดิมในช่องนี้', -retDiff] as [string, number]].filter(([, n]) => n !== 0))
      }
    }
    const verdict = checks.every((c) => c.ok) ? 'PASS' : checks.every((c) => c.ok || c.explained) ? 'PASS (อธิบายได้)' : 'FAIL'
    companies.push({ company, supplierIds: ids, legacyNames, verdict, checks, legacy, legacyBuggy, system, spoolCPlasticBug })
  }

  // ต้องส่งคืน ≤ นำเข้า on the full summary (what the page shows: every material, every obligation)
  const dueOverImport: OverImportCell[] = []
  const companyNames = [...new Set(suppliers.map((s) => s.name))]
  for (const company of companyNames) {
    const ids = suppliers.filter((s) => s.name === company).map((s) => s.id)
    const full = await summaryAsPage(db, company, ids)
    for (const c of SUMMARY_COLUMNS) {
      if (full.due[c.key] <= full.imported[c.key] && full.outstanding[c.key] <= full.imported[c.key]) continue
      dueOverImport.push({ company, col: c.key, label: LABEL[c.key], imported: full.imported[c.key], due: full.due[c.key], outstanding: full.outstanding[c.key], allowed: ALLOWED_OVER_IMPORT[`${company}|${c.key}`] ?? null })
    }
  }

  // formula samples: legacy screen vs the legacy formula, and the new summary of that company
  const samples = SCREEN_SAMPLES.map((s) => {
    const got = legacySummary(data, materials, s.name, true)
    const diffs: string[] = []
    for (const [row, cols] of Object.entries(s.screen) as [keyof LegacyRows, Partial<Record<LegacyKey, number>>][]) {
      for (const [k, want] of Object.entries(cols) as [LegacyKey, number][]) if (got[row][k] !== want) diffs.push(`หน้าจอเดิม ${row}.${k}: screen ${want} formula ${got[row][k]}`)
    }
    const sys = companies.find((c) => c.company === s.name)?.system
    if (s.system && !sys) diffs.push('ไม่พบบริษัทในระบบใหม่')
    for (const [row, cols] of Object.entries(s.system ?? {}) as [keyof NewRows, Partial<Record<SampleKey, number>>][]) {
      for (const [k, want] of Object.entries(cols) as [SampleKey, number][]) {
        const have = !sys ? NaN : k in GROUPS ? sumOf(sys[row], GROUPS[k]) : sys[row][k as ColumnKey]
        if (have !== want) diffs.push(`ระบบใหม่ ${row}.${k}: expected ${want} got ${have}`)
      }
    }
    return { name: s.name, captured: s.captured, ok: diffs.length === 0, diffs, formula: got }
  })

  return { companies, unmatched, dueOverImport, samples }
}

/** The package-return summary exactly as GET /package-returns/summary builds it (no cutover filter). */
async function summaryAsPage(db: pg.ClientBase, company: string, ids: number[]): Promise<NewRows> {
  const mats = await db.query(
    `SELECT m.spool, m.pallet, m.box, m.sack, m."paperBar", m."spoolType", m."palletType", m."sackType",
            pa.id "legacyId", pa.spool "lSpool", pa."spoolType" "lSpoolType", pa.pallet "lPallet", pa."palletType" "lPalletType",
            pa.sack "lSack", pa."sackType" "lSackType", pa.partition "lPartition"
       FROM materials m
       LEFT JOIN (SELECT DISTINCT ON (ref_id) * FROM packageasts WHERE "packageStatus" = 'packageImport' ORDER BY ref_id, id) pa
         ON pa.ref_id = m.id
      WHERE m."supplierName" = $1 AND m."deletedAt" IS NULL`,
    [company]
  )
  const imported = importedTotals(mats.rows.map((m) => ({
    spool: m.spool, pallet: m.pallet, box: m.box, sack: m.sack, paperBar: m.paperBar,
    spoolType: m.spoolType, palletType: m.palletType, sackType: m.sackType,
    legacy: m.legacyId == null ? null : { spool: m.lSpool, spoolType: m.lSpoolType, pallet: m.lPallet, palletType: m.lPalletType, sack: m.lSack, sackType: m.lSackType, partition: m.lPartition },
  })))
  const due = emptyTotals()
  const returned = emptyTotals()
  const obl = await db.query(
    `SELECT category::text, variant, "qtyDue", "qtyReturned" FROM package_return_obligations
      WHERE "supplierId" = ANY($1::int[]) AND "sourceType" = 'MATERIAL_IMPORT' AND "needsSupplierAssignment" = false AND "deletedAt" IS NULL`,
    [ids]
  )
  for (const o of obl.rows) { const c = columnOf(o.category, o.variant); due[c] += o.qtyDue; returned[c] += o.qtyReturned }
  const outstanding = Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c.key, due[c.key] - returned[c.key]])) as ColumnTotals
  return { imported, due, returned, outstanding }
}

// ─── rendering ───────────────────────────────────────────────────────────────

type Report = Record<string, any>

function renderConsole(r: Report): string {
  const v = r.verification
  const reasons = new Map<string, number>()
  for (const d of r.carry.dropped) reasons.set(d.reason, (reasons.get(d.reason) ?? 0) + 1)
  const lines = [
    `mode: ${r.mode}  db: ${r.database}`,
    `dump rows: ${JSON.stringify(r.dumpCounts)}`,
    `after: ${JSON.stringify(r.after)}`,
    `pairing: ${r.pairing.pairedPackages} paired, ${r.pairing.unpairedPackages} packages-only, unpaired return rows: ${r.pairing.unpairedReturnRows.length}`,
    `carry: ${r.carry.sources} legacy rows → ${r.carry.obligations} obligations; dropped ${JSON.stringify(Object.fromEntries(reasons))}; capped ${r.carry.cuts.length} (material × group); moved company ${r.carry.moved.length}; linked by time ${r.carry.timeLinked}`,
    `receipts ${r.receiptsCreated}, entries ${r.entriesCreated}, over-returns ${r.overReturns.length}, unmatched ใบคืน names ${r.unmatchedHtrNames.length}`,
    `ต้องส่งคืน/คงค้าง > นำเข้า: ${v.dueOverImport.length} cells (${v.dueOverImport.filter((x: OverImportCell) => !x.allowed).length} not allowed)`,
    ...v.samples.map((s: any) => `sample "${s.name}" (${s.captured}): ${s.ok ? 'OK' : 'MISMATCH ' + s.diffs.join('; ')}`),
    ...v.companies.map((c: CompanyResult) => `  ${c.verdict.padEnd(16)} ${c.company}`),
  ]
  return lines.join('\n')
}

function renderMarkdown(r: Report): string {
  const v = r.verification
  const out: string[] = []
  out.push(`# Legacy package migration — ${r.mode}`, '')
  out.push(`- database: \`${r.database}\``, `- dump: \`${r.dump}\``)
  out.push(`- tables written: ${r.writtenTables.join(', ')}`, `- tables read only: ${r.readOnlyTables.join(', ')}`)
  out.push('- rule: ต้องส่งคืนต้องไม่เกินนำเข้า (ก ใบรับเข้ายังมีอยู่, ข บริษัทปัจจุบันของใบรับเข้า, ค ไม่เกินจำนวนใน material ต่อใบต่อกลุ่ม, ง จัดชนิดตามฝั่งนำเข้า)', '')
  out.push('## Row counts', '', '| | dump | before | after |', '|---|---|---|---|')
  for (const t of ['packages', 'packageasts', 'htrpackages']) out.push(`| ${t} | ${r.dumpCounts[t]} | ${r.before[t]} | ${r.after[t]} |`)
  out.push(`| obligations (ยอดยกมา) | | ${r.before.legacy_obligations} | ${r.after.legacy_obligations} |`)
  out.push(`| receipts / entries created | | | ${r.receiptsCreated} / ${r.entriesCreated} |`, `| materials (read only) | | ${r.before.materials} | ${r.after.materials} |`, '')
  out.push(`Pairing packages ↔ packageasts(packageReturn): ${r.pairing.pairedPackages} paired, ${r.pairing.unpairedPackages} packages rows without packageasts, unpaired return rows: ${r.pairing.unpairedReturnRows.length}`)
  out.push(`Legacy due rows (non-zero): ${r.carry.sources} → ${r.carry.obligations} obligations (one per import × column); packages-only rows linked by importStatus + time: ${r.carry.timeLinked}`, '')

  out.push('## Checks', '')
  out.push(`- ต้องส่งคืน / คงค้าง > นำเข้า (all companies, all columns, legacy + new system): ${v.dueOverImport.length ? '' : 'none'}`)
  for (const c of v.dueOverImport) out.push(`  - ${c.company} ${c.label}: นำเข้า ${c.imported} ต้องส่งคืน ${c.due} คงค้าง ${c.outstanding} — ${c.allowed ?? '**FAIL**'}`)
  for (const s of v.samples) out.push(`- formula sample "${s.name}" (legacy screen ${s.captured}): ${s.ok ? 'OK' : 'MISMATCH — ' + s.diffs.join('; ')}`)
  out.push('')

  out.push('## ยอดต้องส่งคืนที่ไม่ยกมา (ไม่มีใบรับเข้า)', '', '| เหตุผล | บริษัท (ชื่อในระบบเดิม) | แถวระบบเดิม | บันทึก | ยอด | หมายเหตุ |', '|---|---|---|---|---|---|')
  for (const d of r.carry.dropped) out.push(`| ${d.reason} | ${d.company ?? '?'} (${d.legacyName}) | ${d.ref} | ${new Date(d.createdAt).toISOString().slice(0, 10)} | ${d.due} | ${d.note} |`)
  out.push('')

  out.push('## ยอดที่ถูกจำกัดไม่ให้เกินจำนวนใน material', '', '| บริษัท | ใบรับเข้า | เลขที่ | กลุ่ม | ยอดระบบเดิม | นำเข้า | ตัดออก | แถวซ้ำ | เกินจำนวนใน material | แถวระบบเดิม |', '|---|---|---|---|---|---|---|---|---|---|')
  for (const c of r.carry.cuts) out.push(`| ${c.company} | #${c.materialId} | ${c.importStatus} | ${c.group} | ${c.want} | ${c.cap} | ${c.cut} | ${c.duplicate} | ${c.edited} | ${c.sources.join(', ')} |`)
  out.push('')

  out.push('## ยอดที่ย้ายบริษัทตามใบรับเข้า (ชื่อในระบบเดิมต่างจากบริษัทปัจจุบันของใบรับเข้า)', '', '| แถวระบบเดิม | ชื่อในระบบเดิม | จาก | ไป | ใบรับเข้า | ยอด |', '|---|---|---|---|---|---|')
  for (const m of r.carry.moved) out.push(`| ${m.ref} | ${m.legacyName} | ${m.from ?? '?'} | ${m.to} | #${m.materialId} | ${m.due} |`)
  out.push('')

  out.push('## Unmatched ใบคืน names (need mapping — no supplier created)', '')
  if (!r.unmatchedHtrNames.length) out.push('none', '')
  else { for (const u of r.unmatchedHtrNames) out.push(`- ${u.name}: ${u.htr} ใบคืน`); out.push('') }
  if (v.unmatched.length) {
    out.push('Legacy names with no company (nothing carried):', '')
    for (const u of v.unmatched) out.push(`- ${u.name}`)
    out.push('')
  }

  out.push('## Over-returns clamped to 0', '')
  if (!r.overReturns.length) out.push('none', '')
  else {
    const agg = new Map<string, number>()
    for (const o of r.overReturns) agg.set(`${o.supplier}|${o.field}`, (agg.get(`${o.supplier}|${o.field}`) ?? 0) + o.qty)
    out.push('| company | column | qty over | htrpackages ids |', '|---|---|---|---|')
    for (const [k, q] of agg) {
      const [s, f] = k.split('|')
      out.push(`| ${s} | ${f} | ${q} | ${r.overReturns.filter((o: any) => o.supplier === s && o.field === f).map((o: any) => o.htrId).join(', ')} |`)
    }
    out.push('')
  }
  if (r.untypedSpill.length) {
    out.push('## Untyped legacy returns that spilled onto typed columns', '', '| company | htr id | from | to | qty |', '|---|---|---|---|---|')
    for (const s of r.untypedSpill) out.push(`| ${s.supplier} | ${s.htrId} | ${s.field} | ${LABEL[s.col as ColumnKey]} | ${s.qty} |`)
    out.push('')
  }

  out.push('## กระบอกพลาสติก legacy bug (ต้องส่งคืน used packageImport rows)', '')
  const bug = v.companies.filter((c: CompanyResult) => c.spoolCPlasticBug)
  if (!bug.length) out.push('no company affected', '')
  else {
    out.push('| company | ต้องส่งคืน กระบอกพลาสติก: ระบบเดิมแสดง → ค่าที่ถูก | ต้องส่งคืน หลอดไม่ระบุชนิด: เดิม → ถูก | คงค้าง กระบอกพลาสติก: เดิม → ถูก |', '|---|---|---|---|')
    for (const c of bug) out.push(`| ${c.company} | ${c.legacyBuggy.due.spoolCPlastic} → ${c.legacy.due.spoolCPlastic} | ${c.legacyBuggy.due.spoolUnspecified} → ${c.legacy.due.spoolUnspecified} | ${c.legacyBuggy.outstanding.spoolCPlastic} → ${c.legacy.outstanding.spoolCPlastic} |`)
    out.push('')
  }

  out.push('## Per-company comparison (เดิม = หน้าจอระบบเดิมตามชื่อบริษัท รวมบั๊กกระบอกพลาสติก)', '', '| verdict | company | legacy names |', '|---|---|---|')
  for (const c of v.companies) out.push(`| ${c.verdict} | ${c.company} | ${c.legacyNames.join(' + ') || '-'} |`)
  out.push('')
  for (const c of v.companies) {
    const bad = c.checks.filter((x: Check) => !x.ok)
    out.push(`### ${c.company} — ${c.verdict}`, '')
    out.push('| row | ' + SUMMARY_COLUMNS.map((x) => LABEL[x.key]).join(' | ') + ' |', '|' + '---|'.repeat(SUMMARY_COLUMNS.length + 1))
    const leg = (t: Record<string, number>) => SUMMARY_COLUMNS.map((x) => x.key === 'sackPlastic' ? `${t.sack} (รวม)` : x.key === 'sackJute' || x.key === 'sackUnspecified' ? '' : t[x.key]).join(' | ')
    const sys = (t: Record<string, number>) => SUMMARY_COLUMNS.map((x) => t[x.key]).join(' | ')
    out.push(`| เดิม นำเข้า | ${leg(c.legacyBuggy.imported)} |`, `| ใหม่ นำเข้า | ${sys(c.system.imported)} |`)
    out.push(`| เดิม ต้องส่งคืน | ${leg(c.legacyBuggy.due)} |`, `| ใหม่ ต้องส่งคืน | ${sys(c.system.due)} |`)
    out.push(`| เดิม คืนแล้ว | ${leg(c.legacyBuggy.returned)} |`, `| ใหม่ คืนแล้ว | ${sys(c.system.returned)} |`)
    out.push(`| เดิม คงค้าง | ${leg(c.legacyBuggy.outstanding)} |`, `| ใหม่ คงค้าง | ${sys(c.system.outstanding)} |`, '')
    if (bad.length) {
      out.push('| row | check | legacy | new | |', '|---|---|---|---|---|')
      for (const b of bad) out.push(`| ${b.row} | ${b.what} | ${b.legacy} | ${b.system} | ${b.explained ?? '**ไม่ตรง**'} |`)
      out.push('')
    }
  }
  return out.join('\n')
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const db = new pg.Client({ connectionString: url })
  await db.connect()
  try {
    if (ROLLBACK) await rollback(db)
    else await migrate(db)
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await db.end()
  }
}

if (process.argv[1]?.includes('migrate-legacy-packages')) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
