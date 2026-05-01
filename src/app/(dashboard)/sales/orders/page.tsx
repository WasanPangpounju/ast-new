'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Order {
  id: number
  purchaseOrder: string
  vat: string
  customerName: string | null
  priceYard: number | null
  priceM: number | null
  discountP: number | null
  discountYard: number | null
  commission: number | null
  orderSumM: number | null
  orderSumYard: number | null
  status: string | null
  createDate: string
  createdAt: string
  fabricAst: { fabricW: string | null; payment: string | null } | null
  fabricAstStructure: { yarnWRatio2: string | null } | null
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? 'no data'
  const map: Record<string, string> = {
    'อนุมัติให้ผลิต': 'bg-green-100 text-green-700',
    'รอดำเนินการ': 'bg-yellow-100 text-yellow-700',
    'เสร็จสิ้น': 'bg-blue-100 text-blue-700',
    'ยกเลิก': 'bg-red-100 text-red-700',
    'no data': 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[s] ?? 'bg-gray-100 text-gray-500'}`}>
      {s}
    </span>
  )
}

const STATUSES = ['', 'รอดำเนินการ', 'อนุมัติให้ผลิต', 'เสร็จสิ้น', 'ยกเลิก']
const MONTHS = ['', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const MONTH_NAMES = ['ทั้งหมด', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export default function SalesOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [applied, setApplied] = useState({ q: '', status: '', month: '', year: '' })

  const totalPages = Math.ceil(total / 20)
  const currentThYear = new Date().getFullYear() + 543

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page) })
    if (applied.q) p.set('q', applied.q)
    if (applied.status) p.set('status', applied.status)
    if (applied.month) p.set('month', applied.month)
    if (applied.year) p.set('year', applied.year)
    fetch(`/api/sales/orders?${p}`)
      .then(r => r.json())
      .then(d => { setOrders(d.orders ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page, applied])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  function handleSearch() { setPage(1); setApplied({ q, status, month, year }) }
  function handleClear() {
    setQ(''); setStatus(''); setMonth(''); setYear('')
    setPage(1); setApplied({ q: '', status: '', month: '', year: '' })
  }

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()+543}`
    } catch { return '-' }
  }

  const calcTotal = (o: Order) => {
    const price = o.priceYard ?? 0
    const disc = o.discountYard ?? 0
    const yards = o.orderSumYard ?? 0
    return ((price - disc) * yards).toFixed(2)
  }

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">ใบสั่งขาย</h1>
          <p className="text-xs text-gray-500">ทั้งหมด {total.toLocaleString()} รายการ</p>
        </div>
        <button onClick={() => router.push('/sales/orders/create')}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
          ➕ สร้างใบสั่งขาย
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ค้นหา</label>
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="SO number หรือชื่อลูกค้า..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">สถานะ</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {STATUSES.map((s, i) => <option key={s} value={s}>{i === 0 ? 'ทั้งหมด' : s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">เดือน</label>
            <select value={month} onChange={e => setMonth(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {MONTHS.map((m, i) => <option key={m} value={m}>{MONTH_NAMES[i]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ปี (พ.ศ.)</label>
            <select value={year} onChange={e => setYear(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">ทั้งหมด</option>
              {Array.from({ length: 6 }, (_, i) => currentThYear - i).map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleClear}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">เคลียร์</button>
          <button onClick={handleSearch}
            className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">ค้นหา</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-10">ลำดับ</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-28">เลขที่ใบสั่งขาย</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-16">ประเภท</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลูกค้า</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-20">ราคา/หลา</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-20">ส่วนลด</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-24">ยอดรวม</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-32">สถานะ</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-24">วันที่</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-20">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : orders.map((o, i) => (
                <tr key={o.id} className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/sales/orders/${o.id}`)}>
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
                  <td className="px-3 py-2.5 text-xs text-gray-800 max-w-[200px] truncate">{o.customerName ?? '-'}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-700">
                    {o.priceYard ? o.priceYard.toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-700">
                    {o.discountYard ? o.discountYard.toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-900">
                    {o.priceYard && o.orderSumYard ? Number(calcTotal(o)).toLocaleString() : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(o.createDate)}</td>
                  <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => router.push(`/sales/orders/${o.id}`)}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">ดู</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">หน้า {page} จาก {totalPages} ({total.toLocaleString()} รายการ)</p>
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
