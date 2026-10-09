// Packaging counts in the import edit form may be cleared to 0 (that also clears the import's
// ต้องส่งคืน): a blank field means "leave unchanged", any number — 0 included — is sent as is.
export function packagingQty(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? undefined : n
}
