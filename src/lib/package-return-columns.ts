// Column layout + allocation rules for the supplier-level package return (ใบคืน), shared by
// the confirm modal (client preview) and POST /package-returns/receipts (authoritative).
// No server imports — this file is bundled into the client.

/** 11 summary columns, in the legacy Laravel page's order (package/create.blade.php). */
export const SUMMARY_COLUMNS = [
  { key: 'spoolPaper', group: 'หลอด', label: 'กรวย กระดาษ' },
  { key: 'spoolPlastic', group: 'หลอด', label: 'กรวย พลาสติก' },
  { key: 'spoolCPaper', group: 'หลอด', label: 'กระบอก กระดาษ' },
  { key: 'spoolCPlastic', group: 'หลอด', label: 'กระบอก พลาสติก' },
  { key: 'spoolUnspecified', group: 'หลอด', label: 'ไม่ระบุชนิด' },
  { key: 'sackPlastic', group: 'กระสอบ', label: 'พลาสติก' },
  { key: 'sackJute', group: 'กระสอบ', label: 'ปอ' },
  // shown only when non-zero — new imports always carry a sack type; only legacy rows lack one
  { key: 'sackUnspecified', group: 'กระสอบ', label: 'ไม่ระบุชนิด', hideWhenZero: true },
  { key: 'box', group: 'กล่อง', label: '' },
  { key: 'palletWood', group: 'พาเลท', label: 'ไม้' },
  { key: 'palletSteel', group: 'พาเลท', label: 'เหล็ก' },
  { key: 'palletUnspecified', group: 'พาเลท', label: 'ไม่ระบุชนิด' },
  { key: 'paperBar', group: 'กระดาษกั้น', label: '' },
] as const

export type ColumnKey = (typeof SUMMARY_COLUMNS)[number]['key']
export type ColumnTotals = Record<ColumnKey, number>

type UnspecifiedKey = 'spoolUnspecified' | 'palletUnspecified' | 'sackUnspecified'

/** 9 form fields, in the legacy form's order. Field keys double as PackageReturnReceipt columns
 *  and as the summary column they return against. `fallback` = the "ไม่ระบุชนิด" column that
 *  absorbs the overflow once the typed column's outstanding is used up. */
export const RETURN_FIELDS = [
  { key: 'palletWood', label: 'พาเลทไม้', fallback: 'palletUnspecified' },
  { key: 'palletSteel', label: 'พาเลทเหล็ก', fallback: 'palletUnspecified' },
  { key: 'box', label: 'กล่อง', fallback: null },
  { key: 'sackPlastic', label: 'กระสอบพลาสติก', fallback: 'sackUnspecified' },
  { key: 'sackJute', label: 'กระสอบปอ', fallback: 'sackUnspecified' },
  { key: 'paperBar', label: 'กระดาษกั้น', fallback: null },
  { key: 'spoolPaper', label: 'กรวยกระดาษ', fallback: 'spoolUnspecified' },
  { key: 'spoolPlastic', label: 'กรวยพลาสติก', fallback: 'spoolUnspecified' },
  { key: 'spoolCPaper', label: 'กระบอกกระดาษ', fallback: 'spoolUnspecified' },
  { key: 'spoolCPlastic', label: 'กระบอกพลาสติก', fallback: 'spoolUnspecified' },
] as const satisfies readonly { key: ColumnKey; label: string; fallback: UnspecifiedKey | null }[]

export type FieldKey = (typeof RETURN_FIELDS)[number]['key']
export type FieldQty = Record<FieldKey, number>

const UNSPECIFIED_LABEL: Record<UnspecifiedKey, string> = {
  spoolUnspecified: 'หลอดไม่ระบุชนิด',
  palletUnspecified: 'พาเลทไม่ระบุชนิด',
  sackUnspecified: 'กระสอบไม่ระบุชนิด',
}

export function emptyTotals(): ColumnTotals {
  return Object.fromEntries(SUMMARY_COLUMNS.map((c) => [c.key, 0])) as ColumnTotals
}

/** Which summary column an obligation / material row counts toward. Unknown or missing
 *  subtypes of SPOOL/PALLET/SACK land in that group's "ไม่ระบุชนิด" column. */
export function columnOf(category: string, variant: string | null | undefined): ColumnKey {
  switch (category) {
    case 'SPOOL':
      if (variant === 'spool_paper') return 'spoolPaper'
      if (variant === 'spool_plastic') return 'spoolPlastic'
      if (variant === 'spoolC_paper') return 'spoolCPaper'
      if (variant === 'spoolC_plastic') return 'spoolCPlastic'
      return 'spoolUnspecified'
    case 'PALLET':
      if (variant === 'wood') return 'palletWood'
      if (variant === 'steel') return 'palletSteel'
      return 'palletUnspecified'
    case 'SACK':
      if (variant === 'plastic') return 'sackPlastic'
      if (variant === 'p') return 'sackJute' // 'p' = ปอ (jute), the value the import/outside forms store
      return 'sackUnspecified'
    case 'BOX':
      return 'box'
    default:
      return 'paperBar'
  }
}

export interface AllocationLine {
  field: FieldKey
  label: string
  qty: number
  fromTyped: number
  fromUnspecified: number
  unspecifiedLabel: string | null
}

/** Splits each field's qty into the part taken from its own column and the overflow taken from
 *  "ไม่ระบุชนิด". Returns an error per over-return (field without fallback, or a fallback group
 *  whose combined overflow exceeds the unspecified outstanding) — any error means reject. */
export function planAllocation(qty: FieldQty, outstanding: ColumnTotals): { lines: AllocationLine[]; errors: string[] } {
  const lines: AllocationLine[] = []
  const errors: string[] = []
  const overflowByFallback = new Map<UnspecifiedKey, AllocationLine[]>()

  for (const f of RETURN_FIELDS) {
    const q = qty[f.key] ?? 0
    if (q <= 0) continue
    const fromTyped = Math.min(q, Math.max(0, outstanding[f.key]))
    const overflow = q - fromTyped
    const line: AllocationLine = {
      field: f.key,
      label: f.label,
      qty: q,
      fromTyped,
      fromUnspecified: overflow,
      unspecifiedLabel: f.fallback ? UNSPECIFIED_LABEL[f.fallback] : null,
    }
    lines.push(line)
    if (overflow <= 0) continue
    if (!f.fallback) {
      errors.push(`${f.label}: คืน ${q} เกินยอดคงค้าง (คงค้างเหลือ ${outstanding[f.key]})`)
      continue
    }
    overflowByFallback.set(f.fallback, [...(overflowByFallback.get(f.fallback) ?? []), line])
  }

  for (const [fallback, group] of overflowByFallback) {
    const totalOverflow = group.reduce((s, l) => s + l.fromUnspecified, 0)
    const available = Math.max(0, outstanding[fallback])
    if (totalOverflow <= available) continue
    const detail = group.map((l) => `${l.label} คืน ${l.qty} คงค้างเหลือ ${l.fromTyped}`).join(', ')
    errors.push(
      `${detail} — ส่วนเกินรวม ${totalOverflow} เกินยอด${UNSPECIFIED_LABEL[fallback]}คงค้างเหลือ ${available}`
    )
  }

  return { lines, errors }
}
