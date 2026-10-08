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
import { SUMMARY_COLUMNS, columnOf, emptyTotals, importedTotals, type ColumnKey, type ColumnTotals } from '../../src/lib/package-return-columns'

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
      WHERE m."supplierName" = $1 AND m."deletedAt" IS NULL AND m."createdAt" < $2`,
    [supplierName, CUTOVER]
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
export const legacyAsNew = (t: LegacyTotals, keys: ColumnKey[]) =>
  LEGACY_COLUMNS.filter((lk) => LEGACY_TO_NEW[lk].some((k) => keys.includes(k))).reduce((s, lk) => s + t[lk], 0)
