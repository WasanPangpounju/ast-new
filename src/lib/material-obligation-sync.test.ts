import { describe, expect, it } from 'vitest'
import { planQuantitySync, type ImportPackaging, type SyncObligation } from './material-obligation-sync'

const mat = (m: Partial<ImportPackaging>): ImportPackaging => ({
  id: 7, spool: null, pallet: null, box: null, sack: null, paperBar: null,
  spoolType: null, palletType: null, sackType: null,
  returnSpool: false, returnPallet: false, returnBox: false, returnSack: false, returnPaperBar: false, ...m,
})
let nextId = 1
const obl = (o: Partial<SyncObligation>): SyncObligation => ({
  id: nextId++, category: 'SPOOL', variant: null, qtyDue: 0, qtyReturned: 0, legacyRef: null,
  createdAt: new Date('2026-09-01T00:00:00Z'), deletedAt: null, ...o,
})

describe('planQuantitySync — obligations created in the new system', () => {
  it('quantity down: qtyDue follows the import', () => {
    const o = obl({ category: 'SPOOL', variant: 'spool_paper', qtyDue: 100, qtyReturned: 30 })
    const r = planQuantitySync(mat({ spool: 80, spoolType: 'spool_paper', returnSpool: true }), null, [o])
    expect(r.errors).toEqual([])
    expect(r.ops).toEqual([{ kind: 'update', id: o.id, qtyDue: 80, before: 100 }])
  })

  it('quantity up: qtyDue grows with the import', () => {
    const o = obl({ category: 'PALLET', variant: 'wood', qtyDue: 3 })
    const r = planQuantitySync(mat({ pallet: 5, palletType: 'wood', returnPallet: true }), null, [o])
    expect(r.ops).toEqual([{ kind: 'update', id: o.id, qtyDue: 5, before: 3 }])
  })

  it('below what was already returned → refused, nothing planned', () => {
    const o = obl({ category: 'BOX', qtyDue: 10, qtyReturned: 8 })
    const r = planQuantitySync(mat({ box: 5, returnBox: true }), null, [o])
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatch(/คืนไปแล้ว 8/)
  })

  it('quantity to 0 with nothing returned → obligation soft-deleted', () => {
    const o = obl({ category: 'SACK', variant: 'plastic', qtyDue: 4 })
    const r = planQuantitySync(mat({ sack: 0, sackType: 'plastic', returnSack: true }), null, [o])
    expect(r.ops).toEqual([{ kind: 'delete', id: o.id, before: 4 }])
  })

  it('returnable packaging that had no obligation (qty was 0) → created', () => {
    const r = planQuantitySync(mat({ box: 6, returnBox: true }), null, [])
    expect(r.ops).toEqual([{ kind: 'create', category: 'BOX', variant: null, qtyDue: 6, legacyRef: null, createdAt: null }])
  })

  it('packaging not marked returnable creates nothing', () => {
    expect(planQuantitySync(mat({ box: 6, returnBox: false }), null, []).ops).toEqual([])
  })
})

describe('planQuantitySync — carried forward from the legacy system', () => {
  const legacyRow = { spool: 1200, spoolType: 'spool_plastic', pallet: 4, palletType: 'steel', sack: null, sackType: null, partition: 44 }

  it('import edited down: carried due shrinks with it, capped at the import', () => {
    const plastic = obl({ category: 'SPOOL', variant: 'spool_plastic', qtyDue: 900, legacyRef: 'material:7/spoolPlastic' })
    const r = planQuantitySync(mat({ spool: 800, pallet: 3 }), legacyRow, [plastic])
    expect(r.errors).toEqual([])
    expect(r.ops).toEqual([{ kind: 'update', id: plastic.id, qtyDue: 800, before: 900 }])
  })

  it('import edited up: carried due never grows past the legacy figure', () => {
    const plastic = obl({ category: 'SPOOL', variant: 'spool_plastic', qtyDue: 900, legacyRef: 'material:7/spoolPlastic' })
    expect(planQuantitySync(mat({ spool: 2000, pallet: 3 }), legacyRow, [plastic]).ops).toEqual([])
  })

  it('edit below what was returned → refused', () => {
    const plastic = obl({ category: 'SPOOL', variant: 'spool_plastic', qtyDue: 900, qtyReturned: 850, legacyRef: 'material:7/spoolPlastic' })
    const r = planQuantitySync(mat({ spool: 800 }), legacyRow, [plastic])
    expect(r.errors[0]).toMatch(/กรวย พลาสติก/)
  })

  it('never creates new-system obligations on a legacy import', () => {
    const plastic = obl({ category: 'SPOOL', variant: 'spool_plastic', qtyDue: 900, legacyRef: 'material:7/spoolPlastic' })
    const r = planQuantitySync(mat({ spool: 900, box: 5, returnBox: true }), legacyRow, [plastic])
    expect(r.ops).toEqual([])
  })

  it('cuts come off the newest rows first and keep returned quantities', () => {
    const old = obl({ category: 'SPOOL', qtyDue: 300, qtyReturned: 300, legacyRef: 'packages:1', createdAt: new Date('2023-01-08T00:00:00Z') })
    const dup = obl({ category: 'SPOOL', qtyDue: 300, legacyRef: 'packages:2', createdAt: new Date('2023-01-08T00:00:05Z') })
    const r = planQuantitySync(mat({ spool: 300 }), null, [old, dup])
    expect(r.errors).toEqual([])
    expect(r.ops).toEqual([{ kind: 'delete', id: dup.id, before: 300 }])
  })

  it('a soft-deleted carried row of the same column is revived, not duplicated', () => {
    const typed = obl({ category: 'PALLET', variant: 'steel', qtyDue: 3, legacyRef: 'material:7/palletSteel' })
    const gone = obl({ category: 'PALLET', variant: null, qtyDue: 1, legacyRef: 'material:7/palletUnspecified', deletedAt: new Date() })
    // typed import shrinks to 2 (packageasts says 4 steel, material now 2 pallets) — steel keeps 2,
    // nothing moves to ไม่ระบุชนิด because the group's import is only 2
    const r = planQuantitySync(mat({ pallet: 2 }), { ...legacyRow, spool: null }, [typed, gone])
    expect(r.ops).toEqual([{ kind: 'update', id: typed.id, qtyDue: 2, before: 3 }])
  })
})
