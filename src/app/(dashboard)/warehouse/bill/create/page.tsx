'use client'
import { useState, useEffect, useRef } from 'react'

const GROUPS = 8
const ROWS = 20
const TOTAL_SLOTS = GROUPS * ROWS

interface StockResult {
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  customer: string
  produced_fold: number
  produced_yard: number
}

interface CustomerOption {
  id: number
  name: string
}

export default function BillCreatePage() {
  // Bill header
  const [billType, setBillType] = useState('A')
  const [billNo, setBillNo] = useState('')
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10))
  const [remark, setRemark] = useState('ได้รับผ้าตามรายการข้างบนนี้ไว้ถูกต้องและเรียบร้อยแล้ว')

  // Stock search
  const [stockSearch, setStockSearch] = useState('')
  const [stockResults, setStockResults] = useState<StockResult[]>([])
  const [stockDropdown, setStockDropdown] = useState(false)

  // Fabric fields (auto-filled, editable)
  const [fabricStruct, setFabricStruct] = useState('')
  const [fabricPattern, setFabricPattern] = useState('')
  const [fabricW, setFabricW] = useState('')

  // Customer (ผู้สั่ง)
  const [orderer, setOrderer] = useState('')
  const [ordererResults, setOrdererResults] = useState<CustomerOption[]>([])
  const [ordererDropdown, setOrdererDropdown] = useState(false)

  // Receiver (ผู้รับ)
  const [receiver, setReceiver] = useState('')

  // Deposit options
  const [isDeposit, setIsDeposit] = useState(false)
  const [altFabricStruct, setAltFabricStruct] = useState('')
  const [altPurchaseOrder, setAltPurchaseOrder] = useState('')

  // Pre-fill from order navigation
  const [purchaseOrderParam, setPurchaseOrderParam] = useState('')

  // Yards grid
  const [yards, setYards] = useState<string[]>(Array(TOTAL_SLOTS).fill(''))
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(TOTAL_SLOTS).fill(null))
  const [saving, setSaving] = useState(false)

  // Pre-fill from order query params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('customerName')) {
      setOrderer(p.get('customerName')!)
      setReceiver(p.get('customerName')!)
    }
    if (p.get('fabricStruct')) setFabricStruct(p.get('fabricStruct')!)
    if (p.get('fabricPattern')) setFabricPattern(p.get('fabricPattern')!)
    if (p.get('purchaseOrder')) setPurchaseOrderParam(p.get('purchaseOrder')!)
  }, [])

  // Auto-fill billNo when type changes
  useEffect(() => {
    fetch('/api/warehouse/bill/next-vatno?type=' + billType)
      .then(r => r.json())
      .then(d => { if (d.nextNo) setBillNo(String(d.nextNo)) })
      .catch(() => {})
  }, [billType])

  // Stock search debounce
  useEffect(() => {
    if (!stockSearch || stockSearch.length < 1) { setStockResults([]); return }
    const t = setTimeout(() => {
      fetch('/api/warehouse/stock/search?q=' + encodeURIComponent(stockSearch))
        .then(r => r.json())
        .then(d => setStockResults(d.results ?? []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [stockSearch])

  // Customer search debounce
  useEffect(() => {
    if (!orderer || orderer.length < 1) { setOrdererResults([]); return }
    const t = setTimeout(() => {
      fetch('/api/warehouse/customers?q=' + encodeURIComponent(orderer))
        .then(r => r.json())
        .then(d => setOrdererResults(d.customers ?? []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [orderer])

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
    setOrderer('')
    setReceiver('')
    setIsDeposit(false)
    setAltFabricStruct('')
    setAltPurchaseOrder('')
  }

  async function handleSave() {
    if (!billType || !orderer || totalFold === 0) {
      alert('กรุณากรอกข้อมูลให้ครบ: ประเภทบิล, ผู้สั่ง, และหลาผ้าอย่างน้อย 1 ช่อง')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/warehouse/bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vatType: billType,
          vatNo: Number(billNo),
          customerName: orderer,
          receiveName: receiver || orderer,
          fabricStruct,
          fabricPattern,
          fabricW,
          createDate: billDate,
          yards,
          isDeposit,
          altFabricStruct,
          altPurchaseOrder,
          purchaseOrder: purchaseOrderParam || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'บันทึกไม่สำเร็จ')
      alert(`บันทึกสำเร็จ ${data.count} รายการ บิลเลขที่ ${data.vatNo}`)
      resetForm()
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 max-w-full">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">เปิดบิลผ้า</h1>
        <p className="text-xs text-gray-500">สร้างบิลส่งผ้าใหม่</p>
      </div>

      {/* Header form */}
      <div className="bg-white border border-gray-200 shadow-sm p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Bill type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ประเภทบิล</label>
            <select value={billType} onChange={e => setBillType(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>

          {/* Bill number */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">เลขที่บิล</label>
            <input value={billNo} onChange={e => setBillNo(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เลขที่บิล" />
          </div>

          {/* Bill date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">วันที่</label>
            <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Stock search - full width */}
          <div className="md:col-span-3 relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">ตัดจากสต็อก (เลือกรายการ)</label>
            <input
              value={stockSearch}
              onChange={e => { setStockSearch(e.target.value); setStockDropdown(true) }}
              onFocus={() => { if (stockSearch) setStockDropdown(true) }}
              onBlur={() => setTimeout(() => setStockDropdown(false), 200)}
              placeholder="พิมพ์โครงสร้างผ้า, ลาย, หรือหน้ากว้าง..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {stockDropdown && stockResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-64 overflow-y-auto">
                {stockResults.map((s, i) => (
                  <button key={i} type="button"
                    onMouseDown={() => {
                      setStockSearch(s.fabricStruct + (s.fabricPattern ? ' / ' + s.fabricPattern : '') + ' ' + s.fabricW)
                      setFabricStruct(s.fabricStruct)
                      setFabricPattern(s.fabricPattern ?? '')
                      setFabricW(s.fabricW ?? '')
                      setStockDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-gray-100 last:border-0">
                    <div className="font-medium text-gray-800">{s.fabricStruct}</div>
                    <div className="text-gray-500 flex gap-3 mt-0.5">
                      <span>{s.fabricPattern || '-'}</span>
                      <span>หน้า: {s.fabricW}</span>
                      <span className="text-blue-600">ผลิตแล้ว: {Number(s.produced_fold).toLocaleString()} พับ</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fabric fields - auto-filled, editable */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">โครงสร้างผ้า</label>
            <input value={fabricStruct} onChange={e => setFabricStruct(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="โครงสร้างผ้า" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ลายผ้า</label>
            <input value={fabricPattern} onChange={e => setFabricPattern(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ลายผ้า" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">หน้ากว้าง (นิ้ว)</label>
            <input value={fabricW} onChange={e => setFabricW(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="หน้ากว้าง" />
          </div>

          {/* Orderer with autocomplete */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">ผู้สั่ง (Order by)</label>
            <input
              value={orderer}
              onChange={e => {
                setOrderer(e.target.value)
                setReceiver(e.target.value)
                setOrdererDropdown(true)
              }}
              onFocus={() => { if (orderer) setOrdererDropdown(true) }}
              onBlur={() => setTimeout(() => setOrdererDropdown(false), 200)}
              placeholder="พิมพ์ชื่อลูกค้า..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {ordererDropdown && ordererResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {ordererResults.map(c => (
                  <button key={c.id} type="button"
                    onMouseDown={() => {
                      setOrderer(c.name)
                      setReceiver(c.name)
                      setOrdererDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0">
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Receiver - editable, auto-filled from orderer */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ผู้รับ (Received by)</label>
            <input
              value={receiver}
              onChange={e => setReceiver(e.target.value)}
              placeholder="ชื่อผู้รับ (ถ้าต่างจากผู้สั่ง แก้ได้)"
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Remark */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <input value={remark} onChange={e => setRemark(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Extra options */}
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isDeposit} onChange={e => setIsDeposit(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-700">ฝากจัดเก็บ</span>
            <span className="text-xs text-gray-400">(จะแสดงในสต็อกผ้าฝากจัดเก็บ)</span>
          </label>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">แทนโครงสร้างผ้า (ถ้ามี)</label>
            <input value={altFabricStruct} onChange={e => setAltFabricStruct(e.target.value)}
              placeholder="ใช้แทนโครงสร้างผ้าจริงในพิมพ์บิล..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">แทนผู้สั่งซื้อ (ถ้ามี)</label>
            <input value={altPurchaseOrder} onChange={e => setAltPurchaseOrder(e.target.value)}
              placeholder="ใช้แทนผู้สั่งซื้อจริงในพิมพ์บิล..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Summary bar */}
        {totalFold > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs">
            <span className="text-gray-500">สรุป:</span>
            <span className="font-semibold text-blue-700">{totalFold.toLocaleString()} พับ</span>
            <span className="font-semibold text-gray-700">{totalYard.toLocaleString(undefined, {maximumFractionDigits:2})} หลา</span>
          </div>
        )}
      </div>

      {/* Yards grid */}
      <div className="bg-white border border-gray-200 shadow-sm overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {Array.from({ length: GROUPS }, (_, g) => (
                  <th key={g} colSpan={2} className="border border-gray-400 px-2 py-1 text-center bg-gray-100 font-medium text-gray-600">
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
                            className="w-full text-right text-xs border-0 outline-none py-1 px-1 focus:bg-yellow-50"
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

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={resetForm}
          className="px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50 text-gray-600">
          ล้างฟอร์ม
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'บันทึกรายการถัดไป'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'บันทึกเสร็จสิ้น'}
        </button>
      </div>
    </div>
  )
}
