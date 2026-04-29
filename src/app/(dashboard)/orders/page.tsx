'use client'
import { useState, useEffect, useCallback } from 'react'

interface Order {
  id: number
  purchaseOrder: string
  vat: string
  customerName: string | null
  fabricPattern: string | null
  fabricStructure: string | null
  orderSumYard: number | null
  status: string | null
  createdAt: string
  fabricAstStructure: { yarnWRatio2: string | null } | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  'no data': { label: 'สร้างแล้ว', color: 'bg-gray-100 text-gray-600' },
  'อนุมัติให้ผลิต': { label: 'อนุมัติแล้ว', color: 'bg-green-100 text-green-700' },
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = status ?? 'no data'
  const cfg = STATUS_MAP[s] ?? { label: s, color: 'bg-blue-100 text-blue-700' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchOrders = useCallback(() => {
    setLoading(true)
    fetch(`/api/orders?page=${page}&limit=20&search=${encodeURIComponent(search)}`)
      .then(r => r.json())
      .then(data => { setOrders(data.orders ?? []); setTotal(data.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ใบสั่งซื้อ</h1>
          <p className="text-sm text-gray-500 mt-0.5">ทั้งหมด {total.toLocaleString()} รายการ</p>
        </div>
        <input
          type="text"
          placeholder="ค้นหา SO, ลูกค้า, ลวดลาย..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">SO Number</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ลูกค้า</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">ลวดลาย</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">หลา</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">กำลังโหลด...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : orders.map(order => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-blue-600 font-medium">{order.purchaseOrder}</td>
                <td className="px-4 py-3 text-gray-900">{order.customerName ?? '-'}</td>
                <td className="px-4 py-3 text-gray-600">{order.fabricPattern ?? '-'}</td>
                <td className="px-4 py-3 text-right">{order.orderSumYard?.toLocaleString() ?? '-'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.fabricAstStructure?.yarnWRatio2 ?? order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">หน้า {page} จาก {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">← ก่อนหน้า</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">ถัดไป →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
