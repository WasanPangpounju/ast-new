// Supplier renames vs. the import's free-text supplierName.
//
// materials.supplierName is the name picked when the import was keyed in; it is never rewritten
// (raw-material data, and stock pages group by it). When a supplier is renamed, the old name is
// kept as a rename row in audit_logs (table "suppliers", field "name"), and every name-based
// lookup of "which imports belong to this company" uses the current name plus those old names —
// so นำเข้า keeps matching ต้องส่งคืน (which follows supplierId) after a rename.
//
// An old name is ignored while a live supplier other than the company's own currently holds it
// (that supplier owns the name now). Renames that would make the owner of a name ambiguous —
// renaming one of several suppliers sharing a name, or taking a name another supplier uses — are
// refused in the supplier PUT route instead.

import type { Prisma } from '@/generated/prisma/client/client'

type TxClient = Prisma.TransactionClient

export const SUPPLIER_AUDIT_TABLE = 'suppliers'

/** Every supplierName that counts as this company's imports: the company's current name and the
 *  old names of its supplier ids, except names now held by another live supplier. */
export async function companyMaterialNames(tx: TxClient, ids: number[]): Promise<string[]> {
  const rows = await tx.$queryRaw<{ name: string }[]>`
    SELECT name FROM suppliers WHERE id = ANY(${ids}::int[]) AND deleted_at IS NULL
    UNION
    SELECT a.old_value AS name FROM audit_logs a
     WHERE a.table_name = ${SUPPLIER_AUDIT_TABLE} AND a.field_name = 'name' AND a.old_value IS NOT NULL
       AND a.record_key = ANY(${ids.map(String)}::text[])
       AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.name = a.old_value AND s.deleted_at IS NULL AND NOT (s.id = ANY(${ids}::int[])))
  `
  return rows.map((r) => r.name)
}

/** The live supplier a no-longer-current name was renamed away from, when exactly one is. */
export async function supplierIdByOldName(tx: TxClient, name: string): Promise<number | null> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT DISTINCT s.id FROM audit_logs a JOIN suppliers s ON s.id::text = a.record_key AND s.deleted_at IS NULL
     WHERE a.table_name = ${SUPPLIER_AUDIT_TABLE} AND a.field_name = 'name' AND a.old_value = ${name}
  `
  return rows.length === 1 ? rows[0].id : null
}
