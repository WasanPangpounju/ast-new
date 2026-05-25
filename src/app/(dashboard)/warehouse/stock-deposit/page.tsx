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
  withdrawnFold: number
  withdrawnYard: number
}

interface WithdrawalRecord {
  vatType: string
  vatNo: number
  createDate: string
  receiveName: string | null
  foldCount: number
  totalYard: number
}

interface Roll {
  id: number
  sumYard: number
}

function fmtDate(d: string) {
  try {
    const dt = new Date(d)
    return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear() + 543}`
  } catch { return '-' }
}

export default function StockDepositPage() {
  const [bills, setBills] = useState<DepositBill[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')

  // Withdrawal create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [createTarget, setCreateTarget] = useState<DepositBill | null>(null)
  const [createBillType, setCreateBillType] = useState('A')
  const [createBillNo, setCreateBillNo] = useState('')
  const [createDate, setCreateDate] = useState(new Date().toISOString().slice(0, 10))
  const [createReceiver, setCreateReceiver] = useState('')
  const [createYards, setCreateYards] = useState<string[]>(Array(TOTAL_SLOTS).fill(''))
  const [creating, setCreating] = useState(false)
  const createInputRefs = useRef<(HTMLInputElement | null)[]>(Array(TOTAL_SLOTS).fill(null))

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailBill, setDetailBill] = useState<DepositBill | null>(null)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<WithdrawalRecord | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editReceiver, setEditReceiver] = useState('')
  const [editYards, setEditYards] = useState<string[]>(Array(TOTAL_SLOTS).fill(''))
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const editInputRefs = useRef<(HTMLInputElement | null)[]>(Array(TOTAL_SLOTS).fill(null))

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
    if (!createOpen) return
    fetch('/api/warehouse/bill/next-vatno?type=' + createBillType)
      .then(r => r.json())
      .then(d => { if (d.nextNo) setCreateBillNo(String(d.nextNo)) })
      .catch(() => {})
  }, [createBillType, createOpen])

  const totalPages = Math.ceil(total / 20)

  // ── Fetch withdrawal list for detail modal ──
  const fetchWithdrawals = async (refId: string) => {
    setDetailLoading(true)
    setWithdrawals([])
    try {
      const res = await fetch(`/api/warehouse/stock-deposit/withdrawals?refId=${encodeURIComponent(refId)}`)
      const data = await res.json()
      setWithdrawals(data.withdrawals ?? [])
    } catch {}
    setDetailLoading(false)
  }

  const openDetail = (bill: DepositBill) => {
    setDetailBill(bill)
    setDetailOpen(true)
    fetchWithdrawals(bill.refId)
  }
  const closeDetail = () => { setDetailOpen(false); setDetailBill(null) }

  // ── Create withdrawal ──
  const openCreate = (bill: DepositBill) => {
    setCreateTarget(bill)
    setCreateReceiver(bill.customerName ?? '')
    setCreateYards(Array(TOTAL_SLOTS).fill(''))
    setCreateDate(new Date().toISOString().slice(0, 10))
    setCreateOpen(true)
  }
  const closeCreate = () => { setCreateOpen(false); setCreateTarget(null) }

  const createYardNums = createYards.map(v => parseFloat(v) || 0)
  const createTotalFold = createYardNums.filter(v => v > 0).length
  const createTotalYard = createYardNums.reduce((a, b) => a + b, 0)

  async function handleCreate() {
    if (!createTarget || !createBillType || createTotalFold === 0) {
      alert('กรุณากรอกข้อมูลให้ครบ: ประเภทบิล และหลาผ้าอย่างน้อย 1 ช่อง')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/warehouse/stock-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vatType: createBillType,
          vatNo: Number(createBillNo),
          customerName: createTarget.customerName,
          receiveName: createReceiver || createTarget.customerName,
          fabricStruct: createTarget.altFabricStruct || createTarget.fabricStruct,
          fabricPattern: createTarget.fabricPattern,
          fabricW: createTarget.fabricW,
          createDate,
          yards: createYards,
          depositRefId: createTarget.refId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'บันทึกไม่สำเร็จ')
      alert(`เบิกผ้าออกสำเร็จ ${data.count} รายการ บิลเลขที่ ${data.vatNo}`)
      closeCreate()
      fetchBills()
      if (detailOpen && detailBill) fetchWithdrawals(detailBill.refId)
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Edit withdrawal ──
  const openEdit = async (w: WithdrawalRecord) => {
    setEditTarget(w)
    setEditDate(new Date(w.createDate).toISOString().slice(0, 10))
    setEditReceiver(w.receiveName ?? '')
    setEditYards(Array(TOTAL_SLOTS).fill(''))
    setEditOpen(true)
    setEditLoading(true)
    try {
      const res = await fetch(`/api/warehouse/bill/${w.vatNo}?vatType=${w.vatType}`)
      const data = await res.json()
      const rolls: Roll[] = data.rolls ?? []
      const next = Array(TOTAL_SLOTS).fill('')
      rolls.forEach((r, i) => { if (i < TOTAL_SLOTS) next[i] = String(r.sumYard) })
      setEditYards(next)
    } catch {}
    setEditLoading(false)
  }
  const closeEdit = () => { setEditOpen(false); setEditTarget(null) }

  const editYardNums = editYards.map(v => parseFloat(v) || 0)
  const editTotalFold = editYardNums.filter(v => v > 0).length
  const editTotalYard = editYardNums.reduce((a, b) => a + b, 0)

  async function handleEdit() {
    if (!editTarget || editTotalFold === 0) {
      alert('กรุณากรอกหลาผ้าอย่างน้อย 1 ช่อง')
      return
    }
    setEditSaving(true)
    try {
      const res = await fetch('/api/warehouse/stock-deposit/withdrawals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vatType: editTarget.vatType,
          vatNo: editTarget.vatNo,
          createDate: editDate,
          receiveName: editReceiver,
          yards: editYards,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'แก้ไขไม่สำเร็จ')
      closeEdit()
      if (detailBill) fetchWithdrawals(detailBill.refId)
      fetchBills()
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setEditSaving(false)
    }
  }

  // ── Delete withdrawal ──
  async function handleDelete(w: WithdrawalRecord) {
    if (!confirm(`ยืนยันลบบิลเบิก ${w.vatType}${w.vatNo} (${w.foldCount} พับ / ${Number(w.totalYard).toLocaleString()} หลา)?`)) return
    try {
      const res = await fetch(`/api/warehouse/stock-deposit/withdrawals?vatType=${w.vatType}&vatNo=${w.vatNo}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'ลบไม่สำเร็จ')
      }
      if (detailBill) fetchWithdrawals(detailBill.refId)
      fetchBills()
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // ── Yard grid renderer (shared) ──
  function YardGrid({
    yards, setYard, inputRefs,
  }: {
    yards: string[]
    setYard: (i: number, v: string) => void
    inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  }) {
    const nums = yards.map(v => parseFloat(v) || 0)
    return (
      <div className="overflow-x-auto border border-gray-200 rounded-lg mb-3">
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
                  return (
                    <td key={g} colSpan={2} className="border border-gray-200 p-0">
                      <div className="flex items-center">
                        <span className="text-gray-400 text-xs w-7 text-right pr-1 select-none flex-shrink-0">{idx + 1}</span>
                        <input
                          ref={el => { inputRefs.current[idx] = el }}
                          type="number" min="0" step="0.5"
                          value={yards[idx]}
                          onChange={e => setYard(idx, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              inputRefs.current[idx + 1]?.focus()
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
                const sum = nums.slice(g * ROWS, (g + 1) * ROWS).reduce((a, b) => a + b, 0)
                return (
                  <td key={g} colSpan={2} className="border border-gray-400 px-2 py-1.5 text-center">
                    <div className="text-xs text-gray-500">รวม:</div>
                    <div className="text-sm font-bold text-gray-800">{sum > 0 ? sum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</div>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">สต็อกผ้าฝากจัดเก็บ</h1>
          <p className="text-sm text-gray-500">ทั้งหมด {total.toLocaleString()} รายการ</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาลูกค้า, โครงสร้างผ้า..."
          onKeyDown={e => e.key === 'Enter' && (setPage(1), setApplied(search))}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => { setPage(1); setApplied(search) }}
          className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">ค้นหา</button>
        <button onClick={() => { setSearch(''); setApplied(''); setPage(1) }}
          className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">เคลียร์</button>
      </div>

      {/* Main table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-600 align-middle">วันที่</th>
                <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-600 align-middle">เลขบิล</th>
                <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-600 align-middle">ลูกค้า</th>
                <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-600 align-middle">โครงสร้างผ้า</th>
                <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-600 align-middle">ลายผ้า</th>
                <th rowSpan={2} className="text-left px-3 py-2 font-medium text-gray-600 align-middle">หน้ากว้าง</th>
                <th colSpan={2} className="text-center px-3 py-1.5 font-medium text-gray-600 border-b border-gray-200">ฝากแล้ว</th>
                <th colSpan={2} className="text-center px-3 py-1.5 font-medium text-orange-600 border-b border-gray-200">เบิกแล้ว</th>
                <th rowSpan={2} className="text-center px-3 py-2 font-medium text-gray-600 align-middle w-36">การดำเนินการ</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th className="text-right px-3 py-1.5 font-medium text-gray-500 w-14">พับ</th>
                <th className="text-right px-3 py-1.5 font-medium text-gray-500 w-20">หลา</th>
                <th className="text-right px-3 py-1.5 font-medium text-orange-500 w-14">พับ</th>
                <th className="text-right px-3 py-1.5 font-medium text-orange-500 w-20">หลา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : bills.map((b, i) => (
                <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(b.createDate)}</td>
                  <td className="px-3 py-2 font-mono font-medium text-blue-700">{b.vatType}-{b.vatNo}</td>
                  <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px] truncate">{b.customerName ?? '-'}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate">{b.altFabricStruct || b.fabricStruct || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{b.fabricPattern || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{b.fabricW ? `${b.fabricW}''` : '-'}</td>
                  <td className="px-3 py-2 text-right text-gray-800">{b.foldCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{Number(b.totalYard).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    {b.withdrawnFold > 0
                      ? <span className="text-orange-700 font-medium">{b.withdrawnFold.toLocaleString()}</span>
                      : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {b.withdrawnYard > 0
                      ? <span className="text-orange-700 font-medium">{Number(b.withdrawnYard).toLocaleString()}</span>
                      : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openDetail(b)}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors">
                        รายละเอียด
                      </button>
                      <button onClick={() => openCreate(b)}
                        className="text-xs px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors font-medium">
                        เบิกผ้าออก
                      </button>
                    </div>
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

      {/* ── Detail modal ── */}
      {detailOpen && detailBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">รายละเอียดการเบิกผ้าออก</h2>
                <p className="text-xs text-gray-500 mt-0.5">บิล {detailBill.vatType}-{detailBill.vatNo} · {detailBill.customerName}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {detailBill.altFabricStruct || detailBill.fabricStruct}
                  {detailBill.fabricPattern ? ` / ${detailBill.fabricPattern}` : ''}
                  {detailBill.fabricW ? ` ${detailBill.fabricW}''` : ''}
                </p>
              </div>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <div className="overflow-y-auto flex-1 p-4">
              {detailLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
                  กำลังโหลด...
                </div>
              ) : withdrawals.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">ยังไม่มีประวัติการเบิกผ้าออก</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-medium text-gray-600">วันที่</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">บิลเบิก</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">ผู้รับ</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">พับ</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">หลา</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {withdrawals.map((w, i) => (
                      <tr key={i} className="hover:bg-orange-50/30">
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(w.createDate)}</td>
                        <td className="px-3 py-2 font-mono text-orange-700 font-medium">{w.vatType}{w.vatNo}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{w.receiveName ?? '-'}</td>
                        <td className="px-3 py-2 text-right text-gray-800">{w.foldCount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{Number(w.totalYard).toLocaleString()}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <a href={`/warehouse/bill/print/${w.vatType}${w.vatNo}`} target="_blank"
                              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
                              🖨
                            </a>
                            <button onClick={() => openEdit(w)}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
                              แก้ไข
                            </button>
                            <button onClick={() => handleDelete(w)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors">
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-orange-50 font-semibold border-t-2 border-gray-200">
                      <td colSpan={3} className="px-3 py-2 text-xs text-gray-600">รวมเบิกแล้ว</td>
                      <td className="px-3 py-2 text-right text-xs text-orange-700">
                        {withdrawals.reduce((s, w) => s + w.foldCount, 0).toLocaleString()} พับ
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-orange-800">
                        {Number(withdrawals.reduce((s, w) => s + w.totalYard, 0)).toLocaleString()} หลา
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center">
              <div className="text-xs text-gray-500">
                ฝากทั้งหมด: <span className="font-medium text-gray-700">{detailBill.foldCount} พับ / {Number(detailBill.totalYard).toLocaleString()} หลา</span>
                {detailBill.withdrawnFold > 0 && (
                  <> · เบิกแล้ว: <span className="font-medium text-orange-700">{detailBill.withdrawnFold} พับ / {Number(detailBill.withdrawnYard).toLocaleString()} หลา</span></>
                )}
              </div>
              <button onClick={closeDetail}
                className="px-4 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editOpen && editTarget && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">แก้ไขบิลเบิกผ้าออก</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  บิล {editTarget.vatType}{editTarget.vatNo} · {editTarget.foldCount} พับ / {Number(editTarget.totalYard).toLocaleString()} หลา
                </p>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="p-5">
              {/* Header fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">วันที่</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">ผู้รับ</label>
                  <input value={editReceiver} onChange={e => setEditReceiver(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ชื่อผู้รับ" />
                </div>
              </div>

              {/* Summary */}
              {editTotalFold > 0 && (
                <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
                  <span>สรุป:</span>
                  <span className="font-semibold text-blue-700">{editTotalFold.toLocaleString()} พับ</span>
                  <span className="font-semibold text-gray-700">{editTotalYard.toLocaleString(undefined, { maximumFractionDigits: 2 })} หลา</span>
                </div>
              )}

              {editLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
                  กำลังโหลดรายพับ...
                </div>
              ) : (
                <YardGrid
                  yards={editYards}
                  setYard={(i, v) => setEditYards(prev => { const n = [...prev]; n[i] = v; return n })}
                  inputRefs={editInputRefs}
                />
              )}

              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeEdit}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
                  ยกเลิก
                </button>
                <button onClick={handleEdit} disabled={editSaving || editLoading}
                  className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                  {editSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create withdrawal modal ── */}
      {createOpen && createTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">เบิกผ้าออก</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  จากบิลฝากจัดเก็บ {createTarget.vatType}-{createTarget.vatNo} · {createTarget.customerName}
                </p>
              </div>
              <button onClick={closeCreate} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="p-5">
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 text-xs text-blue-800 space-y-1">
                <div><span className="font-medium">ลูกค้า:</span> {createTarget.customerName}</div>
                <div><span className="font-medium">โครงสร้างผ้า:</span> {createTarget.altFabricStruct || createTarget.fabricStruct || '-'}</div>
                {createTarget.fabricPattern && <div><span className="font-medium">ลายผ้า:</span> {createTarget.fabricPattern}</div>}
                {createTarget.fabricW && <div><span className="font-medium">หน้ากว้าง:</span> {createTarget.fabricW}''</div>}
                {createTarget.withdrawnFold > 0 && (
                  <div className="pt-1 border-t border-blue-200 text-orange-700">
                    <span className="font-medium">เบิกไปแล้ว:</span> {createTarget.withdrawnFold} พับ / {Number(createTarget.withdrawnYard).toLocaleString()} หลา
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">ประเภทบิล</label>
                  <select value={createBillType} onChange={e => setCreateBillType(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">เลขที่บิล</label>
                  <input value={createBillNo} onChange={e => setCreateBillNo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="เลขที่บิล" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">วันที่</label>
                  <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">ผู้รับ</label>
                  <input value={createReceiver} onChange={e => setCreateReceiver(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ชื่อผู้รับ" />
                </div>
              </div>

              {createTotalFold > 0 && (
                <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
                  <span>สรุป:</span>
                  <span className="font-semibold text-blue-700">{createTotalFold.toLocaleString()} พับ</span>
                  <span className="font-semibold text-gray-700">{createTotalYard.toLocaleString(undefined, { maximumFractionDigits: 2 })} หลา</span>
                </div>
              )}

              <YardGrid
                yards={createYards}
                setYard={(i, v) => setCreateYards(prev => { const n = [...prev]; n[i] = v; return n })}
                inputRefs={createInputRefs}
              />

              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeCreate}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">ยกเลิก</button>
                <button onClick={handleCreate} disabled={creating}
                  className="px-6 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium disabled:opacity-50">
                  {creating ? 'กำลังบันทึก...' : 'บันทึกเบิกผ้าออก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
