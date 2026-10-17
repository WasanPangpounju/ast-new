import { describe, expect, it } from 'vitest'
import { assignOrdersWholeRoll, type OrderCapacity } from './billOrders'

const cap = (id: number, remaining: number): OrderCapacity => ({ id, purchaseOrder: `SO${id}`, remaining })
const rolls = (...yards: number[]) => yards.map((yard, i) => ({ id: i + 1, yard }))
const ids = (out: { orderId: number | null }[]) => out.map(r => r.orderId)

describe('assignOrdersWholeRoll', () => {
  it('no orders → every roll unlinked', () => {
    expect(ids(assignOrdersWholeRoll(rolls(100, 100), []))).toEqual([null, null])
  })

  it('single order takes every roll, even past its capacity', () => {
    expect(ids(assignOrdersWholeRoll(rolls(100, 100, 100), [cap(1, 50)]))).toEqual([1, 1, 1])
  })

  it('fills order 1 then spills to order 2', () => {
    expect(ids(assignOrdersWholeRoll(rolls(100, 100, 100), [cap(1, 200), cap(2, 500)]))).toEqual([1, 1, 2])
  })

  it('a roll straddling the boundary stays whole on the order it starts in', () => {
    // order 1 has 150 → roll 2 starts at 100 (<150) so it stays on order 1
    const out = assignOrdersWholeRoll(rolls(100, 100, 100), [cap(1, 150), cap(2, 500)])
    expect(ids(out)).toEqual([1, 1, 2])
    expect(out.map(r => r.yard)).toEqual([100, 100, 100])
  })

  it('skips orders already full', () => {
    expect(ids(assignOrdersWholeRoll(rolls(100, 100), [cap(1, 0), cap(2, 100), cap(3, 100)]))).toEqual([2, 3])
  })

  it('overflow past the last order lands on the last order', () => {
    expect(ids(assignOrdersWholeRoll(rolls(100, 100, 100), [cap(1, 100), cap(2, 100)]))).toEqual([1, 2, 2])
  })

  it('keeps row count and fields unchanged', () => {
    const out = assignOrdersWholeRoll(rolls(10, 20), [cap(1, 5), cap(2, 5)])
    expect(out).toEqual([
      { id: 1, yard: 10, orderId: 1, purchaseOrder: 'SO1' },
      { id: 2, yard: 20, orderId: 2, purchaseOrder: 'SO2' },
    ])
  })
})
