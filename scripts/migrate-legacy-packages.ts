/**
 * migrate-legacy-packages.ts
 *
 * Moves the legacy Laravel packaging data (MySQL packages / packageasts / htrpackages, cut over
 * 2026-08-02) into Postgres and builds the carried-forward balance for the ใบคืน page:
 *   1. copies the 3 tables as-is (original ids) into packages / packageasts / htrpackages
 *   2. one MATERIAL_IMPORT obligation per legacy "must return" quantity:
 *        packageasts packageReturn row → typed (spool/sack/pallet subtype from that row)
 *        packages row with no packageasts pair (before 2023-02-25) → ไม่ระบุชนิด
 *      (legacyRef = "packageasts:<id>" / "packages:<id>", createdAt = legacy created_at)
 *   3. one PackageReturnReceipt per htrpackages row, allocated oldest-obligation-first:
 *        typed field → its column, overflow → that group's ไม่ระบุชนิด
 *        untyped field → ไม่ระบุชนิด first, then the typed columns in page order
 *          (sack: ไม่ระบุชนิด > พลาสติก > ปอ)
 *        anything still left = over-return → not allocated (outstanding clamps at 0), reported
 *   4. verifies the result against the legacy page formula (legacy-packages/lib.ts) and
 *      writes a report
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
import { columnOf, emptyTotals, SUMMARY_COLUMNS, type ColumnKey } from '../src/lib/package-return-columns'
import { bangkokMidnight } from '../src/lib/bangkokDate'
import {
  CUTOVER, EXACT, GROUPS, LEGACY_COLUMNS, addLegacy, emptyLegacyRows, int, legacyAsNew, legacySummary, loadDump,
  loadLegacyMaterials, loadSuppliers, newSummary, resolveSupplier, sumOf, utc,
  type LegacyData, type LegacyRows, type NewRows, type Row, type SupplierRow,
} from './legacy-packages/lib'

const args = process.argv.slice(2)
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const APPLY = args.includes('--apply')
const ROLLBACK = args.includes('--rollback')
const DUMP = arg('dump')
const MAP_FILE = arg('supplier-map')
const REPORT_DIR = arg('report') ?? `legacy-package-report-${new Date().toISOString().replace(/[:.]/g, '-')}`

const WRITTEN_TABLES = ['packages', 'packageasts', 'htrpackages', 'package_return_obligations', 'package_return_receipts', 'package_return_entries']

type Category = 'SPOOL' | 'SACK' | 'BOX' | 'PALLET' | 'PAPER_BAR'

interface Obl {
  key: string // legacyRef|category
  legacyRef: string
  category: Category
  variant: string | null
  qtyDue: number
  qtyReturned: number
  supplierId: number | null
  supplierName: string
  materialId: number | null
  createdAt: Date
  col: ColumnKey
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
  const legacyMaterials = await loadLegacyMaterials(db)
  const matRows = (await db.query(`SELECT id, "supplierName", "importStatus", "createdAt" FROM materials WHERE "createdAt" < $1`, [CUTOVER])).rows
  const materialIds = new Set<number>(matRows.map((m) => m.id))
  const materialSupplier = new Map<number, string>(matRows.map((m) => [m.id, m.supplierName]))

  // ── pair packages ↔ packageasts packageReturn (same request in legacy MaterialController::store) ──
  const returns = data.packageasts.filter((p) => p.package_status === 'packageReturn')
  const pkgByName = new Map<string, Row[]>()
  for (const p of data.packages) pkgByName.set(p.supplier_name!, [...(pkgByName.get(p.supplier_name!) ?? []), p])
  const pairOf = new Map<string, Row>() // packages.id → packageasts return row
  const sameQty = (a: Row, b: Row) => (['spool', 'sack', 'box', 'pallet'] as const).every((k) => int(a[k], 'pair') === int(b[k], 'pair'))
  const unpairedReturns: Row[] = []
  for (const r of returns) {
    const t = utc(r.created_at)!.getTime()
    const cand = (pkgByName.get(r.supplier_name!) ?? []).find(
      (p) => !pairOf.has(p.id!) && Math.abs(utc(p.created_at)!.getTime() - t) <= 2000 && sameQty(p, r)
    )
    if (cand) pairOf.set(cand.id!, r)
    else unpairedReturns.push(r)
  }
  const unpairedPackages = data.packages.filter((p) => !pairOf.has(p.id!))

  // packages.materialId: via the pair's ref_id, else same supplier + importStatus + time (±2s)
  const packageMaterial = new Map<string, number | null>()
  for (const p of data.packages) {
    const pair = pairOf.get(p.id!)
    if (pair) { const ref = int(pair.ref_id, 'ref_id'); packageMaterial.set(p.id!, materialIds.has(ref) ? ref : null); continue }
    const t = utc(p.created_at)!.getTime()
    const hits = matRows.filter((m) => m.supplierName === p.supplier_name && m.importStatus === p.package_status && Math.abs(new Date(m.createdAt).getTime() - t) <= 2000)
    packageMaterial.set(p.id!, hits.length === 1 ? hits[0].id : null)
  }

  // ── 1. copy the 3 tables ──
  const supplierOf = (name: string | null) => resolveSupplier(name ?? '', suppliers, supplierMap)
  await bulkInsert(db, 'packages',
    ['id', 'supplierId', 'supplierName', 'emp', 'spool', 'sack', 'box', 'pallet', 'packageStatus', 'legacyDate', 'materialId', 'created_at', 'updated_at'],
    data.packages.map((p) => [int(p.id, 'id'), supplierOf(p.supplier_name), p.supplier_name, p.emp, int(p.spool, 'spool'), int(p.sack, 'sack'), int(p.box, 'box'), int(p.pallet, 'pallet'),
      p.package_status, p.supplier_id, packageMaterial.get(p.id!), utc(p.created_at) ?? utc(p.added_on), utc(p.updated_at) ?? utc(p.created_at) ?? utc(p.added_on)]))
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

  // ── 2. carried-forward obligations ──
  const obligations: Obl[] = []
  const unmatchedNames = new Map<string, { obligations: number; htr: number }>()
  const pushObl = (row: Row, legacyRef: string, category: Category, qty: number, variant: string | null, materialId: number | null, ownerName?: string) => {
    if (qty <= 0) return
    const name = ownerName ?? row.supplier_name!
    const supplierId = supplierOf(name)
    if (supplierId == null) {
      const u = unmatchedNames.get(name) ?? { obligations: 0, htr: 0 }
      u.obligations++
      unmatchedNames.set(name, u)
    }
    obligations.push({
      key: `${legacyRef}|${category}`, legacyRef, category, variant, qtyDue: qty, qtyReturned: 0, supplierId,
      supplierName: supplierId != null ? supplierById.get(supplierId)!.name : name, materialId,
      createdAt: utc(row.created_at)!, col: columnOf(category, variant),
    })
  }
  for (const r of returns) {
    const ref = int(r.ref_id, 'ref_id')
    // material hard-deleted in legacy (11 rows on the 2026-10-07 dump): user decided 2026-10-08
    // not to carry these forward — the packageasts/packages rows are still copied, listed in the report
    if (!materialIds.has(ref)) continue
    const mid = ref
    const ref_ = `packageasts:${r.id}`
    // the obligation follows the material's current company, like its นำเข้า row does
    // (user decision 2026-10-08: material supplierName edited after import → ยอดต้องส่งคืน moves too)
    const owner = materialSupplier.get(ref)!
    pushObl(r, ref_, 'SPOOL', int(r.spool, 'spool'), r.spool_type, mid, owner)
    pushObl(r, ref_, 'SACK', int(r.sack, 'sack'), r.sack_type, mid, owner)
    pushObl(r, ref_, 'BOX', int(r.box, 'box'), null, mid, owner)
    pushObl(r, ref_, 'PALLET', int(r.pallet, 'pallet'), r.pallet_type, mid, owner)
    pushObl(r, ref_, 'PAPER_BAR', int(r.partition, 'partition'), null, mid, owner)
  }
  for (const p of unpairedPackages) {
    const ref_ = `packages:${p.id}`
    const mid = packageMaterial.get(p.id!) ?? null
    pushObl(p, ref_, 'SPOOL', int(p.spool, 'spool'), null, mid)
    pushObl(p, ref_, 'SACK', int(p.sack, 'sack'), null, mid)
    pushObl(p, ref_, 'BOX', int(p.box, 'box'), null, mid)
    pushObl(p, ref_, 'PALLET', int(p.pallet, 'pallet'), null, mid)
  }
  // FIFO order = the receipts POST order (createdAt, then id ≈ insertion order)
  obligations.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.key.localeCompare(b.key))

  // ── 3. receipts from htrpackages ──
  const htrSorted = [...data.htrpackages].sort((a, b) => htrDate(a).getTime() - htrDate(b).getTime() || int(a.id, 'id') - int(b.id, 'id'))
  const overReturns: OverReturn[] = []
  const untypedSpill: { supplier: string; htrId: number; field: string; col: ColumnKey; qty: number }[] = []
  const receipts: { htr: Row; supplierId: number | null; supplierName: string; allocs: Alloc[]; fields: Record<string, number>; note: string }[] = []

  for (const h of htrSorted) {
    const supplierId = supplierOf(h.supplier_name)
    const groupName = supplierId != null ? supplierById.get(supplierId)!.name : h.supplier_name!
    if (supplierId == null) {
      const u = unmatchedNames.get(h.supplier_name!) ?? { obligations: 0, htr: 0 }
      u.htr++
      unmatchedNames.set(h.supplier_name!, u)
    }
    const pool = obligations.filter((o) => o.supplierName === groupName && (supplierId != null || o.supplierId == null))
    const allocs: Alloc[] = []
    const allocated = emptyTotals()
    const take = (col: ColumnKey, amount: number) => {
      for (const o of pool) {
        if (amount <= 0) break
        if (o.col !== col) continue
        const n = Math.min(amount, o.qtyDue - o.qtyReturned)
        if (n <= 0) continue
        o.qtyReturned += n
        allocs.push({ oblKey: o.key, qty: n })
        allocated[col] += n
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
    obligations.map((o) => [o.supplierId, o.supplierId == null, o.category, o.variant, 'MATERIAL_IMPORT', o.materialId, o.qtyDue, o.qtyReturned,
      STATUS(o.qtyReturned, o.qtyDue), 'ยอดยกมาจากระบบเดิม', o.legacyRef, o.createdAt, new Date()]),
    `id, "legacyRef", category::text`)
  const oblId = new Map(inserted.map((r) => [`${r.legacyRef}|${r.category}`, r.id as number]))

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

  const verification = await verify(db, data, legacyMaterials, suppliers, supplierMap, overReturns)

  const orphanRefs = [...new Set(returns.map((r) => int(r.ref_id, 'ref_id')).filter((id) => !materialIds.has(id)))].sort((a, b) => a - b)
  const blocked = [...unmatchedNames.entries()].filter(([, u]) => u.obligations > 0 || u.htr > 0)
  const failed = verification.companies.filter((c) => c.verdict === 'FAIL')

  const report = {
    mode: APPLY ? 'APPLY' : 'DRY-RUN', database: (process.env.DATABASE_URL ?? '').replace(/:[^:@/]*@/, ':***@'), dump: DUMP,
    writtenTables: WRITTEN_TABLES, readOnlyTables: ['materials', 'suppliers'],
    dumpCounts: { packages: data.packages.length, packageasts: data.packageasts.length, htrpackages: data.htrpackages.length },
    before: pre, after: counts, receiptsCreated: receiptCount, entriesCreated: entryCount,
    pairing: { pairedPackages: pairOf.size, unpairedPackages: unpairedPackages.length, unpairedReturnRows: unpairedReturns.map((r) => r.id) },
    packagesWithoutMaterial: data.packages.filter((p) => packageMaterial.get(p.id!) == null).map((p) => ({ id: p.id, supplier: p.supplier_name, packageStatus: p.package_status, createdAt: p.created_at, spool: p.spool, sack: p.sack, box: p.box, pallet: p.pallet })),
    // materials deleted in legacy — copied into packageasts/packages but no ยอดค้าง created.
    // effect = new table minus legacy page, per row and column, caused by leaving this ref out.
    orphanPackageastRefs: orphanRefs.map((ref) => {
      const r = returns.find((x) => int(x.ref_id, 'ref_id') === ref)!
      const imp = data.packageasts.find((x) => int(x.ref_id, 'ref_id') === ref && x.package_status === 'packageImport')
      const effect: { row: string; col: ColumnKey; delta: number }[] = []
      const add = (row: string, col: ColumnKey, delta: number) => { if (delta) effect.push({ row, col, delta }) }
      if (imp) {
        // legacy: typed columns sum packageasts, ไม่ระบุชนิด = materials − typed → the deleted import moves
        add('นำเข้า', columnOf('SPOOL', imp.spool_type), -int(imp.spool, 'spool'))
        add('นำเข้า', 'spoolUnspecified', int(imp.spool, 'spool'))
        add('นำเข้า', columnOf('PALLET', imp.pallet_type), -int(imp.pallet, 'pallet'))
        add('นำเข้า', 'palletUnspecified', int(imp.pallet, 'pallet'))
        add('นำเข้า', 'paperBar', -int(imp.partition, 'partition'))
      }
      for (const row of ['ต้องส่งคืน', 'คงค้าง']) {
        add(row, columnOf('SPOOL', r.spool_type), -int(r.spool, 'spool'))
        add(row, columnOf('SACK', r.sack_type), -int(r.sack, 'sack'))
        add(row, 'box', -int(r.box, 'box'))
        add(row, columnOf('PALLET', r.pallet_type), -int(r.pallet, 'pallet'))
        add(row, 'paperBar', -int(r.partition, 'partition'))
      }
      return {
        ref_id: ref, supplier: r.supplier_name, createdAt: r.created_at,
        importRow: imp ? { spool: imp.spool, spoolType: imp.spool_type, sack: imp.sack, sackType: imp.sack_type, box: imp.box, pallet: imp.pallet, palletType: imp.pallet_type, partition: imp.partition } : null,
        returnRow: { spool: r.spool, spoolType: r.spool_type, sack: r.sack, sackType: r.sack_type, box: r.box, pallet: r.pallet, palletType: r.pallet_type, partition: r.partition },
        effect,
      }
    }),
    // obligation follows the material's current company (user decision 2026-10-08), not packageasts.supplier_name
    supplierMismatch: returns.flatMap((r) => {
      const m = matRows.find((x) => x.id === int(r.ref_id, 'ref_id'))
      if (!m || m.supplierName === r.supplier_name) return []
      const company = (n: string) => { const id = supplierOf(n); return id == null ? null : supplierById.get(id)!.name }
      const from = company(r.supplier_name!), to = company(m.supplierName)
      const empty = (['spool', 'sack', 'box', 'pallet', 'partition'] as const).every((k) => int(r[k], k) === 0)
      return [{ packageastId: r.id, ref_id: r.ref_id, packageastSupplier: r.supplier_name, materialSupplier: m.supplierName, fromCompany: from, toCompany: to,
        moved: from !== to && !empty, empty, spool: r.spool, sack: r.sack, box: r.box, pallet: r.pallet, partition: r.partition }]
    }),
    unmatchedSupplierNames: [...unmatchedNames.entries()].map(([name, u]) => ({ name, ...u })),
    overReturns, untypedSpill,
    verification,
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(path.join(REPORT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), renderMarkdown(report))
  console.log(renderConsole(report))
  console.log(`\nreport: ${path.resolve(REPORT_DIR)}`)

  if (!APPLY) { await db.query('ROLLBACK'); console.log('DRY RUN — rolled back, nothing changed') ; return }
  if (blocked.length || failed.length) {
    await db.query('ROLLBACK')
    throw new Error(`not committed: ${blocked.length} unmatched supplier names, ${failed.length} companies FAIL`)
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

export async function verify(
  db: pg.ClientBase, data: LegacyData, materials: Awaited<ReturnType<typeof loadLegacyMaterials>>,
  suppliers: SupplierRow[], supplierMap: Record<string, number>, overReturns: OverReturn[]
) {
  const names = new Set<string>([
    ...data.packages.map((p) => p.supplier_name!), ...data.packageasts.map((p) => p.supplier_name!),
    ...data.htrpackages.map((p) => p.supplier_name!), ...materials.map((m) => m.supplierName),
  ])
  const byCompany = new Map<string, string[]>()
  const unmatched: { name: string; legacy: LegacyRows }[] = []
  for (const n of names) {
    const id = resolveSupplier(n, suppliers, supplierMap)
    if (id == null) { unmatched.push({ name: n, legacy: legacySummary(data, materials, n, false) }); continue }
    const company = suppliers.find((s) => s.id === id)!.name
    byCompany.set(company, [...(byCompany.get(company) ?? []), n])
  }

  // packageImport rows the legacy page counts under a company although the material is gone
  // (deleted in legacy) or now belongs to another company (supplierName edited after import).
  // The new import row follows the material, so its กระดาษกั้น differs by exactly these.
  const matSupplier = new Map(materials.map((m) => [m.id, m.supplierName]))
  const companyOf = (name: string) => {
    const id = resolveSupplier(name, suppliers, supplierMap)
    return id == null ? `?${name}` : suppliers.find((s) => s.id === id)!.name
  }
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
  // packageReturn rows whose material now belongs to another company: the obligation moved with it
  const movedReturns = data.packageasts
    .filter((p) => p.package_status === 'packageReturn' && matSupplier.has(int(p.ref_id, 'ref_id')))
    .map((p) => ({ p, from: companyOf(p.supplier_name!), to: companyOf(matSupplier.get(int(p.ref_id, 'ref_id'))!) }))
    .filter((m) => m.from !== m.to)
  const BUCKET_FIELDS = [['หลอด', 'spool'], ['กระสอบ', 'sack'], ['box', 'box'], ['พาเลท', 'pallet'], ['paperBar', 'partition']] as const
  const movedDue = (company: string, bucket: string, dir: 'in' | 'out') => movedReturns
    .filter((m) => (dir === 'out' ? m.from : m.to) === company)
    .reduce((t, m) => t + int(m.p[BUCKET_FIELDS.find(([b]) => b === bucket)![1]], 'qty'), 0)

  // packageReturn rows of materials deleted in legacy: not carried forward (user decision 2026-10-08)
  const orphanReturns = data.packageasts
    .filter((p) => p.package_status === 'packageReturn' && !matSupplier.has(int(p.ref_id, 'ref_id')))
    .flatMap((p) => ([['หลอด', 'spool'], ['กระสอบ', 'sack'], ['box', 'box'], ['พาเลท', 'pallet'], ['paperBar', 'partition']] as const)
      .map(([bucket, k]) => ({ supplier: p.supplier_name!, bucket, qty: int(p[k], k) })))

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
    const overIn = (bucket: string) => overReturns.filter((o) => o.supplier === company && o.bucket === bucket).reduce((s, o) => s + o.qty, 0)
    const orphanIn = (bucket: string) => orphanReturns
      .filter((o) => legacyNames.includes(o.supplier) && o.bucket === bucket).reduce((s, o) => s + o.qty, 0)
    const shift = paperBarShift(company, legacyNames)

    // Every known reason the new table may differ from the legacy page, as a signed adjustment of
    // the legacy figure; a difference is "explained" only when legacy + adjustments == new exactly.
    const adjustments = (row: keyof LegacyRows, bucket: string): [string, number][] => {
      const a: [string, number][] = []
      if (row === 'imported' && bucket === 'paperBar') {
        a.push(['ใบรับเข้าที่ถูกลบในระบบเดิม', -shift.orphan], ['ใบรับเข้าที่ภายหลังเปลี่ยนเป็นบริษัทอื่น', -shift.movedOut],
          ['ใบรับเข้าที่ภายหลังเปลี่ยนมาเป็นบริษัทนี้', shift.movedIn])
      }
      if (row === 'due' || row === 'outstanding') {
        a.push(['ใบรับเข้าที่ถูกลบในระบบเดิม (ไม่นำยอดมา)', -orphanIn(bucket)],
          ['ใบรับเข้าที่ภายหลังเปลี่ยนเป็นบริษัทอื่น (ยอดย้ายตาม)', -movedDue(company, bucket, 'out')],
          ['ใบรับเข้าที่ภายหลังเปลี่ยนมาเป็นบริษัทนี้ (ยอดย้ายตาม)', movedDue(company, bucket, 'in')])
      }
      if (row === 'returned') a.push(['คืนเกินยอดคงค้าง (จำกัดที่ 0)', -overIn(bucket)])
      if (row === 'outstanding') a.push(['คืนเกินยอดคงค้าง (จำกัดที่ 0)', overIn(bucket)])
      return a.filter(([, n]) => n !== 0)
    }

    const checks: Check[] = []
    const rows: [string, keyof LegacyRows][] = [['นำเข้า', 'imported'], ['ต้องส่งคืน', 'due'], ['คืนแล้ว', 'returned'], ['คงค้าง', 'outstanding']]
    const buckets: [string, string, ColumnKey[]][] = [
      ['box', LABEL.box, ['box']], ['paperBar', LABEL.paperBar, ['paperBar']],
      ...Object.entries(GROUPS).map(([g, keys]): [string, string, ColumnKey[]] => [g, `รวมกลุ่ม${g}`, keys]),
    ]
    for (const [label, lk] of rows) {
      for (const [bucket, what, keys] of buckets) {
        const l = legacyAsNew(legacy[lk], keys)
        const s = sumOf(system[lk], keys)
        const adj = adjustments(lk, bucket)
        const explained = l !== s && l + adj.reduce((t, [, n]) => t + n, 0) === s
          ? adj.map(([why, n]) => `${why} ${n > 0 ? '+' : '−'}${Math.abs(n)}`).join(', ')
          : undefined
        checks.push({ row: label, what, legacy: l, system: s, ok: l === s, explained })
      }
    }
    const verdict = checks.every((c) => c.ok) ? 'PASS' : checks.every((c) => c.ok || c.explained) ? 'PASS (อธิบายได้)' : 'FAIL'
    const spoolCPlasticBug = legacy.due.spoolCPlastic !== legacyBuggy.due.spoolCPlastic
    companies.push({ company, supplierIds: ids, legacyNames, verdict, checks, legacy, legacyBuggy, system, spoolCPlasticBug })
  }

  // sample from the brief: legacy "จีน" import row
  const china = legacySummary(data, materials, 'จีน', false)
  const chinaExpected = { spoolPaper: 117760, spoolPlastic: 10080, spoolUnspecified: 37276, sack: 12364, box: 722 }
  const sample = {
    name: 'จีน', expectedImport: chinaExpected, legacyImport: china.imported, legacyDue: china.due,
    ok: Object.entries(chinaExpected).every(([k, v]) => china.imported[k as keyof typeof china.imported] === v) && LEGACY_COLUMNS.every((k) => china.due[k] === 0),
  }

  return { companies, unmatched, sample }
}

// ─── rendering ───────────────────────────────────────────────────────────────

type Report = Record<string, any>

function renderConsole(r: Report): string {
  const v = r.verification
  const lines = [
    `mode: ${r.mode}  db: ${r.database}`,
    `dump rows: ${JSON.stringify(r.dumpCounts)}`,
    `after: ${JSON.stringify(r.after)}`,
    `pairing: ${r.pairing.pairedPackages} paired, ${r.pairing.unpairedPackages} packages-only (untyped), unpaired return rows: ${r.pairing.unpairedReturnRows.length}`,
    `receipts ${r.receiptsCreated}, entries ${r.entriesCreated}, over-returns ${r.overReturns.length}, unmatched names ${r.unmatchedSupplierNames.length}`,
    `sample "จีน": ${v.sample.ok ? 'OK' : 'MISMATCH'}`,
    ...v.companies.map((c: CompanyResult) => `  ${c.verdict.padEnd(16)} ${c.company}`),
  ]
  return lines.join('\n')
}

function renderMarkdown(r: Report): string {
  const v = r.verification
  const out: string[] = []
  out.push(`# Legacy package migration — ${r.mode}`, '')
  out.push(`- database: \`${r.database}\``, `- dump: \`${r.dump}\``)
  out.push(`- tables written: ${r.writtenTables.join(', ')}`, `- tables read only: ${r.readOnlyTables.join(', ')}`, '')
  out.push('## Row counts', '', '| | dump | before | after |', '|---|---|---|---|')
  for (const t of ['packages', 'packageasts', 'htrpackages']) out.push(`| ${t} | ${r.dumpCounts[t]} | ${r.before[t]} | ${r.after[t]} |`)
  out.push(`| obligations (ยอดยกมา) | | ${r.before.legacy_obligations} | ${r.after.legacy_obligations} |`)
  out.push(`| receipts / entries created | | | ${r.receiptsCreated} / ${r.entriesCreated} |`, `| materials (read only) | | ${r.before.materials} | ${r.after.materials} |`, '')
  out.push(`Pairing packages ↔ packageasts(packageReturn): ${r.pairing.pairedPackages} paired, ${r.pairing.unpairedPackages} packages rows without packageasts (→ ไม่ระบุชนิด), unpaired return rows: ${r.pairing.unpairedReturnRows.length}`, '')

  out.push('## Sample check: "จีน"', '', `${v.sample.ok ? 'OK' : 'MISMATCH'} — import ${JSON.stringify(v.sample.legacyImport)}`, '')

  out.push('## Unmatched supplier names (need mapping — no supplier created)', '')
  if (!r.unmatchedSupplierNames.length && !v.unmatched.length) out.push('none', '')
  else {
    out.push('| legacy name | obligations | ใบคืน | นำเข้า หลอด | ต้องส่งคืน หลอด/กระสอบ/กล่อง/พาเลท/กระดาษกั้น | คืนแล้ว (รวม) |', '|---|---|---|---|---|---|')
    for (const u of v.unmatched) {
      const s = r.unmatchedSupplierNames.find((x: any) => x.name === u.name) ?? { obligations: 0, htr: 0 }
      const d = u.legacy.due
      const spoolDue = d.spoolPaper + d.spoolPlastic + d.spoolCPaper + d.spoolCPlastic + d.spoolUnspecified
      const imp = u.legacy.imported
      const spoolImp = imp.spoolPaper + imp.spoolPlastic + imp.spoolCPaper + imp.spoolCPlastic + imp.spoolUnspecified
      const ret = LEGACY_COLUMNS.reduce((a, k) => a + u.legacy.returned[k], 0)
      out.push(`| ${u.name} | ${s.obligations} | ${s.htr} | ${spoolImp} | ${spoolDue}/${d.sack}/${d.box}/${d.palletWood + d.palletSteel + d.palletUnspecified}/${d.paperBar} | ${ret} |`)
    }
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

  out.push('## ใบรับเข้าที่ถูกลบในระบบเดิม (ไม่สร้างยอดค้าง)', '')
  out.push('| company | ref | ชนิด | นำเข้า หลอด/กระสอบ/กล่อง/พาเลท/กระดาษกั้น | ต้องส่งคืน หลอด/กระสอบ/กล่อง/พาเลท/กระดาษกั้น | ผลต่างตารางสรุป (ใหม่ − เดิม) |', '|---|---|---|---|---|---|')
  for (const o of r.orphanPackageastRefs) {
    const i = o.importRow ?? {}
    const t = o.returnRow
    const types = [
      (+(i.spool ?? 0) || +t.spool) && `หลอด ${t.spoolType}`, (+(i.sack ?? 0) || +t.sack) && `กระสอบ ${t.sackType}`,
      (+(i.pallet ?? 0) || +t.pallet) && `พาเลท ${t.palletType}`, (+(i.box ?? 0) || +t.box) && 'กล่อง',
      (+(i.partition ?? 0) || +(t.partition ?? 0)) && 'กระดาษกั้น',
    ].filter(Boolean).join(', ')
    const fx = o.effect.map((e: any) => `${e.row} ${LABEL[e.col as ColumnKey]} ${e.delta > 0 ? '+' : ''}${e.delta}`).join('; ') || 'ไม่มี (จำนวนเป็น 0)'
    out.push(`| ${o.supplier} | ${o.ref_id} | ${types || '-'} | ${i.spool ?? 0}/${i.sack ?? 0}/${i.box ?? 0}/${i.pallet ?? 0}/${i.partition ?? 0} | ${t.spool}/${t.sack}/${t.box}/${t.pallet}/${t.partition ?? 0} | ${fx} |`)
  }
  out.push('')

  out.push('## ใบรับเข้าที่ภายหลังเปลี่ยนบริษัท (ยอดต้องส่งคืนย้ายตามบริษัทปัจจุบันของใบรับเข้า)', '')
  out.push('| packageasts id | ref | ชื่อตอนรับเข้า | ชื่อปัจจุบันของใบรับเข้า | ย้ายบริษัท | หลอด/กระสอบ/กล่อง/พาเลท/กระดาษกั้น |', '|---|---|---|---|---|---|')
  for (const m of r.supplierMismatch) out.push(`| ${m.packageastId} | ${m.ref_id} | ${m.packageastSupplier} | ${m.materialSupplier} | ${m.moved ? `${m.fromCompany} → ${m.toCompany}` : m.empty ? 'ไม่มียอดต้องส่งคืน (จำนวน 0)' : 'ไม่ย้าย (บริษัทเดียวกันหลังจับคู่)'} | ${m.spool}/${m.sack}/${m.box}/${m.pallet}/${m.partition ?? 0} |`)
  out.push('')
  const net = new Map<string, number[]>()
  for (const m of r.supplierMismatch.filter((x: any) => x.moved)) {
    const q = [m.spool, m.sack, m.box, m.pallet, m.partition ?? 0].map(Number)
    for (const [c, sign] of [[m.fromCompany, -1], [m.toCompany, 1]] as const) {
      const t = net.get(c) ?? [0, 0, 0, 0, 0]
      net.set(c, t.map((x, i) => x + sign * q[i]))
    }
  }
  if (net.size) {
    out.push('ผลต่อยอดต้องส่งคืน (และคงค้างก่อนหักคืน) เทียบกับหน้าจอระบบเดิม:', '', '| company | หลอด | กระสอบ | กล่อง | พาเลท | กระดาษกั้น |', '|---|---|---|---|---|---|')
    const f = (n: number) => (n > 0 ? `+${n}` : String(n))
    for (const [c, t] of net) out.push(`| ${c} | ${t.map(f).join(' | ')} |`)
    out.push('')
  }

  out.push('## Per-company comparison', '', '| verdict | company | legacy names |', '|---|---|---|')
  for (const c of v.companies) out.push(`| ${c.verdict} | ${c.company} | ${c.legacyNames.join(' + ')} |`)
  out.push('')
  for (const c of v.companies) {
    const bad = c.checks.filter((x: Check) => !x.ok)
    out.push(`### ${c.company} — ${c.verdict}`, '')
    out.push('| row | ' + SUMMARY_COLUMNS.map((x) => LABEL[x.key]).join(' | ') + ' |', '|' + '---|'.repeat(SUMMARY_COLUMNS.length + 1))
    const leg = (t: Record<string, number>) => SUMMARY_COLUMNS.map((x) => x.key === 'sackPlastic' ? `${t.sack} (รวม)` : x.key === 'sackJute' || x.key === 'sackUnspecified' ? '' : t[x.key]).join(' | ')
    const sys = (t: Record<string, number>) => SUMMARY_COLUMNS.map((x) => t[x.key]).join(' | ')
    out.push(`| เดิม นำเข้า | ${leg(c.legacy.imported)} |`, `| ใหม่ นำเข้า | ${sys(c.system.imported)} |`)
    out.push(`| เดิม ต้องส่งคืน | ${leg(c.legacy.due)} |`, `| ใหม่ ต้องส่งคืน | ${sys(c.system.due)} |`)
    out.push(`| เดิม คืนแล้ว | ${leg(c.legacy.returned)} |`, `| ใหม่ คืนแล้ว | ${sys(c.system.returned)} |`)
    out.push(`| เดิม คงค้าง | ${leg(c.legacy.outstanding)} |`, `| ใหม่ คงค้าง | ${sys(c.system.outstanding)} |`, '')
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
