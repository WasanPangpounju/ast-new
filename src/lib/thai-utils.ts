/**
 * Thai/Buddhist calendar utilities for AST Manufacturing system
 * Full implementation comes in the next step
 */

export type SoVatType = 'SO' | 'SOX' | 'SOB'
export type VatInvoiceType = 'A' | 'B' | 'C'

/** Convert CE year to Buddhist Era year (CE + 543) */
export function toBuddhistYear(ceYear: number): number {
  return ceYear + 543
}

/** Convert Buddhist Era year to CE year (BE - 543) */
export function fromBuddhistYear(beYear: number): number {
  return beYear - 543
}

/** Get compact year used in SO numbers: CE year - 1957 */
export function toSoYear(ceYear: number): number {
  return ceYear - 1957
}

/** Format date as Thai display string DD/MM/YYYY (Buddhist year) */
export function formatThaiDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = toBuddhistYear(date.getFullYear())
  return `${d}/${m}/${y}`
}

/** Generate a random refId matching Laravel's base64_encode(random_bytes(32)) */
export function generateRefId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** Parse SO number string into components */
export function parseSoNumber(so: string): {
  prefix: string; year: number; month: number; seq: number
} | null {
  const match = so.match(/^(SOB|SO)(\d{2})(\d{2})\/(\d+)$/)
  if (!match) return null
  return {
    prefix: match[1],
    year: Number(match[2]) + 1957,    // compact year back to CE
    month: Number(match[3]),
    seq: Number(match[4]),
  }
}
