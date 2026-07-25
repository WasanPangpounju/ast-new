import type { Prisma } from '@/generated/prisma/client/client'

type TxClient = Prisma.TransactionClient

/** Thrown for expected validation failures (not found, exceeds quota, already cancelled) —
 *  routes catch this and respond with `status`; anything else is an unexpected 500. */
export class PackageReturnError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'PackageReturnError'
  }
}

export function computeReturnStatus(qtyReturned: number, qtyDue: number): 'PENDING' | 'PARTIALLY_RETURNED' | 'RETURNED' {
  if (qtyReturned <= 0) return 'PENDING'
  if (qtyReturned >= qtyDue) return 'RETURNED'
  return 'PARTIALLY_RETURNED'
}

/** Exact-match (trimmed) lookup of Supplier by name — 100% of current Material/MaterialOutside
 *  supplierName values match a Supplier.name, but that isn't guaranteed for future free-text input,
 *  so an unmatched name falls back to needsSupplierAssignment instead of failing the transaction. */
export async function resolveSupplierId(
  tx: TxClient,
  supplierName: string | null | undefined
): Promise<{ supplierId: number | null; needsSupplierAssignment: boolean }> {
  const name = supplierName?.trim()
  if (!name) return { supplierId: null, needsSupplierAssignment: true }

  const supplier = await tx.supplier.findFirst({
    where: { name, deletedAt: null },
    select: { id: true },
  })

  return supplier
    ? { supplierId: supplier.id, needsSupplierAssignment: false }
    : { supplierId: null, needsSupplierAssignment: true }
}

interface PackagingSource {
  id: number
  pallet: number | null
  palletType?: string | null
  box: number | null
  sack: number | null
  sackType?: string | null
  spool: number | null
  spoolType?: string | null
  paperBar: number | null
  returnPallet: boolean
  returnBox: boolean
  returnSack: boolean
  returnSpool: boolean
  returnPaperBar: boolean
}

const CATEGORY_FIELDS = [
  { category: 'PALLET', qtyKey: 'pallet', flagKey: 'returnPallet', variantKey: 'palletType' },
  { category: 'BOX', qtyKey: 'box', flagKey: 'returnBox', variantKey: null },
  { category: 'SACK', qtyKey: 'sack', flagKey: 'returnSack', variantKey: 'sackType' },
  { category: 'SPOOL', qtyKey: 'spool', flagKey: 'returnSpool', variantKey: 'spoolType' },
  { category: 'PAPER_BAR', qtyKey: 'paperBar', flagKey: 'returnPaperBar', variantKey: null },
] as const

function buildObligationsData(
  source: PackagingSource,
  entityLabel: string,
  base: Pick<Prisma.PackageReturnObligationCreateManyInput, 'sourceType' | 'materialId' | 'materialOutsideId' | 'supplierId' | 'needsSupplierAssignment' | 'recipientName'>
): Prisma.PackageReturnObligationCreateManyInput[] {
  const data: Prisma.PackageReturnObligationCreateManyInput[] = []

  for (const { category, qtyKey, flagKey, variantKey } of CATEGORY_FIELDS) {
    if (!source[flagKey]) continue

    const qtyDue = source[qtyKey]
    if (!qtyDue || qtyDue <= 0) {
      console.warn(`[package-return-obligation] Skip ${category} for ${entityLabel}#${source.id}: qtyDue is ${qtyDue ?? 'null'}`)
      continue
    }

    data.push({
      ...base,
      category,
      variant: variantKey ? (source[variantKey] ?? null) : null,
      qtyDue,
    })
  }

  return data
}

export function buildImportObligationsData(
  material: PackagingSource,
  supplierId: number | null,
  needsSupplierAssignment: boolean
): Prisma.PackageReturnObligationCreateManyInput[] {
  return buildObligationsData(material, 'Material', {
    sourceType: 'MATERIAL_IMPORT',
    materialId: material.id,
    materialOutsideId: null,
    supplierId,
    needsSupplierAssignment,
    recipientName: null,
  })
}

export function buildOutsideObligationsData(
  outside: PackagingSource,
  recipientName: string | null
): Prisma.PackageReturnObligationCreateManyInput[] {
  return buildObligationsData(outside, 'MaterialOutside', {
    sourceType: 'MATERIAL_OUTSIDE',
    materialId: null,
    materialOutsideId: outside.id,
    supplierId: null,
    needsSupplierAssignment: false,
    recipientName,
  })
}
