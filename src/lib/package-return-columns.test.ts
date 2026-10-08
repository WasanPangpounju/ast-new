import { describe, expect, it } from 'vitest'
import { importedTotals, type ImportSource, type LegacyImportRow } from './package-return-columns'

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
