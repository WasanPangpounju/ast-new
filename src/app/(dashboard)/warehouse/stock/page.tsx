'use client'
import { useState, useEffect, useCallback } from 'react'

interface StockGroup {
  customer: string
  fabricStruct: string | null
  fabricPattern: string | null
  fabricW: string | null
  lot_count: number
  produced_fold: number
  produced_yard: number
  used_fold: number
  used_yard: number
}

export default function StockPage() {
  const [stocks, setStocks] = useState<StockGroup[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [customer, setCustomer] = useState('')
  const [appliedQ, setAppliedQ] = useState('')
  const [appliedCustomer, setAppliedCustomer] = useState('')
  const [stockType, setStockType] = useState<'all' | 'produced' | 'purchased'>('all')

  const fetchStocks = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page) })
    if (appliedQ) p.set('q', appliedQ)
    if (appliedCustomer) p.set('customer', appliedCustomer)
    if (stockType !== 'all') p.set('stockType', stockType)
    fetch(`/api/warehouse/stock?${p}`)
      .then(r => r.json())
      .then(d => { setStocks(d.stocks ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page, appliedQ, appliedCustomer, stockType])

  useEffect(() => { fetchStocks() }, [fetchStocks])

  const totalPages = Math.ceil(total / 20)
  const handleSearch = () => { setPage(1); setAppliedQ(q); setAppliedCustomer(customer) }
  const handleClear = () => { setQ(''); setCustomer(''); setAppliedQ(''); setAppliedCustomer(''); setStockType('all'); setPage(1) }

  const fmt = (n: number | null) => n == null ? '-' : Number(n).toLocaleString()

  return (
    <div className="p-4 max-w-full">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">สต็อกผ้า</h1>
        <p className="text-xs text-gray-500">ทั้งหมด {total.toLocaleString()} กลุ่ม</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">โครงสร้างผ้า / ลายผ้า</label>
            <input value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="พิมพ์ค้นหา..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ลูกค้า</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="ชื่อลูกค้า..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <button onClick={handleSearch}
              className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">ค้นหา</button>
            <button onClick={handleClear}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">เคลียร์</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500 mr-1">ประเภท:</span>
          {(['all', 'produced', 'purchased'] as const).map(t => (
            <button key={t} onClick={() => { setStockType(t); setPage(1) }}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${stockType === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'all' ? 'ทั้งหมด' : t === 'produced' ? 'ผ้าผลิต' : 'ผ้าซื้อเข้า'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลูกค้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">โครงสร้างผ้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลายผ้า</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600">หน้ากว้าง</th>
                <th className="text-center px-2 py-1 font-medium text-gray-600 bg-blue-50 border-l border-blue-200" colSpan={2}>ผลิตแล้ว</th>
                <th className="text-center px-2 py-1 font-medium text-gray-600 bg-orange-50 border-l border-orange-200" colSpan={2}>ใช้ไป</th>
                <th className="text-center px-2 py-1 font-medium text-gray-600 bg-green-50 border-l border-green-200" colSpan={2}>คงเหลือ</th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th colSpan={4}></th>
                <th className="text-right px-2 py-1 bg-blue-50 font-normal">พับ</th>
                <th className="text-right px-2 py-1 bg-blue-50 font-normal border-r border-blue-100">หลา</th>
                <th className="text-right px-2 py-1 bg-orange-50 font-normal">พับ</th>
                <th className="text-right px-2 py-1 bg-orange-50 font-normal border-r border-orange-100">หลา</th>
                <th className="text-right px-2 py-1 bg-green-50 font-normal">พับ</th>
                <th className="text-right px-2 py-1 bg-green-50 font-normal">หลา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : stocks.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : stocks.map((s, i) => {
                const remFold = (s.produced_fold ?? 0) - (s.used_fold ?? 0)
                const remYard = Number(s.produced_yard ?? 0) - Number(s.used_yard ?? 0)
                return (
                  <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2 text-gray-700 font-medium">{s.customer}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{s.fabricStruct ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{s.fabricPattern ?? '-'}</td>
                    <td className="px-3 py-2 text-center text-gray-700">{s.fabricW ?? '-'}</td>
                    <td className="px-2 py-2 text-right text-blue-700 bg-blue-50/50">{fmt(s.produced_fold)}</td>
                    <td className="px-2 py-2 text-right text-blue-800 font-medium bg-blue-50/50">{fmt(Math.round(Number(s.produced_yard)))}</td>
                    <td className="px-2 py-2 text-right text-orange-700 bg-orange-50/50">{s.used_fold > 0 ? fmt(s.used_fold) : '-'}</td>
                    <td className="px-2 py-2 text-right text-orange-800 bg-orange-50/50">{s.used_yard > 0 ? fmt(Math.round(Number(s.used_yard))) : '-'}</td>
                    <td className="px-2 py-2 text-right font-medium bg-green-50/50" style={{ color: remFold >= 0 ? '#15803d' : '#dc2626' }}>{fmt(remFold)}</td>
                    <td className="px-2 py-2 text-right font-bold bg-green-50/50" style={{ color: remYard >= 0 ? '#15803d' : '#dc2626' }}>{fmt(Math.round(remYard))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">หน้า {page} จาก {totalPages} ({total.toLocaleString()} กลุ่ม)</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">«</button>
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">‹</button>
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">›</button>
              <button onClick={() => setPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
