/**
 * Shared pieces of the legacy packaging migration (see scripts/migrate-legacy-packages.ts):
 *  - parseDump: reads the mysqldump of packages / packageasts / htrpackages (no MySQL needed)
 *  - legacySummary: the summary table exactly as Laravel PackageController::create() +
 *    package/create.blade.php computed it, per legacy supplier_name
 *  - verify: compares that against the new system's package-return summary, per company
 *
 * Everything here only READS materials/suppliers. Writes live in migrate-legacy-packages.ts.
 */

import fs from 'node:fs'
import pg, { type ClientBase } from 'pg'
import { COLUMN_GROUPS, SUMMARY_COLUMNS, carveDue, columnOf, emptyTotals, importSplit, importedTotals, type ColumnKey, type ColumnTotals } from '../../src/lib/package-return-columns'

// Prisma stores DateTime in `timestamp without time zone` columns as UTC. node-pg by default
// writes and reads those in the machine's local zone (Bangkok here) — pin both to UTC.
pg.defaults.parseInputDatesAsUTC = true
pg.types.setTypeParser(1114, (v: string) => new Date(v.replace(' ', 'T') + 'Z'))

// Legacy system stopped recording after 2026-08-02 (Bangkok). Materials created before this
// instant are the legacy ones (ids <= 4419, 4,369 rows on the 2026-10-07 prod backup).
export const CUTOVER = new Date('2026-08-03T00:00:00+07:00')

// ─── mysqldump parsing ───────────────────────────────────────────────────────

export type Row = Record<string, string | null>

/** Parses `CREATE TABLE` column order + extended `INSERT INTO ... VALUES (...),(...);` lines. */
export function parseDump(path: string): Record<string, Row[]> {
  const text = fs.readFileSync(path, 'utf8')
  const columns: Record<string, string[]> = {}
  const rows: Record<string, Row[]> = {}

  for (const m of text.matchAll(/CREATE TABLE `(\w+)` \(\n([\s\S]*?)\n\)/g)) {
    columns[m[1]] = [...m[2].matchAll(/^\s+`(\w+)`/gm)].map((c) => c[1])
    rows[m[1]] = []
  }

  for (const line of text.split('\n')) {
    const m = /^INSERT INTO `(\w+)` VALUES /.exec(line)
    if (!m) continue
    const table = m[1]
    const cols = columns[table]
    if (!cols) throw new Error(`INSERT for ${table} before its CREATE TABLE`)
    for (const tuple of parseTuples(line.slice(m[0].length))) {
      if (tuple.length !== cols.length) throw new Error(`${table}: ${tuple.length} values for ${cols.length} columns`)
      rows[table].push(Object.fromEntries(cols.map((c, i) => [c, tuple[i]])))
    }
  }
  return rows
}

function parseTuples(s: string): (string | null)[][] {
  const out: (string | null)[][] = []
  let i = 0
  const ESC: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' }
  while (i < s.length) {
    if (s[i] !== '(') { i++; continue }
    i++
    const tuple: (string | null)[] = []
    for (;;) {
      if (s[i] === "'") {
        i++
        let v = ''
        while (s[i] !== "'") {
          if (s[i] === '\\') { v += ESC[s[i + 1]] ?? s[i + 1]; i += 2 } else v += s[i++]
        }
        i++
        tuple.push(v)
      } else {
        let j = i
        while (s[j] !== ',' && s[j] !== ')') j++
        const raw = s.slice(i, j)
        tuple.push(raw === 'NULL' ? null : raw)
        i = j
      }
      if (s[i] === ',') { i++; continue }
      if (s[i] === ')') { i++; break }
      throw new Error(`dump parse error near: ${s.slice(i, i + 40)}`)
    }
    out.push(tuple)
  }
  return out
}

/** Legacy numbers are varchar; the 2026-10-07 dump has only digit strings / NULL. Anything else aborts. */
export function int(v: string | null | undefined, what: string): number {
  if (v == null || v === '') return 0
  if (!/^\d+$/.test(v)) throw new Error(`non-numeric legacy value ${JSON.stringify(v)} in ${what}`)
  return Number(v)
}

/** MySQL TIMESTAMP as dumped with TIME_ZONE='+00:00' (Laravel app timezone is UTC too). */
export function utc(v: string | null): Date | null {
  return v ? new Date(v.replace(' ', 'T') + 'Z') : null
}

export interface LegacyData {
  packages: Row[]
  packageasts: Row[]
  htrpackages: Row[]
}

export function loadDump(path: string): LegacyData {
  const d = parseDump(path)
  for (const t of ['packages', 'packageasts', 'htrpackages'] as const) {
    if (!d[t]) throw new Error(`dump has no table ${t}`)
  }
  return { packages: d.packages, packageasts: d.packageasts, htrpackages: d.htrpackages }
}

// ─── legacy summary (PackageController::create) ──────────────────────────────

/** Legacy page columns. Legacy has one sack column (header "พลาสติก" but it is all sacks). */
export const LEGACY_COLUMNS = [
  'spoolPaper', 'spoolPlastic', 'spoolCPaper', 'spoolCPlastic', 'spoolUnspecified',
  'sack', 'box', 'palletWood', 'palletSteel', 'palletUnspecified', 'paperBar',
] as const
export type LegacyKey = (typeof LEGACY_COLUMNS)[number]
export type LegacyTotals = Record<LegacyKey, number>
export interface LegacyRows { imported: LegacyTotals; due: LegacyTotals; returned: LegacyTotals; outstanding: LegacyTotals }

const zeroLegacy = (): LegacyTotals => Object.fromEntries(LEGACY_COLUMNS.map((k) => [k, 0])) as LegacyTotals

export interface MaterialPkg { id: number; supplierName: string; spool: number; sack: number; box: number; pallet: number; createdAt: Date }

/** Packaging columns of the legacy materials (read-only). Same rows MySQL had at cutover. */
export async function loadLegacyMaterials(db: ClientBase): Promise<MaterialPkg[]> {
  const r = await db.query(
    `SELECT id, "supplierName", COALESCE(spool,0) spool, COALESCE(sack,0) sack, COALESCE(box,0) box,
            COALESCE(pallet,0) pallet, "createdAt"
       FROM materials WHERE "createdAt" < $1 ORDER BY id`,
    [CUTOVER]
  )
  return r.rows.map((m) => ({ ...m, spool: +m.spool, sack: +m.sack, box: +m.box, pallet: +m.pallet }))
}

/**
 * Legacy summary per supplier_name. `bug: true` reproduces the page as users saw it:
 * "ต้องส่งคืน กระบอกพลาสติก" summed packageImport rows instead of packageReturn
 * (PackageController.php line 181), which also shifts "ไม่ระบุชนิด" (it is a remainder).
 */
export function legacySummary(data: LegacyData, materials: MaterialPkg[], name: string, bug: boolean): LegacyRows {
  const mat = materials.filter((m) => m.supplierName === name)
  const pk = data.packages.filter((p) => p.supplier_name === name)
  const pa = data.packageasts.filter((p) => p.supplier_name === name)
  const htr = data.htrpackages.filter((h) => h.supplier_name === name)

  const sumMat = (k: 'spool' | 'sack' | 'box' | 'pallet') => mat.reduce((s, m) => s + m[k], 0)
  const sumPk = (k: string) => pk.reduce((s, p) => s + int(p[k], `packages#${p.id}.${k}`), 0)
  const sumPa = (status: string, qty: string, typeCol: string | null, type: string | null) =>
    pa
      .filter((p) => p.package_status === status && (typeCol === null || p[typeCol] === type))
      .reduce((s, p) => s + int(p[qty], `packageasts#${p.id}.${qty}`), 0)
  const sumHtr = (k: string) => htr.reduce((s, h) => s + int(h[k], `htrpackages#${h.id}.${k}`), 0)

  const imported = zeroLegacy()
  imported.spoolPaper = sumPa('packageImport', 'spool', 'spool_type', 'spool_paper')
  imported.spoolPlastic = sumPa('packageImport', 'spool', 'spool_type', 'spool_plastic')
  imported.spoolCPaper = sumPa('packageImport', 'spool', 'spool_type', 'spoolC_paper')
  imported.spoolCPlastic = sumPa('packageImport', 'spool', 'spool_type', 'spoolC_plastic')
  imported.spoolUnspecified = sumMat('spool') - imported.spoolPaper - imported.spoolPlastic - imported.spoolCPaper - imported.spoolCPlastic
  imported.sack = sumMat('sack')
  imported.box = sumMat('box')
  imported.palletWood = sumPa('packageImport', 'pallet', 'pallet_type', 'wood')
  imported.palletSteel = sumPa('packageImport', 'pallet', 'pallet_type', 'steel')
  imported.palletUnspecified = sumMat('pallet') - imported.palletWood - imported.palletSteel
  imported.paperBar = sumPa('packageImport', 'partition', null, null)

  const due = zeroLegacy()
  due.spoolPaper = sumPa('packageReturn', 'spool', 'spool_type', 'spool_paper')
  due.spoolPlastic = sumPa('packageReturn', 'spool', 'spool_type', 'spool_plastic')
  due.spoolCPaper = sumPa('packageReturn', 'spool', 'spool_type', 'spoolC_paper')
  due.spoolCPlastic = sumPa(bug ? 'packageImport' : 'packageReturn', 'spool', 'spool_type', 'spoolC_plastic')
  due.spoolUnspecified = sumPk('spool') - due.spoolPaper - due.spoolPlastic - due.spoolCPaper - due.spoolCPlastic
  due.sack = sumPk('sack')
  due.box = sumPk('box')
  due.palletWood = sumPa('packageReturn', 'pallet', 'pallet_type', 'wood')
  due.palletSteel = sumPa('packageReturn', 'pallet', 'pallet_type', 'steel')
  due.palletUnspecified = sumPk('pallet') - due.palletWood - due.palletSteel
  due.paperBar = sumPa('packageReturn', 'partition', null, null)

  const returned = zeroLegacy()
  returned.spoolPaper = sumHtr('spool_paper')
  returned.spoolPlastic = sumHtr('spool_plastic')
  returned.spoolCPaper = sumHtr('spoolC_paper')
  returned.spoolCPlastic = sumHtr('spoolC_plastic')
  returned.spoolUnspecified = sumHtr('spool')
  returned.sack = sumHtr('sack')
  returned.box = sumHtr('box')
  returned.palletWood = sumHtr('pallet_wood')
  returned.palletSteel = sumHtr('pallet_steel')
  returned.palletUnspecified = sumHtr('pallet')
  returned.paperBar = sumHtr('partition')

  const outstanding = Object.fromEntries(LEGACY_COLUMNS.map((k) => [k, due[k] - returned[k]])) as LegacyTotals
  return { imported, due, returned, outstanding }
}

export function addLegacy(a: LegacyRows, b: LegacyRows): LegacyRows {
  const add = (x: LegacyTotals, y: LegacyTotals) =>
    Object.fromEntries(LEGACY_COLUMNS.map((k) => [k, x[k] + y[k]])) as LegacyTotals
  return { imported: add(a.imported, b.imported), due: add(a.due, b.due), returned: add(a.returned, b.returned), outstanding: add(a.outstanding, b.outstanding) }
}
export const emptyLegacyRows = (): LegacyRows => ({ imported: zeroLegacy(), due: zeroLegacy(), returned: zeroLegacy(), outstanding: zeroLegacy() })

// ─── supplier resolution ─────────────────────────────────────────────────────

export interface SupplierRow { id: number; name: string }

export async function loadSuppliers(db: ClientBase): Promise<SupplierRow[]> {
  return (await db.query(`SELECT id, name FROM suppliers WHERE deleted_at IS NULL ORDER BY id`)).rows
}

/** legacy supplier_name → supplier id: exact (trimmed) name match, else the user's mapping file.
 *  Duplicate supplier names (e.g. ids 54/55) resolve to the lowest id; the summary treats a name as one company. */
export function resolveSupplier(name: string, suppliers: SupplierRow[], map: Record<string, number>): number | null {
  if (name in map) return map[name]
  const hit = suppliers.find((s) => s.name.trim() === name.trim())
  return hit ? hit.id : null
}

// ─── new-system summary + comparison ─────────────────────────────────────────

export type Totals = ColumnTotals
export interface NewRows { imported: Totals; due: Totals; returned: Totals; outstanding: Totals }

/** Column groups for the pass criteria. */
export const GROUPS: Record<string, ColumnKey[]> = {
  หลอด: ['spoolPaper', 'spoolPlastic', 'spoolCPaper', 'spoolCPlastic', 'spoolUnspecified'],
  กระสอบ: ['sackPlastic', 'sackJute', 'sackUnspecified'],
  พาเลท: ['palletWood', 'palletSteel', 'palletUnspecified'],
}
export const EXACT: ColumnKey[] = ['box', 'paperBar']

/** Legacy column → the new column(s) it corresponds to (sack is split in the new system). */
export const LEGACY_TO_NEW: Record<LegacyKey, ColumnKey[]> = {
  spoolPaper: ['spoolPaper'], spoolPlastic: ['spoolPlastic'], spoolCPaper: ['spoolCPaper'], spoolCPlastic: ['spoolCPlastic'],
  spoolUnspecified: ['spoolUnspecified'], sack: ['sackPlastic', 'sackJute', 'sackUnspecified'], box: ['box'],
  palletWood: ['palletWood'], palletSteel: ['palletSteel'], palletUnspecified: ['palletUnspecified'], paperBar: ['paperBar'],
}

/**
 * New-system summary for one company, limited to the legacy scope (materials before cutover,
 * obligations with legacyRef) so it is comparable with the legacy page. นำเข้า goes through the
 * same importedTotals() the summary route uses; the SQL mirrors the route's query.
 */
export async function newSummary(db: ClientBase, supplierName: string, supplierIds: number[]): Promise<NewRows> {
  const mats = await db.query(
    `SELECT m.spool, m.pallet, m.box, m.sack, m."paperBar", m."spoolType", m."palletType", m."sackType",
            pa.id "legacyId", pa.spool "lSpool", pa."spoolType" "lSpoolType", pa.pallet "lPallet", pa."palletType" "lPalletType",
            pa.sack "lSack", pa."sackType" "lSackType", pa.partition "lPartition"
       FROM materials m
       LEFT JOIN (SELECT DISTINCT ON (ref_id) * FROM packageasts WHERE "packageStatus" = 'packageImport' ORDER BY ref_id, id) pa
         ON pa.ref_id = m.id
      -- the company's names: current + renamed-from (same rule as src/lib/supplier-names.ts)
      WHERE m."supplierName" IN (
         SELECT name FROM suppliers WHERE id = ANY($1::int[]) AND deleted_at IS NULL
         UNION
         SELECT a.old_value FROM audit_logs a
          WHERE a.table_name = 'suppliers' AND a.field_name = 'name' AND a.old_value IS NOT NULL
            AND a.record_key = ANY($1::text[])
            AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.name = a.old_value AND s.deleted_at IS NULL AND NOT (s.id = ANY($1::int[])))) AND m."deletedAt" IS NULL AND m."createdAt" < $2`,
    [supplierIds, CUTOVER]
  )
  const imported = importedTotals(mats.rows.map((m) => ({
    spool: m.spool, pallet: m.pallet, box: m.box, sack: m.sack, paperBar: m.paperBar,
    spoolType: m.spoolType, palletType: m.palletType, sackType: m.sackType,
    legacy: m.legacyId == null ? null : {
      spool: m.lSpool, spoolType: m.lSpoolType, pallet: m.lPallet, palletType: m.lPalletType,
      sack: m.lSack, sackType: m.lSackType, partition: m.lPartition,
    },
  })))

  const due = emptyTotals()
  const returned = emptyTotals()
  const obl = await db.query(
    `SELECT category::text, variant, "qtyDue", "qtyReturned" FROM package_return_obligations
      WHERE "supplierId" = ANY($1::int[]) AND "sourceType" = 'MATERIAL_IMPORT' AND "needsSupplierAssignment" = false
        AND "deletedAt" IS NULL AND "legacyRef" IS NOT NULL`,
    [supplierIds]
  )
  for (const o of obl.rows) {
    const col = columnOf(o.category, o.variant)
    due[col] += o.qtyDue
    returned[col] += o.qtyReturned
  }
  const outstanding = Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c.key, due[c.key] - returned[c.key]])) as Totals
  return { imported, due, returned, outstanding }
}

export const sumOf = (t: Totals, keys: ColumnKey[]) => keys.reduce((s, k) => s + t[k], 0)

// ─── carry-forward plan: "ต้องส่งคืนต้องไม่เกินนำเข้า" (customer decision 2026-10-09) ─────────────
//
// A legacy ต้องส่งคืน is carried forward only when
//   ก) it links to a material that still exists. packageasts rows link by ref_id; packages rows
//      with no packageasts pair (before 2023-02-25) link by importStatus + created_at within
//      LINK_WINDOW_MS, any supplier name (names were often edited later), strictly closest hit
//   ข) it goes to that material's current company
//   ค) per material and group it is at most the material's own นำเข้า (all its sources added up)
//   ง) its subtypes are carved out of the material's นำเข้า split (carveDue)

export const LINK_WINDOW_MS = 30_000

/** Material columns the plan reads (read-only). Legacy scope = created before CUTOVER, deleted ones included. */
export interface PlanMaterial {
  id: number; supplierName: string; importStatus: string | null; createdAt: Date; deletedAt: Date | null
  spool: number | null; pallet: number | null; box: number | null; sack: number | null; paperBar: number | null
  spoolType: string | null; palletType: string | null; sackType: string | null
}

export async function loadPlanMaterials(db: ClientBase): Promise<PlanMaterial[]> {
  return (await db.query(
    `SELECT id, "supplierName", "importStatus", "createdAt", "deletedAt", spool, pallet, box, sack, "paperBar", "spoolType", "palletType", "sackType"
       FROM materials WHERE "createdAt" < $1 ORDER BY id`,
    [CUTOVER]
  )).rows
}

export interface DueSource {
  ref: string // "packageasts:<id>" | "packages:<id>"
  legacyName: string
  createdAt: Date
  due: ColumnTotals
  materialId: number | null
  link: 'ref_id' | 'time' | null
  linkSeconds: number | null // packages rows: seconds between the row and the linked material
}

export type DropReason = 'ใบรับเข้าถูกลบในระบบเดิม' | 'หาใบรับเข้าไม่พบ' | 'ใบรับเข้าถูกลบในระบบใหม่' | 'บริษัทของใบรับเข้าไม่อยู่ในระบบ'
export interface Dropped { reason: DropReason; source: DueSource; note: string }

export interface Cut {
  materialId: number; importStatus: string | null; company: string; group: string
  want: number; cap: number; cut: number
  duplicate: number // part of the cut explained by more than one legacy row on the same import
  edited: number // the rest: legacy quantity above the material's current quantity
  sources: string[]
}

export type Category = 'SPOOL' | 'SACK' | 'BOX' | 'PALLET' | 'PAPER_BAR'

export interface CarriedObligation {
  legacyRef: string // "material:<id>/<column>", unique per (legacyRef, category)
  materialId: number; supplierId: number; company: string
  col: ColumnKey; category: Category; variant: string | null
  qtyDue: number; createdAt: Date; sources: string[]
}

/** Summary column → obligation category + variant (inverse of columnOf). */
export function categoryOf(col: ColumnKey): { category: Category; variant: string | null } {
  const variants: Partial<Record<ColumnKey, string>> = {
    spoolPaper: 'spool_paper', spoolPlastic: 'spool_plastic', spoolCPaper: 'spoolC_paper', spoolCPlastic: 'spoolC_plastic',
    palletWood: 'wood', palletSteel: 'steel', sackPlastic: 'plastic', sackJute: 'p',
  }
  const category: Category = col.startsWith('spool') ? 'SPOOL' : col.startsWith('pallet') ? 'PALLET' : col.startsWith('sack') ? 'SACK' : col === 'box' ? 'BOX' : 'PAPER_BAR'
  return { category, variant: variants[col] ?? null }
}

export interface CarryPlan {
  sources: DueSource[]
  obligations: CarriedObligation[]
  dropped: Dropped[]
  cuts: Cut[]
  pairOf: Map<string, Row> // packages.id → its packageasts packageReturn row
  unpairedReturns: Row[]
  unpairedPackages: Row[]
  packageMaterial: Map<string, number | null> // packages.id → materials.id (stored in packages.materialId)
  companyOfMaterial: Map<number, string | null>
}

const sumGroup = (t: ColumnTotals, cols: ColumnKey[]) => cols.reduce((s, c) => s + t[c], 0)

export function planCarryForward(data: LegacyData, mats: PlanMaterial[], suppliers: SupplierRow[], map: Record<string, number>): CarryPlan {
  const matById = new Map(mats.map((m) => [m.id, m]))
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  const companyOfMaterial = new Map<number, string | null>()
  const supplierIdOfMaterial = new Map<number, number | null>()
  for (const m of mats) {
    const id = resolveSupplier(m.supplierName, suppliers, map)
    supplierIdOfMaterial.set(m.id, id)
    companyOfMaterial.set(m.id, id == null ? null : supplierById.get(id)!.name)
  }

  // pair packages ↔ packageasts packageReturn (same request in legacy MaterialController::store)
  const returns = data.packageasts.filter((p) => p.package_status === 'packageReturn')
  const pkgByName = new Map<string, Row[]>()
  for (const p of data.packages) pkgByName.set(p.supplier_name!, [...(pkgByName.get(p.supplier_name!) ?? []), p])
  const pairOf = new Map<string, Row>()
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

  const linkByTime = (p: Row): { id: number | null; seconds: number | null; note: string } => {
    const t = utc(p.created_at)!.getTime()
    const hits = mats
      .filter((m) => m.importStatus === p.package_status)
      .map((m) => ({ m, dt: (new Date(m.createdAt).getTime() - t) / 1000 }))
      .filter((x) => Math.abs(x.dt) * 1000 <= LINK_WINDOW_MS)
      .sort((a, b) => Math.abs(a.dt) - Math.abs(b.dt))
    if (!hits.length) return { id: null, seconds: null, note: `ไม่มีใบรับเข้าเลขที่ "${p.package_status}" ที่บันทึกภายใน ${LINK_WINDOW_MS / 1000} วินาที` }
    if (hits.length > 1 && Math.abs(hits[0].dt) === Math.abs(hits[1].dt)) return { id: null, seconds: null, note: `ใบรับเข้าที่เข้าเงื่อนไข ${hits.length} ใบ เวลาห่างเท่ากัน` }
    return { id: hits[0].m.id, seconds: hits[0].dt, note: '' }
  }

  const packageMaterial = new Map<string, number | null>()
  const sources: DueSource[] = []
  const dropped: Dropped[] = []
  const nonZero = (d: ColumnTotals) => SUMMARY_COLUMNS.some((c) => d[c.key] > 0)

  for (const r of returns) {
    const due = emptyTotals()
    due[columnOf('SPOOL', r.spool_type)] += int(r.spool, 'spool')
    due[columnOf('SACK', r.sack_type)] += int(r.sack, 'sack')
    due.box += int(r.box, 'box')
    due[columnOf('PALLET', r.pallet_type)] += int(r.pallet, 'pallet')
    due.paperBar += int(r.partition, 'partition')
    if (!nonZero(due)) continue
    const ref = int(r.ref_id, 'ref_id')
    const linked = matById.has(ref)
    const src: DueSource = { ref: `packageasts:${r.id}`, legacyName: r.supplier_name!, createdAt: utc(r.created_at)!, due, materialId: linked ? ref : null, link: linked ? 'ref_id' : null, linkSeconds: null }
    sources.push(src)
    if (!linked) dropped.push({ reason: 'ใบรับเข้าถูกลบในระบบเดิม', source: src, note: `ref_id ${ref} ไม่มีใน materials` })
  }
  for (const p of data.packages) {
    const pair = pairOf.get(p.id!)
    if (pair) { const ref = int(pair.ref_id, 'ref_id'); packageMaterial.set(p.id!, matById.has(ref) ? ref : null); continue }
    const hit = linkByTime(p)
    packageMaterial.set(p.id!, hit.id)
    const due = emptyTotals()
    due.spoolUnspecified += int(p.spool, 'spool'); due.sackUnspecified += int(p.sack, 'sack')
    due.box += int(p.box, 'box'); due.palletUnspecified += int(p.pallet, 'pallet')
    if (!nonZero(due)) continue
    const src: DueSource = { ref: `packages:${p.id}`, legacyName: p.supplier_name!, createdAt: utc(p.created_at)!, due, materialId: hit.id, link: hit.id == null ? null : 'time', linkSeconds: hit.seconds }
    sources.push(src)
    if (hit.id == null) dropped.push({ reason: 'หาใบรับเข้าไม่พบ', source: src, note: hit.note })
  }

  // per material: all its sources together, capped + carved out of its own นำเข้า split
  const firstImport = new Map<number, Row>()
  for (const p of data.packageasts.filter((x) => x.package_status === 'packageImport').sort((a, b) => int(a.id, 'id') - int(b.id, 'id')))
    if (!firstImport.has(int(p.ref_id, 'ref_id'))) firstImport.set(int(p.ref_id, 'ref_id'), p)
  const num = (v: string | null | undefined) => (v == null ? null : int(v, 'packageasts'))

  const byMaterial = new Map<number, DueSource[]>()
  for (const s of sources) if (s.materialId != null) byMaterial.set(s.materialId, [...(byMaterial.get(s.materialId) ?? []), s])

  const obligations: CarriedObligation[] = []
  const cuts: Cut[] = []
  for (const [mid, srcs] of [...byMaterial].sort((a, b) => a[0] - b[0])) {
    const m = matById.get(mid)!
    const company = companyOfMaterial.get(mid)
    if (m.deletedAt || company == null) {
      for (const s of srcs) dropped.push({ reason: m.deletedAt ? 'ใบรับเข้าถูกลบในระบบใหม่' : 'บริษัทของใบรับเข้าไม่อยู่ในระบบ', source: s, note: `material #${mid} ${m.supplierName}` })
      continue
    }
    const l = firstImport.get(mid)
    const imp = importSplit({
      spool: m.spool, pallet: m.pallet, box: m.box, sack: m.sack, paperBar: m.paperBar,
      spoolType: m.spoolType, palletType: m.palletType, sackType: m.sackType,
      legacy: l ? { spool: num(l.spool), spoolType: l.spool_type, pallet: num(l.pallet), palletType: l.pallet_type, sack: num(l.sack), sackType: l.sack_type, partition: num(l.partition) } : null,
    })
    const due = emptyTotals()
    for (const s of srcs) for (const c of SUMMARY_COLUMNS) due[c.key] += s.due[c.key]
    const { carried, cut } = carveDue(imp, due)
    for (const { group, cols } of COLUMN_GROUPS) {
      if (!cut[group]) continue
      const want = sumGroup(due, cols)
      const biggest = Math.max(...srcs.map((s) => sumGroup(s.due, cols)))
      const duplicate = Math.min(cut[group], want - biggest)
      cuts.push({ materialId: mid, importStatus: m.importStatus, company, group, want, cap: sumGroup(imp, cols), cut: cut[group], duplicate, edited: cut[group] - duplicate, sources: srcs.map((s) => s.ref) })
    }
    const createdAt = new Date(Math.min(...srcs.map((s) => s.createdAt.getTime())))
    for (const c of SUMMARY_COLUMNS) {
      if (carried[c.key] <= 0) continue
      obligations.push({
        legacyRef: `material:${mid}/${c.key}`, materialId: mid, supplierId: supplierIdOfMaterial.get(mid)!, company,
        col: c.key, ...categoryOf(c.key), qtyDue: carried[c.key], createdAt, sources: srcs.map((s) => s.ref),
      })
    }
  }

  return { sources, obligations, dropped, cuts, pairOf, unpairedReturns, unpairedPackages, packageMaterial, companyOfMaterial }
}
export const legacyAsNew = (t: LegacyTotals, keys: ColumnKey[]) =>
  LEGACY_COLUMNS.filter((lk) => LEGACY_TO_NEW[lk].some((k) => keys.includes(k))).reduce((s, lk) => s + t[lk], 0)
