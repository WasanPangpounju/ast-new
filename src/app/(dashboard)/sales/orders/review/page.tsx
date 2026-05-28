'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Order {
  id: number
  purchaseOrder: string
  customerName: string | null
  fabricId: string | null
  fabricPattern: string | null
  fabricStructure: string | null
  priceYard: number | null
  orderSumYard: number | null
  status: string | null
  createDate: string
  fabricAst: { fabricW: string | null } | null
}


const STATUSES = ['รอดำเนินการ', 'อนุมัติให้ผลิต', 'เสร็จสิ้น', 'ยกเลิก', 'no data']
const FILTER_STATUSES = ['', ...STATUSES]

const MONTHS = [
  { v: '', label: 'ทุกเดือน' },
  { v: '1', label: 'มกราคม' },
  { v: '2', label: 'กุมภาพันธ์' },
  { v: '3', label: 'มีนาคม' },
  { v: '4', label: 'เมษายน' },
  { v: '5', label: 'พฤษภาคม' },
  { v: '6', label: 'มิถุนายน' },
  { v: '7', label: 'กรกฎาคม' },
  { v: '8', label: 'สิงหาคม' },
  { v: '9', label: 'กันยายน' },
  { v: '10', label: 'ตุลาคม' },
  { v: '11', label: 'พฤศจิกายน' },
  { v: '12', label: 'ธันวาคม' },
]

const NOW = new Date()
const CURRENT_MONTH = String(NOW.getMonth() + 1)
const CURRENT_YEAR = String(NOW.getFullYear() + 543)

function buildYearOptions() {
  const years: { v: string; label: string }[] = [{ v: '', label: 'ทุกปี' }]
  const cur = parseInt(CURRENT_YEAR)
  for (let y = cur; y >= cur - 5; y--) {
    years.push({ v: String(y), label: String(y) })
  }
  return years
}

const YEAR_OPTIONS = buildYearOptions()

export default function SalesOrdersReviewPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [applied, setApplied] = useState({
    q: '',
    status: '',
    month: '',
    year: '',
  })
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const totalPages = Math.ceil(total / 20)

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page) })
    if (applied.q) p.set('q', applied.q)
    if (applied.status) p.set('status', applied.status)
    if (applied.month && applied.year) {
      p.set('month', applied.month)
      p.set('year', applied.year)
    } else if (applied.year && !applied.month) {
      p.set('year', applied.year)
    }
    fetch(`/api/sales/orders?${p}`)
      .then(r => r.json())
      .then(d => { setOrders(d.orders ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page, applied])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  async function changeStatus(order: Order, newStatus: string) {
    setUpdatingId(order.id)
    try {
      await fetch(`/api/sales/orders/${order.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: newStatus } : o))
    } finally {
      setUpdatingId(null)
    }
  }

  function statusColor(status: string | null) {
    switch (status) {
      case 'รอดำเนินการ': return 'bg-yellow-50 text-yellow-800 border-yellow-300'
      case 'อนุมัติให้ผลิต': return 'bg-green-50 text-green-800 border-green-300'
      case 'เสร็จสิ้น': return 'bg-blue-50 text-blue-800 border-blue-300'
      case 'ยกเลิก': return 'bg-red-50 text-red-800 border-red-300'
      default: return 'bg-gray-50 text-gray-500 border-gray-300'
    }
  }

  function applyFilter() {
    setPage(1)
    setApplied({ q, status: statusFilter, month, year })
  }

  function clearFilter() {
    setQ('')
    setStatusFilter('')
    setMonth('')
    setYear('')
    setPage(1)
    setApplied({ q: '', status: '', month: '', year: '' })
  }

  function openPrint(orderId: number, type: 'purchaseorder' | 'structure') {
    window.open(`/print/sales/orders/${orderId}/${type}`, '_blank')
  }

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`
    } catch { return '-' }
  }

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">ตรวจสอบใบสั่งขาย</h1>
          <p className="text-sm text-gray-500">ทั้งหมด {total.toLocaleString()} รายการ</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
        {/* Row 1: search + status */}
        <div className="flex flex-wrap gap-2 mb-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilter()}
            placeholder="ค้นหา SO หรือชื่อลูกค้า..."
            className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {FILTER_STATUSES.map((s, i) => (
              <option key={s} value={s}>{i === 0 ? 'ทุกสถานะ' : s}</option>
            ))}
          </select>
        </div>

        {/* Row 2: month + year + buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">เดือน / ปี :</span>
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MONTHS.map(m => (
                <option key={m.v} value={m.v}>{m.label}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {YEAR_OPTIONS.map(y => (
                <option key={y.v} value={y.v}>{y.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={applyFilter}
            className="px-5 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            ค้นหา
          </button>
          <button
            onClick={clearFilter}
            className="px-4 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600"
          >
            เคลียร์
          </button>
          {/* Show active filter label */}
          {(applied.month || applied.year) && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
              {applied.month ? MONTHS.find(m => m.v === applied.month)?.label : 'ทุกเดือน'}
              {applied.year ? ` ${applied.year}` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-24">วันที่</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-32">เลขที่ใบสั่งขาย</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">รายการ</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-44">สถานะ</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-20">ราคา/หลา</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-44">เอกสาร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : orders.map((o) => {
                const fabricLine = [
                  o.fabricStructure,
                  o.fabricAst?.fabricW ? `${o.fabricAst.fabricW}"` : null,
                  o.fabricPattern,
                ].filter(Boolean).join(' / ')
                return (
                  <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(o.createDate)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-blue-600 font-medium text-xs">{o.purchaseOrder}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-medium text-gray-900">{o.customerName ?? '-'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[o.fabricId, o.orderSumYard ? `${o.orderSumYard.toLocaleString()} หลา` : null].filter(Boolean).join(' · ')}
                      </div>
                      {fabricLine && <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-xs">{fabricLine}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select
                        value={o.status ?? 'no data'}
                        disabled={updatingId === o.id}
                        onChange={e => changeStatus(o, e.target.value)}
                        className={`text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 appearance-none cursor-pointer ${statusColor(o.status)}`}
                      >
                        {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-700">
                      {o.priceYard ? o.priceYard.toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <button
                          onClick={() => router.push(`/sales/orders/${o.id}`)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 whitespace-nowrap"
                        >
                          ดู
                        </button>
                        <button
                          onClick={() => openPrint(o.id, 'purchaseorder')}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 whitespace-nowrap"
                        >
                          ใบสั่งขาย
                        </button>
                        <button
                          onClick={() => openPrint(o.id, 'structure')}
                          className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 whitespace-nowrap"
                        >
                          ใบโครงสร้าง
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">หน้า {page} จาก {totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">‹</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
