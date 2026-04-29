'use client'
import { useState, useEffect, useCallback } from 'react'

interface Order {
  id: number
  purchaseOrder: string
  customerName: string | null
  fabricId: string | null
  fabricPattern: string | null
  fabricStructure: string | null
  orderSumYard: number | null
  createdAt: string
  deliveredYard: number
  deliveredFold: number
  remainingYard: number
  fabricAst: { fabricW: string | null; phewW: string | null } | null
  fabricAstStructure: {
    yarnWRatio2: string | null
    yarnHType: string | null
    yarnWType: string | null
    yarnHCount1: string | null
    yarnWCount1: string | null
  } | null
}

export default function WarehouseOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState('')
  const [fabricId, setFabricId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [applied, setApplied] = useState({ search: '', customer: '', fabricId: '', dateFrom: '', dateTo: '' })

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({
      page: String(page),
      ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v))
    })
    fetch(`/api/warehouse/orders?${p}`)
      .then(r => r.json())
      .then(d => { setOrders(d.orders ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page, applied])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const handleSearch = () => { setPage(1); setApplied({ search, customer, fabricId, dateFrom, dateTo }) }
  const handleClear = () => {
    setSearch(''); setCustomer(''); setFabricId(''); setDateFrom(''); setDateTo('')
    setPage(1); setApplied({ search: '', customer: '', fabricId: '', dateFrom: '', dateTo: '' })
  }

  const totalPages = Math.ceil(total / 20)

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear() + 543}`
    } catch { return '-' }
  }

  return (
    <div className="p-4 max-w-full">
      {/* Search form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ลูกค้า</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)}
              placeholder="ค้นหาลูกค้า..." onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">เลขที่ใบสั่งซื้อ</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="SO number..." onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">รหัสผ้า</label>
            <input value={fabricId} onChange={e => setFabricId(e.target.value)}
              placeholder="รหัสผ้า..." onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่เริ่ม</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่สิ้นสุด</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleClear}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
            เคลียร์ข้อมูล
          </button>
          <button onClick={handleSearch}
            className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            ค้นหา
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">ออร์เดอร์ลูกค้า</h1>
          <p className="text-xs text-gray-500">ทั้งหมด {total.toLocaleString()} รายการ</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th rowSpan={2} className="text-left px-3 py-2.5 font-medium text-gray-600 w-24 align-middle">วันที่</th>
                <th rowSpan={2} className="text-left px-3 py-2.5 font-medium text-gray-600 align-middle">SO / ลูกค้า</th>
                <th rowSpan={2} className="text-left px-3 py-2.5 font-medium text-gray-600 align-middle">รหัสผ้า</th>
                <th rowSpan={2} className="text-left px-3 py-2.5 font-medium text-gray-600 align-middle">โครงสร้างผ้า</th>
                <th rowSpan={2} className="text-left px-3 py-2.5 font-medium text-gray-600 align-middle">ลายผ้า</th>
                <th rowSpan={2} className="text-right px-3 py-2.5 font-medium text-gray-600 w-20 align-middle">หน้ากว้าง</th>
                <th rowSpan={2} className="text-right px-3 py-2.5 font-medium text-gray-600 w-28 align-middle">จำนวน Order (หลา)</th>
                <th colSpan={2} className="text-center px-3 py-2 font-medium text-gray-600 border-b border-gray-200">จัดส่งแล้ว</th>
                <th rowSpan={2} className="text-right px-3 py-2.5 font-medium text-gray-600 w-24 align-middle">คงค้าง (หลา)</th>
                <th rowSpan={2} className="text-center px-3 py-2.5 font-medium text-gray-600 w-24 align-middle">รายละเอียด</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th className="text-right px-3 py-2 font-medium text-gray-500 w-20">หลา</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 w-20">พับ</th>
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
              ) : orders.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : orders.map(order => {
                const hasDelivered = order.deliveredYard > 0
                const isComplete = order.remainingYard <= 0
                return (
                  <tr key={order.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(order.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-blue-600 font-medium text-xs">{order.purchaseOrder}</div>
                      <div className="text-xs text-gray-500 mt-0.5 max-w-[220px] truncate">{order.customerName ?? '-'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-gray-800">{order.fabricId ?? '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{order.fabricStructure ?? '-'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{order.fabricPattern ?? '-'}</td>
                    <td className="px-3 py-2 text-center text-gray-700 border-r border-gray-100">
                      {order.fabricAst?.fabricW ?? order.fabricAst?.phewW ?? '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-900">
                      {order.orderSumYard ? Number(order.orderSumYard).toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      {hasDelivered
                        ? <span className="text-green-700 font-medium">{order.deliveredYard.toLocaleString()}</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      {order.deliveredFold > 0
                        ? <span className="text-green-700 font-medium">{order.deliveredFold.toLocaleString()}</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      {order.orderSumYard
                        ? <span className={isComplete ? 'text-blue-600 font-medium' : 'text-orange-600 font-medium'}>
                          {order.remainingYard.toLocaleString()}
                        </span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors">
                        รายละเอียด
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">หน้า {page} จาก {totalPages} ({total.toLocaleString()} รายการ)</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">‹ ก่อนหน้า</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">ถัดไป ›</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
