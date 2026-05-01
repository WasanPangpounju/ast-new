'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Order {
  id: number
  purchaseOrder: string
  vat: string
  customerName: string | null
  priceYard: number | null
  orderSumYard: number | null
  status: string | null
  createDate: string
}

const STATUS_STYLES: Record<string, string> = {
  'อนุมัติให้ผลิต': 'bg-green-100 text-green-700',
  'รอดำเนินการ': 'bg-yellow-100 text-yellow-700',
  'เสร็จสิ้น': 'bg-blue-100 text-blue-700',
  'ยกเลิก': 'bg-red-100 text-red-700',
  'no data': 'bg-gray-100 text-gray-500',
}

const STATUSES = ['รอดำเนินการ', 'อนุมัติให้ผลิต', 'เสร็จสิ้น', 'ยกเลิก', 'no data']
const FILTER_STATUSES = ['', ...STATUSES]

export default function SalesOrdersReviewPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [applied, setApplied] = useState({ q: '', status: '' })
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const totalPages = Math.ceil(total / 20)

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page) })
    if (applied.q) p.set('q', applied.q)
    if (applied.status) p.set('status', applied.status)
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

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()+543}`
    } catch { return '-' }
  }

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">ตรวจสอบใบสั่งขาย</h1>
          <p className="text-xs text-gray-500">ทั้งหมด {total.toLocaleString()} รายการ</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && (setPage(1), setApplied({ q, status: statusFilter }))}
          placeholder="ค้นหา SO หรือชื่อลูกค้า..."
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {FILTER_STATUSES.map((s, i) => <option key={s} value={s}>{i === 0 ? 'ทุกสถานะ' : s}</option>)}
        </select>
        <button onClick={() => { setPage(1); setApplied({ q, status: statusFilter }) }}
          className="px-5 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">ค้นหา</button>
        <button onClick={() => { setQ(''); setStatusFilter(''); setPage(1); setApplied({ q: '', status: '' }) }}
          className="px-4 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600">เคลียร์</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-10">ลำดับ</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-28">เลขที่ใบสั่งขาย</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-14">ประเภท</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลูกค้า</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-20">ราคา/หลา</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-24">วันที่</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-36">สถานะปัจจุบัน</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-44">เปลี่ยนสถานะ</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-16">ดู</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : orders.map((o, i) => {
                const s = o.status ?? 'no data'
                return (
                  <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-500">{(page - 1) * 20 + i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-blue-600 font-medium text-xs">{o.purchaseOrder}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${
                        o.vat === 'SOX' ? 'bg-purple-100 text-purple-700' :
                        o.vat === 'SOB' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'}`}>{o.vat}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-800 max-w-[220px] truncate">{o.customerName ?? '-'}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-700">
                      {o.priceYard ? o.priceYard.toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(o.createDate)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s] ?? 'bg-gray-100 text-gray-500'}`}>
                        {s}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select
                        value={o.status ?? 'no data'}
                        disabled={updatingId === o.id}
                        onChange={e => changeStatus(o, e.target.value)}
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 bg-white"
                      >
                        {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => router.push(`/sales/orders/${o.id}`)}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">ดู</button>
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
