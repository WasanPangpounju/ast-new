// Field-level audit logging for `materials` rows (import history edit/delete) —
// stored in the generic AuditLog table, same as lib/billAudit.ts does for fabricouts.
// recordKey is the material's id, which never changes, so history stays reachable.
export const MATERIAL_AUDIT_TABLE = 'materials'
export const materialRecordKey = (id: number) => String(id)

/** Normalise a value to the string stored in AuditLog old/new columns (null stays null).
 *  importDate is compared/stored as YYYY-MM-DD so a Date and its input string match. */
export function auditValue(field: string, v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return field === 'importDate' ? v.toISOString().slice(0, 10) : v.toISOString()
  if (field === 'importDate') return String(v).slice(0, 10)
  return String(v)
}
