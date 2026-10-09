// Keeps an import's package-return obligations in step with the import when it is edited
// (PATCH /api/warehouse/material/[id]) or deleted, so ต้องส่งคืน never exceeds นำเข้า and never
// drops below what was already returned (customer rule, 2026-10-09).
//
//  - obligations created in the new system (legacyRef null): qtyDue follows the import's
//    packaging exactly as at creation (buildImportObligationsData)
//  - carried-forward legacy obligations (legacyRef set): re-carved out of the import's new นำเข้า
//    split (carveDue) — they can shrink with the import, never grow past the legacy figure
//  - supplierName: obligations move to the new company, unless something was already returned
//  - any change that would put qtyDue below qtyReturned is refused (409), nothing is written

import type { Prisma } from '@/generated/prisma/client/client'
import { buildImportObligationsData, computeReturnStatus, PackageReturnError, resolveSupplierId } from './package-return-obligations'
import { SUMMARY_COLUMNS, carveDue, columnOf, emptyTotals, importSplit, type ColumnKey, type LegacyImportRow } from './package-return-columns'

type TxClient = Prisma.TransactionClient

export const OBLIGATION_AUDIT_TABLE = 'package_return_obligations'
export const obligationRecordKey = (id: number) => String(id)

/** Import packaging fields the obligations are derived from. */
export interface ImportPackaging {
  id: number
  spool: number | null
  pallet: number | null
  box: number | null
  sack: number | null
  paperBar: number | null
  spoolType: string | null
  palletType: string | null
  sackType: string | null
  returnSpool: boolean
  returnPallet: boolean
  returnBox: boolean
  returnSack: boolean
  returnPaperBar: boolean
}

export interface SyncObligation {
  id: number
  category: string
  variant: string | null
  qtyDue: number
  qtyReturned: number
  legacyRef: string | null
  createdAt: Date
  deletedAt: Date | null
}

export type SyncOp =
  | { kind: 'update'; id: number; qtyDue: number; before: number }
  | { kind: 'delete'; id: number; before: number }
  | { kind: 'revive'; id: number; qtyDue: number }
  | { kind: 'create'; category: string; variant: string | null; qtyDue: number; legacyRef: string | null; createdAt: Date | null }

const LABEL = Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c.key, `${c.group}${c.label ? ' ' + c.label : ''}`])) as Record<ColumnKey, string>

/** Summary column → obligation category + variant (inverse of columnOf). */
function categoryOf(col: ColumnKey): { category: string; variant: string | null } {
  const variants: Partial<Record<ColumnKey, string>> = {
    spoolPaper: 'spool_paper', spoolPlastic: 'spool_plastic', spoolCPaper: 'spoolC_paper', spoolCPlastic: 'spoolC_plastic',
    palletWood: 'wood', palletSteel: 'steel', sackPlastic: 'plastic', sackJute: 'p',
  }
  const category = col.startsWith('spool') ? 'SPOOL' : col.startsWith('pallet') ? 'PALLET' : col.startsWith('sack') ? 'SACK' : col === 'box' ? 'BOX' : 'PAPER_BAR'
  return { category, variant: variants[col] ?? null }
}

/**
 * Pure: what has to change on the import's obligations for its new packaging. `obligations` =
 * every MATERIAL_IMPORT obligation of the import, soft-deleted ones included (a carried-forward
 * row is revived rather than re-created, its (legacyRef, category) being unique).
 * Returns the ops, or `errors` (each one alone refuses the edit).
 */
export function planQuantitySync(
  material: ImportPackaging,
  legacyImport: LegacyImportRow | null,
  obligations: SyncObligation[]
): { ops: SyncOp[]; errors: string[] } {
  const ops: SyncOp[] = []
  const errors: string[] = []
  const live = obligations.filter((o) => o.deletedAt === null)
  const legacy = live.filter((o) => o.legacyRef !== null)

  if (legacy.length === 0) {
    // ── created in the new system: one obligation per category, qtyDue = the import's quantity ──
    const desired = buildImportObligationsData(material, null, false)
    const own = live.filter((o) => o.legacyRef === null)
    for (const category of ['PALLET', 'BOX', 'SACK', 'SPOOL', 'PAPER_BAR']) {
      const want = desired.find((d) => d.category === category)
      const have = own.filter((o) => o.category === category)
      const wantQty = want?.qtyDue ?? 0
      const haveQty = have.reduce((s, o) => s + o.qtyDue, 0)
      if (wantQty === haveQty) continue
      if (have.length === 0) {
        ops.push({ kind: 'create', category, variant: want!.variant ?? null, qtyDue: wantQty, legacyRef: null, createdAt: null })
        continue
      }
      shrinkOrGrow(have, wantQty, categoryLabel(category, have[0].variant), ops, errors)
    }
    return { ops, errors }
  }

  // ── carried forward from the legacy system: re-carve out of the import's new นำเข้า split ──
  const imp = importSplit({
    spool: material.spool, pallet: material.pallet, box: material.box, sack: material.sack, paperBar: material.paperBar,
    spoolType: material.spoolType, palletType: material.palletType, sackType: material.sackType, legacy: legacyImport,
  })
  const due = emptyTotals()
  for (const o of legacy) due[columnOf(o.category, o.variant)] += o.qtyDue
  const { carried } = carveDue(imp, due)
  const firstCreated = new Date(Math.min(...legacy.map((o) => o.createdAt.getTime())))
  for (const c of SUMMARY_COLUMNS) {
    const col = c.key
    const have = legacy.filter((o) => columnOf(o.category, o.variant) === col)
    const haveQty = have.reduce((s, o) => s + o.qtyDue, 0)
    if (carried[col] === haveQty) continue
    if (carried[col] > haveQty) {
      // the carve moved quantity into this column (e.g. typed → ไม่ระบุชนิด): one row per column
      const { category, variant } = categoryOf(col)
      const ref = `material:${material.id}/${col}`
      const add = carried[col] - haveQty
      const sameRef = obligations.find((o) => o.legacyRef === ref && o.category === category)
      if (sameRef && sameRef.deletedAt === null) ops.push({ kind: 'update', id: sameRef.id, qtyDue: sameRef.qtyDue + add, before: sameRef.qtyDue })
      else if (sameRef) ops.push({ kind: 'revive', id: sameRef.id, qtyDue: add })
      else ops.push({ kind: 'create', category, variant, qtyDue: add, legacyRef: ref, createdAt: firstCreated })
      continue
    }
    shrinkOrGrow(have, carried[col], LABEL[col], ops, errors)
  }
  return { ops, errors }
}

function categoryLabel(category: string, variant: string | null): string {
  return LABEL[columnOf(category, variant)]
}

/** Brings the rows of one column to `target`: growth goes to the oldest row, cuts come off the
 *  newest rows first, never below what each has returned; a row cut to 0 is soft-deleted. */
function shrinkOrGrow(rows: SyncObligation[], target: number, label: string, ops: SyncOp[], errors: string[]) {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
  const total = sorted.reduce((s, o) => s + o.qtyDue, 0)
  const returned = sorted.reduce((s, o) => s + o.qtyReturned, 0)
  if (target < returned) {
    errors.push(`${label}: ต้องส่งคืนจะเหลือ ${target} แต่คืนไปแล้ว ${returned} — ยกเลิกใบคืนที่เกินก่อน แล้วจึงแก้จำนวน`)
    return
  }
  if (target > total) {
    const o = sorted[0]
    ops.push({ kind: 'update', id: o.id, qtyDue: o.qtyDue + (target - total), before: o.qtyDue })
    return
  }
  let cut = total - target
  for (const o of sorted.reverse()) {
    if (cut <= 0) break
    const x = Math.min(cut, o.qtyDue - o.qtyReturned)
    if (x <= 0) continue
    cut -= x
    if (o.qtyDue - x === 0) ops.push({ kind: 'delete', id: o.id, before: o.qtyDue })
    else ops.push({ kind: 'update', id: o.id, qtyDue: o.qtyDue - x, before: o.qtyDue })
  }
}

const QTY_FIELDS = ['spool', 'pallet', 'box', 'sack', 'paperBar'] as const

/**
 * Inside the PATCH transaction, after the material row is updated: applies quantity and
 * company changes to the import's obligations. Throws PackageReturnError(409) on a refusal, so
 * the whole transaction (material edit included) rolls back.
 */
export async function syncImportObligations(
  tx: TxClient,
  before: ImportPackaging & { supplierName: string },
  after: ImportPackaging & { supplierName: string },
  changedBy: string
): Promise<void> {
  const qtyChanged = QTY_FIELDS.some((f) => before[f] !== after[f])
  const supplierChanged = before.supplierName !== after.supplierName
  if (!qtyChanged && !supplierChanged) return

  // lock this import's obligations so a concurrent ใบคืน can't allocate onto a row being cut
  await tx.$queryRaw`SELECT id FROM package_return_obligations WHERE "materialId" = ${after.id} AND "sourceType" = 'MATERIAL_IMPORT' FOR UPDATE`
  const all = await tx.packageReturnObligation.findMany({
    where: { materialId: after.id, sourceType: 'MATERIAL_IMPORT' },
    select: { id: true, category: true, variant: true, qtyDue: true, qtyReturned: true, legacyRef: true, createdAt: true, deletedAt: true, supplierId: true, needsSupplierAssignment: true },
  })
  const audit: Prisma.AuditLogCreateManyInput[] = []
  const log = (id: number, fieldName: string, oldValue: string | null, newValue: string | null) =>
    audit.push({ tableName: OBLIGATION_AUDIT_TABLE, recordKey: obligationRecordKey(id), fieldName, oldValue, newValue, changedBy })

  const target = await resolveSupplierId(tx, after.supplierName)

  if (supplierChanged) {
    const live = all.filter((o) => o.deletedAt === null)
    const names = new Map((await tx.supplier.findMany({
      where: { id: { in: [...new Set(live.map((o) => o.supplierId).filter((x): x is number => x !== null)), ...(target.supplierId ? [target.supplierId] : [])] } },
      select: { id: true, name: true },
    })).map((s) => [s.id, s.name]))
    const targetName = target.supplierId ? names.get(target.supplierId) : null
    // same company = same supplier name (the suppliers table has duplicate names, e.g. 54/55)
    const moving = live.filter((o) => (o.supplierId ? names.get(o.supplierId) : null) !== targetName || o.needsSupplierAssignment !== target.needsSupplierAssignment)
    const blocked = moving.filter((o) => o.qtyReturned > 0)
    if (blocked.length) {
      const list = blocked.map((o) => `${categoryLabel(o.category, o.variant)} คืนแล้ว ${o.qtyReturned}`).join(', ')
      throw new PackageReturnError(`เปลี่ยนบริษัทไม่ได้ — ใบรับเข้านี้มีการคืนบรรจุภัณฑ์ให้บริษัทเดิมแล้ว (${list}) ยกเลิกใบคืนเหล่านั้นก่อน`, 409)
    }
    for (const o of moving) {
      await tx.packageReturnObligation.update({ where: { id: o.id }, data: { supplierId: target.supplierId, needsSupplierAssignment: target.needsSupplierAssignment } })
      log(o.id, 'supplierId', o.supplierId === null ? null : String(o.supplierId), target.supplierId === null ? null : String(target.supplierId))
    }
  }

  if (qtyChanged) {
    const legacyRow = await tx.packageAst.findFirst({
      where: { refId: after.id, packageStatus: 'packageImport' },
      orderBy: { id: 'asc' },
      select: { spool: true, spoolType: true, pallet: true, palletType: true, sack: true, sackType: true, partition: true },
    })
    const { ops, errors } = planQuantitySync(after, legacyRow, all)
    if (errors.length) throw new PackageReturnError(`แก้จำนวนบรรจุภัณฑ์ไม่ได้ — ${errors.join('; ')}`, 409)
    const byId = new Map(all.map((o) => [o.id, o]))
    for (const op of ops) {
      if (op.kind === 'update') {
        const o = byId.get(op.id)!
        await tx.packageReturnObligation.update({ where: { id: op.id }, data: { qtyDue: op.qtyDue, status: computeReturnStatus(o.qtyReturned, op.qtyDue) } })
        log(op.id, 'qtyDue', String(op.before), String(op.qtyDue))
      } else if (op.kind === 'delete') {
        await tx.packageReturnObligation.update({ where: { id: op.id }, data: { deletedAt: new Date() } })
        log(op.id, 'deleted', String(op.before), null)
      } else if (op.kind === 'revive') {
        await tx.packageReturnObligation.update({ where: { id: op.id }, data: { deletedAt: null, qtyDue: op.qtyDue, qtyReturned: 0, status: 'PENDING' } })
        log(op.id, 'qtyDue', null, String(op.qtyDue))
      } else {
        const created = await tx.packageReturnObligation.create({
          data: {
            sourceType: 'MATERIAL_IMPORT', materialId: after.id, category: op.category as never, variant: op.variant,
            qtyDue: op.qtyDue, supplierId: target.supplierId, needsSupplierAssignment: target.needsSupplierAssignment,
            legacyRef: op.legacyRef, ...(op.createdAt && { createdAt: op.createdAt }),
            ...(op.legacyRef && { note: 'ยอดยกมาจากระบบเดิม (ย้ายช่องเมื่อแก้จำนวนในใบรับเข้า)' }),
          },
        })
        log(created.id, 'qtyDue', null, String(op.qtyDue))
      }
    }
  }

  if (audit.length) await tx.auditLog.createMany({ data: audit })
}

/**
 * Inside the DELETE transaction: an import's obligations go with it. Refused (409) when anything
 * was already returned against them — those ใบคืน must be cancelled first, otherwise the company
 * would keep a ต้องส่งคืน / คืนแล้ว with no นำเข้า behind it.
 */
export async function deleteImportObligations(tx: TxClient, materialId: number, changedBy: string): Promise<number> {
  await tx.$queryRaw`SELECT id FROM package_return_obligations WHERE "materialId" = ${materialId} AND "sourceType" = 'MATERIAL_IMPORT' FOR UPDATE`
  const live = await tx.packageReturnObligation.findMany({
    where: { materialId, sourceType: 'MATERIAL_IMPORT', deletedAt: null },
    select: { id: true, category: true, variant: true, qtyDue: true, qtyReturned: true },
  })
  const returned = live.filter((o) => o.qtyReturned > 0)
  if (returned.length) {
    const list = returned.map((o) => `${categoryLabel(o.category, o.variant)} คืนแล้ว ${o.qtyReturned}/${o.qtyDue}`).join(', ')
    throw new PackageReturnError(`ลบไม่ได้ — ใบรับเข้านี้มีการคืนบรรจุภัณฑ์แล้ว (${list}) ยกเลิกใบคืนเหล่านั้นก่อน`, 409)
  }
  if (!live.length) return 0
  const now = new Date()
  await tx.packageReturnObligation.updateMany({ where: { id: { in: live.map((o) => o.id) } }, data: { deletedAt: now } })
  await tx.auditLog.createMany({
    data: live.map((o) => ({ tableName: OBLIGATION_AUDIT_TABLE, recordKey: obligationRecordKey(o.id), fieldName: 'deleted', oldValue: String(o.qtyDue), newValue: null, changedBy })),
  })
  return live.length
}
