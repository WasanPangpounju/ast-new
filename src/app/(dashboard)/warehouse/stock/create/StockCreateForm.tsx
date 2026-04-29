'use client'
import { useState, useEffect, useRef } from 'react'

const GROUPS = 8
const ROWS = 20
const TOTAL_SLOTS = GROUPS * ROWS

interface StockResult {
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  fabricCode: string | null
  customer: string
  produced_fold: number
}

interface FabricCodeOption {
  fabricCode: string
  fabricStruct: string
  fabricPattern: string
}

interface CustomerOption {
  id: number
  name: string
}

interface Props {
  emp: string
}

export default function StockCreateForm({ emp }: Props) {
  const [createDate, setCreateDate] = useState(new Date().toISOString().slice(0, 10))
  const [fabricStruct, setFabricStruct] = useState('')
  const [fabricPattern, setFabricPattern] = useState('')
  const [fabricW, setFabricW] = useState('')
  const [fabricCode, setFabricCode] = useState('')
  const [customer, setCustomer] = useState('')

  const [stockSearch, setStockSearch] = useState('')
  const [stockResults, setStockResults] = useState<StockResult[]>([])
  const [stockDropdown, setStockDropdown] = useState(false)

  const [fabricCodeResults, setFabricCodeResults] = useState<FabricCodeOption[]>([])
  const [fabricCodeDropdown, setFabricCodeDropdown] = useState(false)

  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([])
  const [customerDropdown, setCustomerDropdown] = useState(false)

  const [yards, setYards] = useState<string[]>(Array(TOTAL_SLOTS).fill(''))
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(TOTAL_SLOTS).fill(null))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!stockSearch) { setStockResults([]); return }
    const t = setTimeout(() => {
      fetch('/api/warehouse/stock/search?q=' + encodeURIComponent(stockSearch))
        .then(r => r.json())
        .then(d => setStockResults(d.results ?? []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [stockSearch])

  useEffect(() => {
    if (!customer) { setCustomerResults([]); return }
    const t = setTimeout(() => {
      fetch('/api/warehouse/customers?q=' + encodeURIComponent(customer))
        .then(r => r.json())
        .then(d => setCustomerResults(d.customers ?? []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [customer])

  useEffect(() => {
    if (!fabricCode) { setFabricCodeResults([]); return }
    const t = setTimeout(() => {
      fetch('/api/warehouse/stock/search?field=fabricCode&q=' + encodeURIComponent(fabricCode))
        .then(r => r.json())
        .then(d => setFabricCodeResults(d.results ?? []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [fabricCode])

  const setYard = (idx: number, val: string) => {
    setYards(prev => { const next = [...prev]; next[idx] = val; return next })
  }

  const yardNums = yards.map(v => parseFloat(v) || 0)
  const totalFold = yardNums.filter(v => v > 0).length
  const totalYard = yardNums.reduce((a, b) => a + b, 0)

  function resetForm() {
    setYards(Array(TOTAL_SLOTS).fill(''))
    setStockSearch('')
    setFabricStruct('')
    setFabricPattern('')
    setFabricW('')
    setFabricCode('')
    setCustomer('')
  }

  async function handleSave() {
    if (!fabricStruct || totalFold === 0) {
      alert('กรุณากรอกข้อมูลให้ครบ: โครงสร้างผ้า และหลาผ้าอย่างน้อย 1 ช่อง')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/warehouse/stock/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fabricStruct, fabricPattern, fabricW, fabricCode, customer: customer || 'AST', emp, createDate, yards }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'บันทึกไม่สำเร็จ')
      alert(`บันทึกสำเร็จ ${data.count} รายการ`)
      resetForm()
    } catch (err: unknown) {
      alert('เกิดข้อผิดพลาด: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 max-w-full">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">คีย์ผ้าเข้าสต็อก</h1>
        <p className="text-xs text-gray-500">บันทึกผ้าเข้าสต็อก</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">วันที่</label>
            <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Employee — read-only from session */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">พนักงาน</label>
            <div className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 text-gray-700">
              {emp || '-'}
            </div>
          </div>

          {/* Stock search */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">ตัดจากสต็อก (เลือกผ้า)</label>
            <input value={stockSearch}
              onChange={e => { setStockSearch(e.target.value); setStockDropdown(true) }}
              onFocus={() => { if (stockSearch) setStockDropdown(true) }}
              onBlur={() => setTimeout(() => setStockDropdown(false), 200)}
              placeholder="พิมพ์โครงสร้างผ้า, ลาย..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {stockDropdown && stockResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {stockResults.map((s, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => {
                      setStockSearch(s.fabricStruct + (s.fabricPattern ? ' / ' + s.fabricPattern : '') + ' ' + s.fabricW)
                      setFabricStruct(s.fabricStruct)
                      setFabricPattern(s.fabricPattern ?? '')
                      setFabricW(s.fabricW ?? '')
                      setFabricCode(s.fabricCode ?? '')
                      setCustomer(s.customer === 'AST' ? '' : s.customer)
                      setStockDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-gray-100 last:border-0">
                    <div className="font-medium text-gray-800">{s.fabricStruct}</div>
                    <div className="text-gray-500 flex gap-3 mt-0.5">
                      <span>{s.fabricPattern || '-'}</span>
                      <span>หน้า: {s.fabricW}</span>
                      <span className="text-blue-600">{Number(s.produced_fold).toLocaleString()} พับ</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fabric fields */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">โครงสร้างผ้า</label>
            <input value={fabricStruct} onChange={e => setFabricStruct(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="โครงสร้างผ้า" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ลายผ้า</label>
            <input value={fabricPattern} onChange={e => setFabricPattern(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ลายผ้า" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">หน้ากว้าง (นิ้ว)</label>
            <input value={fabricW} onChange={e => setFabricW(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="หน้ากว้าง" />
          </div>
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">รหัสผ้า</label>
            <input value={fabricCode}
              onChange={e => { setFabricCode(e.target.value); setFabricCodeDropdown(true) }}
              onFocus={() => { if (fabricCode) setFabricCodeDropdown(true) }}
              onBlur={() => setTimeout(() => setFabricCodeDropdown(false), 200)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น TC34/13065" />
            {fabricCodeDropdown && fabricCodeResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {fabricCodeResults.map((r, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => { setFabricCode(r.fabricCode); setFabricCodeDropdown(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-gray-100 last:border-0">
                    <div className="font-mono font-medium text-gray-800">{r.fabricCode}</div>
                    <div className="text-gray-500 mt-0.5">{r.fabricStruct}{r.fabricPattern ? ' / ' + r.fabricPattern : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customer autocomplete */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">ลูกค้า</label>
            <input value={customer}
              onChange={e => { setCustomer(e.target.value); setCustomerDropdown(true) }}
              onFocus={() => { if (customer) setCustomerDropdown(true) }}
              onBlur={() => setTimeout(() => setCustomerDropdown(false), 200)}
              placeholder="AST หรือชื่อลูกค้า..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {customerDropdown && customerResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {customerResults.map(c => (
                  <button key={c.id} type="button"
                    onMouseDown={() => { setCustomer(c.name); setCustomerDropdown(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {totalFold > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs">
            <span className="text-gray-500">จำนวนรวม:</span>
            <span className="font-semibold text-blue-700">{totalFold.toLocaleString()} พับ</span>
            <span className="font-semibold text-gray-700">{totalYard.toLocaleString(undefined, { maximumFractionDigits: 2 })} หลา</span>
          </div>
        )}
      </div>

      {/* Yards grid */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                {Array.from({ length: GROUPS }, (_, g) => (
                  <th key={g} colSpan={2} className="border border-gray-400 px-2 py-1 text-center bg-gray-100 font-medium text-gray-600 min-w-[90px]">
                    ลำดับ&nbsp;&nbsp;หลา
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, r) => (
                <tr key={r} className={r % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  {Array.from({ length: GROUPS }, (_, g) => {
                    const idx = g * ROWS + r
                    const slotNo = idx + 1
                    return (
                      <td key={g} colSpan={2} className="border border-gray-200 p-0">
                        <div className="flex items-center">
                          <span className="text-gray-400 text-xs w-7 text-right pr-1 select-none flex-shrink-0">{slotNo}</span>
                          <input
                            ref={el => { inputRefs.current[idx] = el }}
                            type="number"
                            min="0"
                            step="0.5"
                            value={yards[idx]}
                            onChange={e => setYard(idx, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const next = inputRefs.current[idx + 1]
                                if (next) next.focus()
                              }
                            }}
                            className="w-16 text-right text-xs border-0 outline-none py-1 px-1 focus:bg-yellow-50"
                          />
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-yellow-100 font-semibold border-t-2 border-gray-400">
                {Array.from({ length: GROUPS }, (_, g) => {
                  const groupSum = yards.slice(g * ROWS, (g + 1) * ROWS)
                    .reduce((s, v) => s + (parseFloat(v) || 0), 0)
                  return (
                    <td key={g} colSpan={2} className="border border-gray-400 px-2 py-1.5 text-center">
                      <div className="text-xs text-gray-500">รวม:</div>
                      <div className="text-sm font-bold text-gray-800">{groupSum > 0 ? groupSum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</div>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={resetForm}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
          ยกเลิก
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'บันทึกรายการถัดไป'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'บันทึกเสร็จสิ้น'}
        </button>
      </div>
    </div>
  )
}
