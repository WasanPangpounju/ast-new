import { describe, expect, it } from 'vitest'
import { carveDue, COLUMN_GROUPS, emptyTotals, importedTotals, importSplit, type ColumnTotals, type ImportSource, type LegacyImportRow } from './package-return-columns'

const material = (m: Partial<ImportSource>): ImportSource => ({
  spool: null, pallet: null, box: null, sack: null, paperBar: null,
  spoolType: null, palletType: null, sackType: null, legacy: null, ...m,
})
const legacy = (l: Partial<LegacyImportRow>): LegacyImportRow => ({
  spool: null, spoolType: null, pallet: null, palletType: null, sack: null, sackType: null, partition: null, ...l,
})

describe('importedTotals (นำเข้า row)', () => {
  it('uses the material own subtype (new-system material, no legacy row)', () => {
    const t = importedTotals([material({ spool: 20, spoolType: 'spool_paper', pallet: 3, palletType: 'wood', sack: 2, sackType: 'p', box: 9, paperBar: 6 })])
    expect(t).toMatchObject({ spoolPaper: 20, palletWood: 3, sackJute: 2, box: 9, paperBar: 6, spoolUnspecified: 0, palletUnspecified: 0, sackUnspecified: 0 })
  })

  it('legacy material without subtype and without packageasts row → ไม่ระบุชนิด', () => {
    const t = importedTotals([material({ spool: 100, pallet: 4, sack: 8, box: 1 })])
    expect(t).toMatchObject({ spoolUnspecified: 100, palletUnspecified: 4, sackUnspecified: 8, box: 1, paperBar: 0 })
  })

  it('legacy material takes subtype + qty from packageasts import row, paper bar from partition', () => {
    const t = importedTotals([material({
      spool: 1800, pallet: 10, sack: 50, box: 2,
      legacy: legacy({ spool: 1800, spoolType: 'spool_plastic', pallet: 10, palletType: 'steel', sack: 50, sackType: 'plastic', partition: 100 }),
    })])
    expect(t).toMatchObject({ spoolPlastic: 1800, spoolUnspecified: 0, palletSteel: 10, sackPlastic: 50, box: 2, paperBar: 100 })
  })

  it('material edited after import: packageasts qty smaller → remainder ไม่ระบุชนิด', () => {
    const t = importedTotals([material({ spool: 1000, legacy: legacy({ spool: 600, spoolType: 'spoolC_paper' }) })])
    expect(t).toMatchObject({ spoolCPaper: 600, spoolUnspecified: 400 })
  })

  it('packageasts qty larger than the material → capped, never negative ไม่ระบุชนิด', () => {
    const t = importedTotals([material({ spool: 500, pallet: 0, legacy: legacy({ spool: 700, spoolType: 'spool_paper', pallet: 5, palletType: 'wood' }) })])
    expect(t).toMatchObject({ spoolPaper: 500, spoolUnspecified: 0, palletWood: 0, palletUnspecified: 0 })
  })

  it('material own subtype wins over its packageasts row', () => {
    const t = importedTotals([material({ spool: 10, spoolType: 'spool_paper', legacy: legacy({ spool: 10, spoolType: 'spool_plastic' }) })])
    expect(t).toMatchObject({ spoolPaper: 10, spoolPlastic: 0 })
  })

  it('material paperBar wins over packageasts partition, including an explicit 0', () => {
    expect(importedTotals([material({ paperBar: 0, legacy: legacy({ partition: 55 }) })]).paperBar).toBe(0)
    expect(importedTotals([material({ paperBar: 7, legacy: legacy({ partition: 55 }) })]).paperBar).toBe(7)
  })

  it('packageasts row with no subtype → ไม่ระบุชนิด; unknown subtype → ไม่ระบุชนิด', () => {
    const t = importedTotals([
      material({ sack: 12, legacy: legacy({ sack: 12, sackType: null }) }),
      material({ pallet: 3, legacy: legacy({ pallet: 3, palletType: 'plastic' }) }),
    ])
    expect(t).toMatchObject({ sackUnspecified: 12, palletUnspecified: 3 })
  })

  it('sums several materials and keeps group totals equal to the materials totals', () => {
    const rows = [
      material({ spool: 300, legacy: legacy({ spool: 200, spoolType: 'spool_paper' }) }),
      material({ spool: 50, spoolType: 'spool_plastic' }),
      material({ spool: 25 }),
    ]
    const t = importedTotals(rows)
    expect(t.spoolPaper + t.spoolPlastic + t.spoolCPaper + t.spoolCPlastic + t.spoolUnspecified).toBe(375)
    expect(t).toMatchObject({ spoolPaper: 200, spoolPlastic: 50, spoolUnspecified: 125 })
  })
})

const totals = (t: Partial<ColumnTotals>): ColumnTotals => ({ ...emptyTotals(), ...t })

describe('importSplit (one material)', () => {
  it('equals importedTotals of that material alone', () => {
    const m = material({ spool: 900, pallet: 3, legacy: legacy({ spool: 1200, spoolType: 'spool_plastic', pallet: 4, palletType: 'steel', partition: 44 }) })
    expect(importSplit(m)).toEqual(importedTotals([m]))
    expect(importSplit(m)).toMatchObject({ spoolPlastic: 900, palletSteel: 3, paperBar: 44 })
  })
})

describe('COLUMN_GROUPS', () => {
  it('lists every summary column once, ไม่ระบุชนิด last in its group', () => {
    const all = COLUMN_GROUPS.flatMap((g) => g.cols)
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(Object.keys(emptyTotals()).length)
    expect(COLUMN_GROUPS.find((g) => g.group === 'หลอด')!.cols.at(-1)).toBe('spoolUnspecified')
  })
})

describe('carveDue (ต้องส่งคืนต้องไม่เกินนำเข้า)', () => {
  it('due within the import split is carried as is', () => {
    const r = carveDue(totals({ spoolPlastic: 1200, paperBar: 44 }), totals({ spoolPlastic: 1200, paperBar: 44 }))
    expect(r.carried).toMatchObject({ spoolPlastic: 1200, paperBar: 44 })
    expect(r.cut).toEqual({})
  })

  it('material edited down after import (#2775): capped at the material, cut reported per group', () => {
    const imp = totals({ spoolPlastic: 900, palletSteel: 3, paperBar: 44 })
    const r = carveDue(imp, totals({ spoolPlastic: 1200, palletSteel: 4, paperBar: 44 }))
    expect(r.carried).toMatchObject({ spoolPlastic: 900, palletSteel: 3, paperBar: 44 })
    expect(r.cut).toEqual({ หลอด: 300, พาเลท: 1 })
  })

  it('typed due beyond the typed import goes to ไม่ระบุชนิด when the material has room there', () => {
    const r = carveDue(totals({ spoolPlastic: 900, spoolUnspecified: 300 }), totals({ spoolPlastic: 1200 }))
    expect(r.carried).toMatchObject({ spoolPlastic: 900, spoolUnspecified: 300 })
    expect(r.cut).toEqual({})
  })

  it('untyped due (packages-only row) takes ไม่ระบุชนิด first, then the typed columns of the import', () => {
    const r = carveDue(totals({ spoolUnspecified: 100, spoolPaper: 50 }), totals({ spoolUnspecified: 140 }))
    expect(r.carried).toMatchObject({ spoolUnspecified: 100, spoolPaper: 40 })
  })

  it('subtype mismatch between import and return rows follows the import', () => {
    const r = carveDue(totals({ palletWood: 3 }), totals({ palletSteel: 3 }))
    expect(r.carried).toMatchObject({ palletWood: 3, palletSteel: 0 })
  })

  it('duplicate legacy rows on one material are capped together (#168: 1200 + 1200 on a 1200 import)', () => {
    const r = carveDue(totals({ spoolUnspecified: 1200, sackUnspecified: 100 }), totals({ spoolUnspecified: 2400, sackUnspecified: 200 }))
    expect(r.carried).toMatchObject({ spoolUnspecified: 1200, sackUnspecified: 100 })
    expect(r.cut).toEqual({ หลอด: 1200, กระสอบ: 100 })
  })

  it('nothing imported in a group → nothing carried there', () => {
    const r = carveDue(totals({}), totals({ box: 15, paperBar: 55 }))
    expect(r.carried).toEqual(emptyTotals())
    expect(r.cut).toEqual({ กล่อง: 15, กระดาษกั้น: 55 })
  })

  it('never carries more than the import in any column', () => {
    const imp = totals({ spoolPaper: 10, spoolPlastic: 5, spoolUnspecified: 2, sackJute: 4, palletWood: 1 })
    const due = totals({ spoolPlastic: 30, spoolCPaper: 7, sackPlastic: 9, palletSteel: 6 })
    const { carried } = carveDue(imp, due)
    for (const k of Object.keys(imp) as (keyof ColumnTotals)[]) expect(carried[k]).toBeLessThanOrEqual(imp[k])
  })
})
