'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const GROUPS = 8
const ROWS = 20
const TOTAL_SLOTS = GROUPS * ROWS

interface DepositBill {
  refId: string
  vatType: string
  vatNo: number
  customerName: string | null
  fabricStruct: string | null
  fabricPattern: string | null
  fabricW: string | null
  purchaseOrder: string | null
  altFabricStruct: string | null
  altPurchaseOrder: string | null
  foldCount: number
  totalYard: number
  createDate: string
}

export default function StockDepositPage() {
  const [bills, setBills] = useState<DepositBill[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')

  // Withdrawal modal
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<DepositBill | null>(null)

  // Withdrawal form
  const [billType, setBillType] = useState('A')
  const [billNo, setBillNo] = useState('')
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10))
  const [receiver, setReceiver] = useState('')
  const [yards, setYards] = useState<string[]>(Array(TOTAL_SLOTS).fill(''))
  const [saving, setSaving] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(TOTAL_SLOTS).fill(null))

  const fetchBills = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page) })
    if (applied) p.set('search', applied)
    fetch(`/api/warehouse/stock-deposit?${p}`)
      .then(r => r.json())
      .then(d => { setBills(d.bills ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page, applied])

  useEffect(() => { fetchBills() }, [fetchBills])

  useEffect(() => {
    if (!modalOpen) return
    fetch('/api/warehouse/bill/next-vatno?type=' + billType)
      .then(r => r.json())
      .then(d => { if (d.nextNo) setBillNo(String(d.nextNo)) })
      .catch(() => {})
  }, [billType, modalOpen])

  const totalPages = Math.ceil(total / 20)

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear() + 543}`
    } catch { return '-' }
  }

  const openModal = (bill: DepositBill) => {
    setSelected(bill)
    setReceiver(bill.customerName ?? '')
    setYards(Array(TOTAL_SLOTS).fill(''))
    setBillDate(new Date().toISOString().slice(0, 10))
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelected(null)
  }

  const setYard = (idx: number, val: string) => {
    setYards(prev => { const next = [...prev]; next[idx] = val; return next })
  }

  const yardNums = yards.map(v => parseFloat(v) || 0)
  const totalFold = yardNums.filter(v => v > 0).length
  const totalYard = yardNums.reduce((a, b) => a + b, 0)

  async function handleWithdraw() {
    if (!selected || !billType || totalFold === 0) {
      alert('กรุณากรอกข้อมูลให้ครบ: ประเภทบิล และหลาผ้าอย่างน้อย 1 ช่อง')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/warehouse/stock-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vatType: billType,
          vatNo: Number(billNo),
          customerName: selected.customerName,
          receiveName: receiver || selected.customerName,
          fabricStruct: selected.altFabricStruct || selected.fabricStruct,
          fabricPattern: selected.fabricPattern,
          fabricW: selected.fabricW,
          createDate: billDate,
          yards,
          depositRefId: selected.refId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'บันทึกไม่สำเร็จ')
      alert(`เบิกผ้าออกสำเร็จ ${data.count} รายการ บิลเลขที่ ${data.vatNo}`)
      closeModal()
      fetchBills()
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">สต็อกผ้าฝากจัดเก็บ</h1>
          <p className="text-xs text-gray-500">ทั้งหมด {total.toLocaleString()} รายการ</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm flex gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาลูกค้า, โครงสร้างผ้า..."
          onKeyDown={e => e.key === 'Enter' && (setPage(1), setApplied(search))}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => { setPage(1); setApplied(search) }}
          className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          ค้นหา
        </button>
        <button
          onClick={() => { setSearch(''); setApplied(''); setPage(1) }}
          className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          เคลียร์
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">วันที่</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">เลขบิล</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลูกค้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">โครงสร้างผ้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลายผ้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">หน้ากว้าง</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-16">พับ</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-24">หลา</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-28">เบิกผ้าออก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : bills.map((b, i) => (
                <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2 text-gray-500">{fmtDate(b.createDate)}</td>
                  <td className="px-3 py-2 font-mono font-medium text-blue-700">{b.vatType} - {b.vatNo}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{b.customerName ?? '-'}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">
                    {b.altFabricStruct || b.fabricStruct || '-'}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{b.fabricPattern || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{b.fabricW ? `${b.fabricW}''` : '-'}</td>
                  <td className="px-3 py-2 text-right text-gray-800">{b.foldCount}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{Number(b.totalYard).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => openModal(b)}
                      className="text-xs px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors font-medium"
                    >
                      เบิกผ้าออก
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">หน้า {page} จาก {totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">‹</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">»</button>
            </div>
          </div>
        )}
      </div>

      {/* Withdrawal modal */}
      {modalOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">เบิกผ้าออก</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  จากบิลฝากจัดเก็บ {selected.vatType}-{selected.vatNo} · {selected.customerName}
                </p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="p-5">
              {/* Pre-filled info */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 text-xs text-blue-800 space-y-1">
                <div><span className="font-medium">ลูกค้า:</span> {selected.customerName}</div>
                <div><span className="font-medium">โครงสร้างผ้า:</span> {selected.altFabricStruct || selected.fabricStruct || '-'}</div>
                {selected.fabricPattern && <div><span className="font-medium">ลายผ้า:</span> {selected.fabricPattern}</div>}
                {selected.fabricW && <div><span className="font-medium">หน้ากว้าง:</span> {selected.fabricW}''</div>}
              </div>

              {/* New bill fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">ประเภทบิล</label>
                  <select value={billType} onChange={e => setBillType(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">เลขที่บิล</label>
                  <input value={billNo} onChange={e => setBillNo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="เลขที่บิล" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">วันที่</label>
                  <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">ผู้รับ</label>
                  <input value={receiver} onChange={e => setReceiver(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ชื่อผู้รับ" />
                </div>
              </div>

              {/* Summary */}
              {totalFold > 0 && (
                <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
                  <span>สรุป:</span>
                  <span className="font-semibold text-blue-700">{totalFold.toLocaleString()} พับ</span>
                  <span className="font-semibold text-gray-700">{totalYard.toLocaleString(undefined, { maximumFractionDigits: 2 })} หลา</span>
                </div>
              )}

              {/* Yards grid */}
              <div className="overflow-x-auto border border-gray-200 rounded-lg mb-4">
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

              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeModal}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
                  ยกเลิก
                </button>
                <button onClick={handleWithdraw} disabled={saving}
                  className="px-6 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium disabled:opacity-50">
                  {saving ? 'กำลังบันทึก...' : 'บันทึกเบิกผ้าออก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
