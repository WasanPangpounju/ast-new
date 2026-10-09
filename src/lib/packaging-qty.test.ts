import { describe, expect, it } from 'vitest'
import { packagingQty } from './packaging-qty'

describe('packagingQty (import edit form)', () => {
  it('sends 0 as 0 — clearing pallet/box/sack is allowed', () => {
    expect(packagingQty('0')).toBe(0)
  })
  it('blank means unchanged', () => {
    expect(packagingQty('')).toBeUndefined()
    expect(packagingQty('  ')).toBeUndefined()
  })
  it('numbers pass through; negatives reach the API, which rejects them', () => {
    expect(packagingQty('12')).toBe(12)
    expect(packagingQty('-1')).toBe(-1)
  })
  it('not a number → unchanged', () => {
    expect(packagingQty('abc')).toBeUndefined()
  })
})
