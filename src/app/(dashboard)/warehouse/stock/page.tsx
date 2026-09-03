'use client'
import { useState, useCallback } from 'react'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { InfiniteScrollStatus } from '@/components/InfiniteScrollStatus'

interface StockGroup {
  customer: string
  fabricCode: string | null
  fabricStruct: string | null
  fabricPattern: string | null
  fabricW: string | null
  lot_count: number
  produced_fold: number
  produced_yard: number
  used_fold: number
  used_yard: number
}

interface StockEntry {
  refId: string
  emp: string | null
  customer: string
  is_purchased: boolean
  fold_count: number
  total_yard: number
  create_date: string
}

interface BillEntry {
  vatType: string
  vatNo: number
  customerName: string | null
  receiveName: string | null
  createDate: string
  foldCount: number
  totalYard: number
}

export default function StockPage() {
  const [q, setQ] = useState('')
  const [searchBy, setSearchBy] = useState<'fabricCode' | 'fabricStruct' | 'fabricPattern' | 'fabricW'>('fabricCode')
  const [customer, setCustomer] = useState('')
  const [appliedQ, setAppliedQ] = useState('')
  const [appliedSearchBy, setAppliedSearchBy] = useState<'fabricCode' | 'fabricStruct' | 'fabricPattern' | 'fabricW'>('fabricCode')
  const [appliedCustomer, setAppliedCustomer] = useState('')
  const [stockType, setStockType] = useState<'all' | 'produced' | 'purchased'>('all')

  // ── Detail modal ─────────────────────────────────────
  const [detailGroup, setDetailGroup] = useState<StockGroup | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState<'stock' | 'bill'>('stock')
  const [stockEntries, setStockEntries] = useState<StockEntry[]>([])
  const [billEntries, setBillEntries] = useState<BillEntry[]>([])

  // Stock entry edit/delete
  const [editingStock, setEditingStock] = useState<{ refId: string; emp: string; createDate: string } | null>(null)
  const [stockSaving, setStockSaving] = useState(false)
  const [deleteStockRefId, setDeleteStockRefId] = useState<string | null>(null)

  // Bill entry edit/delete
  const [editingBill, setEditingBill] = useState<{
    vatType: string; vatNo: number
    customerName: string; receiveName: string
    fabricStruct: string; fabricPattern: string; fabricW: string
  } | null>(null)
  const [billSaving, setBillSaving] = useState(false)
  const [deleteBill, setDeleteBill] = useState<{ vatType: string; vatNo: number } | null>(null)

  // Bulk delete (whole tab) — 2-step confirm
  const [bulkDeleteTab, setBulkDeleteTab] = useState<'stock' | 'bill' | null>(null)
  const [bulkDeleteStep, setBulkDeleteStep] = useState<1 | 2>(1)
  const [bulkDeleteCodeInput, setBulkDeleteCodeInput] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const fetchStocksPage = useCallback((page: number) => {
    const p = new URLSearchParams({ page: String(page) })
    if (appliedQ) { p.set('q', appliedQ); p.set('searchBy', appliedSearchBy) }
    if (appliedCustomer) p.set('customer', appliedCustomer)
    if (stockType !== 'all') p.set('stockType', stockType)
    return fetch(`/api/warehouse/stock?${p}`)
      .then(r => r.json())
      .then(d => ({ items: d.stocks ?? [], total: d.total ?? 0 }))
  }, [appliedQ, appliedSearchBy, appliedCustomer, stockType])

  const { items: stocks, total, initialLoading, loadingMore, hasMore, sentinelRef, reload } = useInfiniteScroll<StockGroup>(fetchStocksPage)

  const fetchDetail = useCallback((g: StockGroup) => {
    setDetailLoading(true)
    setStockEntries([])
    setBillEntries([])
    const p = new URLSearchParams({
      customer:      g.customer ?? '',
      fabricCode:    g.fabricCode    ?? '',
      fabricStruct:  g.fabricStruct  ?? '',
      fabricPattern: g.fabricPattern ?? '',
      fabricW:       g.fabricW       ?? '',
    })
    fetch(`/api/warehouse/stock/detail?${p}`)
      .then(r => r.json())
      .then(d => { setStockEntries(d.stockEntries ?? []); setBillEntries(d.billEntries ?? []) })
      .finally(() => setDetailLoading(false))
  }, [])

  const openDetail = (g: StockGroup) => {
    setDetailGroup(g)
    setActiveDetailTab('stock')
    setEditingStock(null)
    setEditingBill(null)
    setDeleteStockRefId(null)
    setDeleteBill(null)
    fetchDetail(g)
  }

  const closeDetail = () => {
    setDetailGroup(null)
    setEditingStock(null)
    setEditingBill(null)
    setDeleteStockRefId(null)
    setDeleteBill(null)
    closeBulkDelete()
  }

  const switchDetailTab = (tab: 'stock' | 'bill') => {
    setActiveDetailTab(tab)
    setEditingStock(null)
    setEditingBill(null)
    setDeleteStockRefId(null)
    setDeleteBill(null)
  }

  // ── Bulk delete (whole tab) ────────────────────────────
  const openBulkDelete = (tab: 'stock' | 'bill') => {
    setBulkDeleteTab(tab)
    setBulkDeleteStep(1)
    setBulkDeleteCodeInput('')
  }

  const closeBulkDelete = () => {
    setBulkDeleteTab(null)
    setBulkDeleteStep(1)
    setBulkDeleteCodeInput('')
  }

  // The code the user must retype to unlock the confirm button
  const bulkDeleteConfirmCode = detailGroup?.fabricCode || detailGroup?.fabricStruct || detailGroup?.customer || ''

  const handleBulkDelete = async () => {
    if (!detailGroup || !bulkDeleteTab) return
    setBulkDeleting(true)
    const p = new URLSearchParams({
      tab:           bulkDeleteTab,
      customer:      detailGroup.customer      ?? '',
      fabricCode:    detailGroup.fabricCode    ?? '',
      fabricStruct:  detailGroup.fabricStruct  ?? '',
      fabricPattern: detailGroup.fabricPattern ?? '',
      fabricW:       detailGroup.fabricW       ?? '',
    })
    await fetch(`/api/warehouse/stock/detail?${p}`, { method: 'DELETE' })
    setBulkDeleting(false)
    closeBulkDelete()
    fetchDetail(detailGroup)
    reload()
  }

  // ── Stock entry handlers ──────────────────────────────
  const handleSaveStock = async () => {
    if (!editingStock || !detailGroup) return
    setStockSaving(true)
    await fetch('/api/warehouse/stock/detail', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refId: editingStock.refId, emp: editingStock.emp, createDate: editingStock.createDate }),
    })
    setStockSaving(false)
    setEditingStock(null)
    fetchDetail(detailGroup)
    reload()
  }

  const handleDeleteStock = async (refId: string) => {
    if (!detailGroup) return
    setStockSaving(true)
    await fetch(`/api/warehouse/stock/review?refId=${encodeURIComponent(refId)}`, { method: 'DELETE' })
    setStockSaving(false)
    setDeleteStockRefId(null)
    fetchDetail(detailGroup)
    reload()
  }

  // ── Bill entry handlers ───────────────────────────────
  const handleSaveBill = async () => {
    if (!editingBill || !detailGroup) return
    setBillSaving(true)
    await fetch('/api/warehouse/bill', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vatType: editingBill.vatType,
        vatNo: editingBill.vatNo,
        customerName: editingBill.customerName,
        receiveName:  editingBill.receiveName,
        fabricStruct:  editingBill.fabricStruct,
        fabricPattern: editingBill.fabricPattern,
        fabricW:       editingBill.fabricW,
      }),
    })
    setBillSaving(false)
    setEditingBill(null)
    fetchDetail(detailGroup)
  }

  const handleDeleteBill = async (vatType: string, vatNo: number) => {
    if (!detailGroup) return
    setBillSaving(true)
    await fetch(`/api/warehouse/bill?vatType=${vatType}&vatNo=${vatNo}`, { method: 'DELETE' })
    setBillSaving(false)
    setDeleteBill(null)
    fetchDetail(detailGroup)
    reload()
  }

  const handleSearch = () => { setAppliedQ(q); setAppliedSearchBy(searchBy); setAppliedCustomer(customer) }
  const handleClear = () => { setQ(''); setCustomer(''); setAppliedQ(''); setAppliedCustomer(''); setStockType('all') }

  const searchByOptions = [
    { value: 'fabricCode',    label: 'รหัสผ้า' },
    { value: 'fabricStruct',  label: 'โครงสร้างผ้า' },
    { value: 'fabricPattern', label: 'ลายผ้า' },
    { value: 'fabricW',       label: 'หน้ากว้าง' },
  ] as const

  const fmt = (n: number | null) => n == null ? '-' : Number(n).toLocaleString()

  const fmtDate = (d: string | null) => {
    if (!d) return '-'
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`
    } catch { return '-' }
  }

  const toInputDate = (d: string | null) => {
    if (!d) return ''
    try { return new Date(d).toISOString().slice(0, 10) } catch { return '' }
  }

  return (
    <div className="p-4 max-w-full">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">สต็อกผ้า</h1>
        <p className="text-sm text-gray-500">ทั้งหมด {total.toLocaleString()} กลุ่ม</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">ค้นหา</label>
            <div className="flex">
              <select
                value={searchBy}
                onChange={e => setSearchBy(e.target.value as typeof searchBy)}
                className="border border-r-0 border-gray-300 rounded-l-lg px-2 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:z-10">
                {searchByOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="พิมพ์ค้นหา..."
                className="flex-1 border border-gray-300 rounded-r-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ลูกค้า</label>
            <input value={customer} onChange={e => setCustomer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="ชื่อลูกค้า..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={handleSearch}
              className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">ค้นหา</button>
            <button onClick={handleClear}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">เคลียร์</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500 mr-1">ประเภท:</span>
          {(['all', 'produced', 'purchased'] as const).map(t => (
            <button key={t} onClick={() => { setStockType(t) }}
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
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">รหัสผ้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">โครงสร้างผ้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลายผ้า</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600">หน้ากว้าง</th>
                <th className="text-center px-2 py-1 font-medium text-gray-600 bg-blue-50 border-l border-blue-200" colSpan={2}>ผลิตแล้ว</th>
                <th className="text-center px-2 py-1 font-medium text-gray-600 bg-orange-50 border-l border-orange-200" colSpan={2}>ใช้ไป</th>
                <th className="text-center px-2 py-1 font-medium text-gray-600 bg-green-50 border-l border-green-200" colSpan={2}>คงเหลือ</th>
                <th className="text-center px-2 py-1 font-medium text-gray-600 w-20"></th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th colSpan={5}></th>
                <th className="text-right px-2 py-1 bg-blue-50 font-normal">พับ</th>
                <th className="text-right px-2 py-1 bg-blue-50 font-normal border-r border-blue-100">หลา</th>
                <th className="text-right px-2 py-1 bg-orange-50 font-normal">พับ</th>
                <th className="text-right px-2 py-1 bg-orange-50 font-normal border-r border-orange-100">หลา</th>
                <th className="text-right px-2 py-1 bg-green-50 font-normal">พับ</th>
                <th className="text-right px-2 py-1 bg-green-50 font-normal">หลา</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialLoading ? (
                <tr><td colSpan={12} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : stocks.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : stocks.map((s, i) => {
                const remFold = (s.lot_count ?? 0) - (s.used_fold ?? 0)
                const remYard = Number(s.produced_yard ?? 0) - Number(s.used_yard ?? 0)
                return (
                  <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2 text-gray-700 font-medium">{s.customer}</td>
                    <td className="px-3 py-2 text-gray-600">{s.fabricCode ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{s.fabricStruct ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[120px] truncate">{s.fabricPattern ?? '-'}</td>
                    <td className="px-3 py-2 text-center text-gray-700">{s.fabricW ?? '-'}</td>
                    <td className="px-2 py-2 text-right text-blue-700 bg-blue-50/50">{fmt(s.lot_count)}</td>
                    <td className="px-2 py-2 text-right text-blue-800 font-medium bg-blue-50/50">{fmt(Math.round(Number(s.produced_yard)))}</td>
                    <td className="px-2 py-2 text-right text-orange-700 bg-orange-50/50">{s.used_fold > 0 ? fmt(s.used_fold) : '-'}</td>
                    <td className="px-2 py-2 text-right text-orange-800 bg-orange-50/50">{s.used_yard > 0 ? fmt(Math.round(Number(s.used_yard))) : '-'}</td>
                    <td className="px-2 py-2 text-right font-medium bg-green-50/50 text-green-700">{fmt(Math.max(0, remFold))}</td>
                    <td className="px-2 py-2 text-right font-bold bg-green-50/50 text-green-700">{fmt(Math.max(0, Math.round(remYard)))}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => openDetail(s)}
                        className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded transition-colors whitespace-nowrap"
                      >
                        รายละเอียด
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <InfiniteScrollStatus
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          total={total}
          loadedCount={stocks.length}
          itemLabel="กลุ่ม"
        />
      </div>

      {/* ── Detail Modal ───────────────────────────────────── */}
      {detailGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[85vh]">

            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-start justify-between shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">รายละเอียดสต็อก</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {detailGroup.customer}
                  {detailGroup.fabricCode ? ` · ${detailGroup.fabricCode}` : ''}
                  {detailGroup.fabricStruct ? ` · ${detailGroup.fabricStruct}` : ''}
                  {detailGroup.fabricW ? ` ${detailGroup.fabricW}"` : ''}
                </p>
              </div>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-4 shrink-0">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 shrink-0">
              <button
                onClick={() => switchDetailTab('stock')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${activeDetailTab === 'stock' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                คีย์เข้าสต็อก ({stockEntries.length})
              </button>
              <button
                onClick={() => switchDetailTab('bill')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${activeDetailTab === 'bill' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                เปิดบิลผ้า ({billEntries.length})
              </button>
            </div>

            {/* Bulk delete toolbar */}
            {!detailLoading && (
              (activeDetailTab === 'stock' && stockEntries.length > 0) ||
              (activeDetailTab === 'bill' && billEntries.length > 0)
            ) && (
              <div className="flex justify-end px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 shrink-0">
                <button
                  onClick={() => openBulkDelete(activeDetailTab)}
                  className="px-2.5 py-1 text-xs border border-red-200 text-red-500 hover:bg-red-50 rounded transition-colors"
                >
                  ลบรายการทั้งหมด
                </button>
              </div>
            )}

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
                  กำลังโหลด...
                </div>
              ) : activeDetailTab === 'stock' ? (
                /* ── Tab: คีย์เข้าสต็อก ── */
                stockEntries.length === 0 ? (
                  <p className="text-center text-gray-400 py-10 text-sm">ไม่มีรายการคีย์เข้าสต็อก</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                        <th className="text-left px-3 py-2 font-medium">วันที่</th>
                        <th className="text-left px-3 py-2 font-medium">ผู้คีย์</th>
                        <th className="text-left px-3 py-2 font-medium">ประเภท</th>
                        <th className="text-right px-3 py-2 font-medium">พับ</th>
                        <th className="text-right px-3 py-2 font-medium">หลา</th>
                        <th className="text-center px-3 py-2 font-medium w-32"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stockEntries.map((e) => (
                        editingStock?.refId === e.refId ? (
                          /* Edit row */
                          <tr key={e.refId} className="bg-blue-50/40">
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                value={editingStock.createDate}
                                onChange={ev => setEditingStock(s => s ? { ...s, createDate: ev.target.value } : s)}
                                className="border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={editingStock.emp}
                                onChange={ev => setEditingStock(s => s ? { ...s, emp: ev.target.value } : s)}
                                className="border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="ผู้คีย์"
                              />
                            </td>
                            <td className="px-3 py-2 text-gray-500">{e.is_purchased ? 'ผ้าซื้อเข้า' : 'ผ้าผลิต'}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{e.fold_count.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">{Math.round(e.total_yard).toLocaleString()}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={handleSaveStock}
                                  disabled={stockSaving}
                                  className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {stockSaving ? '...' : 'บันทึก'}
                                </button>
                                <button
                                  onClick={() => setEditingStock(null)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : deleteStockRefId === e.refId ? (
                          /* Delete confirm row */
                          <tr key={e.refId} className="bg-red-50/40">
                            <td colSpan={5} className="px-3 py-2 text-xs text-red-700 font-medium">
                              ยืนยันลบรายการ {fmtDate(e.create_date)} ({e.fold_count} พับ, {Math.round(e.total_yard).toLocaleString()} หลา)?
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleDeleteStock(e.refId)}
                                  disabled={stockSaving}
                                  className="px-2.5 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                >
                                  {stockSaving ? '...' : 'ลบ'}
                                </button>
                                <button
                                  onClick={() => setDeleteStockRefId(null)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          /* Normal row */
                          <tr key={e.refId} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(e.create_date)}</td>
                            <td className="px-3 py-2 text-gray-800">{e.emp ?? '-'}</td>
                            <td className="px-3 py-2 text-gray-500">{e.is_purchased ? 'ผ้าซื้อเข้า' : 'ผ้าผลิต'}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{e.fold_count.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">{Math.round(e.total_yard).toLocaleString()}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingStock({ refId: e.refId, emp: e.emp ?? '', createDate: toInputDate(e.create_date) })
                                    setDeleteStockRefId(null)
                                  }}
                                  className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded transition-colors"
                                >
                                  แก้ไข
                                </button>
                                <button
                                  onClick={() => { setDeleteStockRefId(e.refId); setEditingStock(null) }}
                                  className="px-2.5 py-1 text-xs border border-red-200 text-red-500 hover:bg-red-50 rounded transition-colors"
                                >
                                  ลบ
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                        <td colSpan={3} className="px-3 py-2 text-xs text-gray-600">รวมทั้งหมด</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-800">
                          {stockEntries.reduce((s, e) => s + e.fold_count, 0).toLocaleString()} พับ
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                          {Math.round(stockEntries.reduce((s, e) => s + e.total_yard, 0)).toLocaleString()} หลา
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )
              ) : (
                /* ── Tab: เปิดบิลผ้า ── */
                billEntries.length === 0 ? (
                  <p className="text-center text-gray-400 py-10 text-sm">ไม่มีรายการเปิดบิลผ้า</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                        <th className="text-left px-3 py-2 font-medium">บิล</th>
                        <th className="text-left px-3 py-2 font-medium">วันที่</th>
                        <th className="text-left px-3 py-2 font-medium">ลูกค้า / ผู้รับ</th>
                        <th className="text-right px-3 py-2 font-medium">พับ</th>
                        <th className="text-right px-3 py-2 font-medium">หลา</th>
                        <th className="text-center px-3 py-2 font-medium w-36"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {billEntries.map((b) => (
                        editingBill?.vatType === b.vatType && editingBill?.vatNo === b.vatNo ? (
                          /* Edit row */
                          <tr key={`${b.vatType}${b.vatNo}`} className="bg-blue-50/40">
                            <td className="px-3 py-2 font-mono font-medium text-blue-700">{b.vatType}-{b.vatNo}</td>
                            <td className="px-3 py-2 text-gray-500">{fmtDate(b.createDate)}</td>
                            <td className="px-3 py-2" colSpan={2}>
                              <div className="space-y-1">
                                <input
                                  value={editingBill.customerName}
                                  onChange={ev => setEditingBill(s => s ? { ...s, customerName: ev.target.value } : s)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="ลูกค้า"
                                />
                                <input
                                  value={editingBill.receiveName}
                                  onChange={ev => setEditingBill(s => s ? { ...s, receiveName: ev.target.value } : s)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="ผู้รับ"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">{Math.round(b.totalYard).toLocaleString()}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={handleSaveBill}
                                  disabled={billSaving}
                                  className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {billSaving ? '...' : 'บันทึก'}
                                </button>
                                <button
                                  onClick={() => setEditingBill(null)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : deleteBill?.vatType === b.vatType && deleteBill?.vatNo === b.vatNo ? (
                          /* Delete confirm row */
                          <tr key={`${b.vatType}${b.vatNo}`} className="bg-red-50/40">
                            <td colSpan={5} className="px-3 py-2 text-xs text-red-700 font-medium">
                              ยืนยันลบบิล {b.vatType}-{b.vatNo} ({b.foldCount} พับ, {Math.round(b.totalYard).toLocaleString()} หลา)?
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleDeleteBill(b.vatType, b.vatNo)}
                                  disabled={billSaving}
                                  className="px-2.5 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                >
                                  {billSaving ? '...' : 'ลบ'}
                                </button>
                                <button
                                  onClick={() => setDeleteBill(null)}
                                  className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          /* Normal row */
                          <tr key={`${b.vatType}${b.vatNo}`} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-3 py-2 font-mono font-medium text-blue-700">{b.vatType}-{b.vatNo}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(b.createDate)}</td>
                            <td className="px-3 py-2">
                              <div className="text-gray-800">{b.customerName ?? '-'}</div>
                              {b.receiveName && <div className="text-gray-400">{b.receiveName}</div>}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{b.foldCount.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">{Math.round(b.totalYard).toLocaleString()}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <a
                                  href={`/warehouse/bill/print/${b.vatNo}?vatType=${b.vatType}`}
                                  target="_blank"
                                  className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                                >
                                  พิมพ์
                                </a>
                                <button
                                  onClick={() => {
                                    setEditingBill({
                                      vatType: b.vatType, vatNo: b.vatNo,
                                      customerName: b.customerName ?? '',
                                      receiveName:  b.receiveName  ?? '',
                                      fabricStruct:  detailGroup.fabricStruct  ?? '',
                                      fabricPattern: detailGroup.fabricPattern ?? '',
                                      fabricW:       detailGroup.fabricW       ?? '',
                                    })
                                    setDeleteBill(null)
                                  }}
                                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded transition-colors"
                                >
                                  แก้ไข
                                </button>
                                <button
                                  onClick={() => { setDeleteBill({ vatType: b.vatType, vatNo: b.vatNo }); setEditingBill(null) }}
                                  className="px-2 py-1 text-xs border border-red-200 text-red-500 hover:bg-red-50 rounded transition-colors"
                                >
                                  ลบ
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                        <td colSpan={3} className="px-3 py-2 text-xs text-gray-600">รวมทั้งหมด</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-800">
                          {billEntries.reduce((s, b) => s + b.foldCount, 0).toLocaleString()} พับ
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                          {Math.round(billEntries.reduce((s, b) => s + b.totalYard, 0)).toLocaleString()} หลา
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end shrink-0">
              <button
                onClick={closeDetail}
                className="px-4 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk delete confirm dialog ─────────────────────── */}
      {bulkDeleteTab && detailGroup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeBulkDelete} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">
                ลบรายการทั้งหมด — {bulkDeleteTab === 'stock' ? 'คีย์เข้าสต็อก' : 'เปิดบิลผ้า'}
              </h2>
            </div>

            <div className="px-5 py-4 space-y-3">
              {bulkDeleteStep === 1 ? (
                <p className="text-sm text-gray-700">
                  คุณกำลังจะลบ{' '}
                  <span className="font-semibold text-red-600">
                    {bulkDeleteTab === 'stock' ? stockEntries.length : billEntries.length} รายการ
                  </span>{' '}
                  ของ {detailGroup.customer}
                  {detailGroup.fabricCode ? ` · ${detailGroup.fabricCode}` : ''} ทั้งหมด
                  การลบนี้ไม่สามารถย้อนกลับได้ผ่านหน้านี้
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-700">
                    เพื่อยืนยัน กรุณาพิมพ์ <span className="font-mono font-semibold text-gray-900">{bulkDeleteConfirmCode}</span> ให้ตรงกับรายการที่จะลบ
                  </p>
                  <input
                    autoFocus
                    value={bulkDeleteCodeInput}
                    onChange={ev => setBulkDeleteCodeInput(ev.target.value)}
                    placeholder={bulkDeleteConfirmCode}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
              <button
                onClick={closeBulkDelete}
                className="px-4 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                ยกเลิก
              </button>
              {bulkDeleteStep === 1 ? (
                <button
                  onClick={() => setBulkDeleteStep(2)}
                  className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  ดำเนินการต่อ
                </button>
              ) : (
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting || bulkDeleteCodeInput !== bulkDeleteConfirmCode}
                  className="px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkDeleting ? 'กำลังลบ...' : 'ยืนยันลบทั้งหมด'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
