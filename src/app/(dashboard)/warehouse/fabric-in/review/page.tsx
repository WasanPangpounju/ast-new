'use client'
import { useState, useEffect, useCallback } from 'react'

interface StockGroup {
  refId: string
  emp: string
  customer: string
  fabricStruct: string | null
  fabricPattern: string | null
  fabricW: string | null
  fabricCode: string | null
  fold_count: number
  total_yard: number
  create_date: string
}

interface EditForm {
  customer: string
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  fabricCode: string
}

interface FoldItem {
  id: number
  fold: number | null
  sumYard: number
}

export default function StockReviewPage() {
  const [groups, setGroups] = useState<StockGroup[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [appliedQ, setAppliedQ] = useState('')
  const [appliedDateFrom, setAppliedDateFrom] = useState('')
  const [appliedDateTo, setAppliedDateTo] = useState('')

  const [manageGroup, setManageGroup] = useState<StockGroup | null>(null)
  const [activeTab, setActiveTab] = useState<'group' | 'folds'>('group')
  const [editForm, setEditForm] = useState<EditForm>({ customer: '', fabricStruct: '', fabricPattern: '', fabricW: '', fabricCode: '' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [folds, setFolds] = useState<FoldItem[]>([])
  const [foldsLoading, setFoldsLoading] = useState(false)
  const [editingFold, setEditingFold] = useState<{ id: number; yard: string } | null>(null)
  const [foldSaving, setFoldSaving] = useState(false)
  const [confirmDeleteFold, setConfirmDeleteFold] = useState<number | null>(null)

  const fetchGroups = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page) })
    if (appliedQ) p.set('q', appliedQ)
    if (appliedDateFrom) p.set('dateFrom', appliedDateFrom)
    if (appliedDateTo) p.set('dateTo', appliedDateTo)
    fetch(`/api/warehouse/stock/review?${p}`)
      .then(r => r.json())
      .then(d => { setGroups(d.groups ?? []); setTotal(d.total ?? 0) })
      .finally(() => setLoading(false))
  }, [page, appliedQ, appliedDateFrom, appliedDateTo])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  const fetchFolds = useCallback((refId: string) => {
    setFoldsLoading(true)
    fetch(`/api/warehouse/stock/review/folds?refId=${encodeURIComponent(refId)}`)
      .then(r => r.json())
      .then(d => setFolds(d.folds ?? []))
      .finally(() => setFoldsLoading(false))
  }, [])

  const totalPages = Math.ceil(total / 20)

  const fmtDate = (d: string) => {
    if (!d) return '-'
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()+543}`
    } catch { return '-' }
  }

  const handleSearch = () => { setPage(1); setAppliedQ(q); setAppliedDateFrom(dateFrom); setAppliedDateTo(dateTo) }
  const handleClear = () => {
    setQ(''); setDateFrom(''); setDateTo('')
    setAppliedQ(''); setAppliedDateFrom(''); setAppliedDateTo('')
    setPage(1)
  }

  const openManage = (g: StockGroup) => {
    setManageGroup(g)
    setActiveTab('group')
    setEditForm({
      customer: g.customer === 'AST' ? '' : g.customer,
      fabricStruct: g.fabricStruct ?? '',
      fabricPattern: g.fabricPattern ?? '',
      fabricW: g.fabricW ?? '',
      fabricCode: g.fabricCode ?? '',
    })
    setConfirmDelete(false)
    setEditingFold(null)
    setConfirmDeleteFold(null)
  }

  const closeManage = () => {
    setManageGroup(null)
    setConfirmDelete(false)
    setEditingFold(null)
    setConfirmDeleteFold(null)
  }

  const switchTab = (tab: 'group' | 'folds') => {
    setActiveTab(tab)
    setConfirmDelete(false)
    setEditingFold(null)
    setConfirmDeleteFold(null)
    if (tab === 'folds' && manageGroup) fetchFolds(manageGroup.refId)
  }

  const handleSave = async () => {
    if (!manageGroup) return
    setSaving(true)
    await fetch('/api/warehouse/stock/review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refId: manageGroup.refId, ...editForm }),
    })
    setSaving(false)
    closeManage()
    fetchGroups()
  }

  const handleDelete = async () => {
    if (!manageGroup) return
    setSaving(true)
    await fetch(`/api/warehouse/stock/review?refId=${encodeURIComponent(manageGroup.refId)}`, { method: 'DELETE' })
    setSaving(false)
    closeManage()
    fetchGroups()
  }

  const handleSaveFold = async () => {
    if (!editingFold || !manageGroup) return
    setFoldSaving(true)
    await fetch('/api/warehouse/stock/review/folds', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingFold.id, sumYard: editingFold.yard }),
    })
    setFoldSaving(false)
    setEditingFold(null)
    fetchFolds(manageGroup.refId)
    fetchGroups()
  }

  const handleDeleteFold = async (id: number) => {
    if (!manageGroup) return
    setFoldSaving(true)
    await fetch(`/api/warehouse/stock/review/folds?id=${id}`, { method: 'DELETE' })
    setFoldSaving(false)
    setConfirmDeleteFold(null)
    fetchFolds(manageGroup.refId)
    fetchGroups()
  }

  return (
    <div className="p-4 max-w-full">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">ตรวจสอบคีย์ผ้า</h1>
        <p className="text-sm text-gray-500">ทั้งหมด {total.toLocaleString()} รายการ</p>
      </div>

      {/* Search */}
      <div className="bg-white border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">ค้นหา (โครงสร้างผ้า, ลูกค้า)</label>
            <input value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="พิมพ์ค้นหา..."
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่เริ่ม</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่สิ้นสุด</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end gap-2 md:col-span-4">
            <button type="button" onClick={handleSearch}
              className="px-6 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium">ค้นหา</button>
            <button type="button" onClick={handleClear}
              className="px-4 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 text-gray-600">เคลียร์</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">วันที่</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลูกค้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">รหัสผ้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">โครงสร้างผ้า</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลายผ้า</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600">หน้ากว้าง</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600">พับ</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600">หลา</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : groups.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : groups.map((g, i) => (
                <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(g.create_date)}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">{g.customer}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">{g.fabricCode || '-'}</td>
                  <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate">{g.fabricStruct ?? '-'}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-30 truncate">{g.fabricPattern || '-'}</td>
                  <td className="px-3 py-2 text-center text-gray-700">{g.fabricW || '-'}</td>
                  <td className="px-3 py-2 text-right text-gray-800">{g.fold_count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{Math.round(Number(g.total_yard)).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    <button type="button" onClick={() => openManage(g)}
                      className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 transition-colors">
                      จัดการ
                    </button>
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
              <button type="button" onClick={() => setPage(1)} disabled={page===1} className="px-2 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">«</button>
              <button type="button" onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-3 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">‹</button>
              <button type="button" onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-3 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">›</button>
              <button type="button" onClick={() => setPage(totalPages)} disabled={page===totalPages} className="px-2 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">»</button>
            </div>
          </div>
        )}
      </div>

      {/* Manage Modal */}
      {manageGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeManage} />
          <div className="relative bg-white shadow-xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">จัดการรายการ</h2>
              <button type="button" onClick={closeManage} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button type="button" onClick={() => switchTab('group')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'group' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                ข้อมูลกลุ่ม
              </button>
              <button type="button" onClick={() => switchTab('folds')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'folds' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                แก้ไขพับ ({manageGroup.fold_count})
              </button>
            </div>

            {/* Tab: ข้อมูลกลุ่ม */}
            {activeTab === 'group' && (
              <>
                {!confirmDelete ? (
                  <>
                    <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                      {[
                        { label: 'รหัสผ้า', key: 'fabricCode', placeholder: 'เช่น TC34/13065' },
                        { label: 'ลูกค้า', key: 'customer', placeholder: 'AST' },
                        { label: 'โครงสร้างผ้า', key: 'fabricStruct' },
                        { label: 'ลายผ้า', key: 'fabricPattern' },
                        { label: 'หน้ากว้าง', key: 'fabricW' },
                      ].map(({ label, key, placeholder }) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-500 mb-1">{label}</label>
                          <input
                            value={editForm[key as keyof EditForm]}
                            onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      ))}
                      <p className="text-xs text-gray-400">การแก้ไขจะมีผลกับทุกพับใน refId นี้ ({manageGroup.fold_count} พับ)</p>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                      <button type="button" onClick={() => setConfirmDelete(true)}
                        className="px-4 py-1.5 text-xs border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                        ลบทั้งกลุ่ม
                      </button>
                      <div className="flex gap-2">
                        <button type="button" onClick={closeManage} className="px-4 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 text-gray-600">ยกเลิก</button>
                        <button type="button" onClick={handleSave} disabled={saving}
                          className="px-5 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium">
                          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-5 py-6 text-center">
                      <div className="w-12 h-12 bg-red-100 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">ยืนยันการลบ</p>
                      <p className="text-xs text-gray-500">จะลบทั้งหมด <span className="font-medium text-gray-700">{manageGroup.fold_count} พับ</span> ใน refId นี้</p>
                      <p className="text-xs text-gray-400 mt-1">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-center">
                      <button type="button" onClick={() => setConfirmDelete(false)} className="px-5 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 text-gray-600">ยกเลิก</button>
                      <button type="button" onClick={handleDelete} disabled={saving}
                        className="px-5 py-1.5 text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-medium">
                        {saving ? 'กำลังลบ...' : 'ยืนยันลบ'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Tab: แก้ไขพับ */}
            {activeTab === 'folds' && (
              <div className="max-h-[65vh] overflow-y-auto">
                {foldsLoading ? (
                  <div className="flex justify-center py-8 text-gray-400 text-xs">กำลังโหลด...</div>
                ) : folds.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">ไม่พบข้อมูล</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-center px-3 py-2 font-medium text-gray-600 w-12">ลำดับ</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">หลา</th>
                        <th className="px-3 py-2 w-28" aria-label="actions"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {folds.map((f, idx) => (
                        <tr key={f.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-center text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-2 text-right">
                            {editingFold?.id === f.id ? (
                              <input
                                type="number" min="0" step="0.5"
                                value={editingFold.yard}
                                onChange={e => setEditingFold(v => v ? { ...v, yard: e.target.value } : v)}
                                title="จำนวนหลา"
                                className="w-24 text-right border border-blue-400 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ml-auto block"
                                autoFocus
                              />
                            ) : (
                              <span className="font-medium text-gray-900">{f.sumYard.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {confirmDeleteFold === f.id ? (
                              <div className="flex gap-1 justify-end">
                                <button type="button" onClick={() => setConfirmDeleteFold(null)} className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">ยกเลิก</button>
                                <button type="button" onClick={() => handleDeleteFold(f.id)} disabled={foldSaving} className="px-2 py-0.5 text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">ลบ</button>
                              </div>
                            ) : editingFold?.id === f.id ? (
                              <div className="flex gap-1 justify-end">
                                <button type="button" onClick={() => setEditingFold(null)} className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">ยกเลิก</button>
                                <button type="button" onClick={handleSaveFold} disabled={foldSaving} className="px-2 py-0.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">บันทึก</button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-end">
                                <button type="button" onClick={() => setEditingFold({ id: f.id, yard: String(f.sumYard) })} className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">แก้ไข</button>
                                <button type="button" onClick={() => setConfirmDeleteFold(f.id)} className="px-2 py-0.5 text-xs border border-red-200 text-red-500 hover:bg-red-50">ลบ</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td className="px-3 py-2 text-xs text-gray-500 text-center">{folds.length} พับ</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-gray-800">
                          {folds.reduce((s, f) => s + f.sumYard, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
