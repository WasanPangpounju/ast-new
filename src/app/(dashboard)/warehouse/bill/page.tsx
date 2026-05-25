"use client";
import { useState, useEffect, useCallback } from "react";

interface Bill {
  vatType: string;
  vatNo: number;
  customerName: string | null;
  receiveName: string | null;
  fabricStruct: string | null;
  fabricPattern: string | null;
  fabricW: string | null;
  createDate: string;
  foldCount: number;
  totalYard: number;
  altFabricStruct: string | null;
  altPurchaseOrder: string | null;
}

interface EditForm {
  customerName: string;
  receiveName: string;
  fabricStruct: string;
  fabricPattern: string;
  fabricW: string;
  altFabricStruct: string;
  altPurchaseOrder: string;
}

interface FoldItem {
  id: number;
  fold: number | null;
  sumYard: number;
}

export default function BillListPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");

  const [manageBill, setManageBill] = useState<Bill | null>(null);
  const [activeTab, setActiveTab] = useState<'bill' | 'folds'>('bill');
  const [editForm, setEditForm] = useState<EditForm>({ customerName: "", receiveName: "", fabricStruct: "", fabricPattern: "", fabricW: "", altFabricStruct: "", altPurchaseOrder: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [folds, setFolds] = useState<FoldItem[]>([]);
  const [foldsLoading, setFoldsLoading] = useState(false);
  const [editingFold, setEditingFold] = useState<{ id: number; yard: string } | null>(null);
  const [foldSaving, setFoldSaving] = useState(false);
  const [confirmDeleteFold, setConfirmDeleteFold] = useState<number | null>(null);

  const fetchBills = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page) });
    if (applied) p.set("search", applied);
    fetch(`/api/warehouse/bill?${p}`)
      .then((r) => r.json())
      .then((d) => { setBills(d.bills ?? []); setTotal(d.total ?? 0); })
      .finally(() => setLoading(false));
  }, [page, applied]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const totalPages = Math.ceil(total / 20);

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear() + 543}`;
    } catch { return "-"; }
  };

  const openPrint = (vatType: string, vatNo: number) =>
    window.open(`/warehouse/bill/print/${vatNo}?vatType=${vatType}`, "_blank");

  const fetchFolds = useCallback((vatType: string, vatNo: number) => {
    setFoldsLoading(true);
    fetch(`/api/warehouse/bill/folds?vatType=${vatType}&vatNo=${vatNo}`)
      .then(r => r.json())
      .then(d => setFolds(d.folds ?? []))
      .finally(() => setFoldsLoading(false));
  }, []);

  const openManage = (b: Bill) => {
    setManageBill(b);
    setActiveTab('bill');
    setEditForm({
      customerName: b.customerName ?? "",
      receiveName: b.receiveName ?? "",
      fabricStruct: b.fabricStruct ?? "",
      fabricPattern: b.fabricPattern ?? "",
      fabricW: b.fabricW ?? "",
      altFabricStruct: b.altFabricStruct ?? "",
      altPurchaseOrder: b.altPurchaseOrder ?? "",
    });
    setConfirmDelete(false);
    setEditingFold(null);
    setConfirmDeleteFold(null);
  };

  const closeManage = () => {
    setManageBill(null);
    setConfirmDelete(false);
    setEditingFold(null);
    setConfirmDeleteFold(null);
  };

  const switchTab = (tab: 'bill' | 'folds') => {
    setActiveTab(tab);
    setConfirmDelete(false);
    setEditingFold(null);
    setConfirmDeleteFold(null);
    if (tab === 'folds' && manageBill) fetchFolds(manageBill.vatType, manageBill.vatNo);
  };

  const handleSaveFold = async () => {
    if (!editingFold || !manageBill) return;
    setFoldSaving(true);
    await fetch('/api/warehouse/bill/folds', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingFold.id, sumYard: editingFold.yard }),
    });
    setFoldSaving(false);
    setEditingFold(null);
    fetchFolds(manageBill.vatType, manageBill.vatNo);
    fetchBills();
  };

  const handleDeleteFold = async (id: number) => {
    if (!manageBill) return;
    setFoldSaving(true);
    await fetch(`/api/warehouse/bill/folds?id=${id}`, { method: 'DELETE' });
    setFoldSaving(false);
    setConfirmDeleteFold(null);
    fetchFolds(manageBill.vatType, manageBill.vatNo);
    fetchBills();
  };

  const handleSave = async () => {
    if (!manageBill) return;
    setSaving(true);
    await fetch("/api/warehouse/bill", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vatType: manageBill.vatType, vatNo: manageBill.vatNo, ...editForm }),
    });
    setSaving(false);
    closeManage();
    fetchBills();
  };

  const handleDelete = async () => {
    if (!manageBill) return;
    setSaving(true);
    await fetch(`/api/warehouse/bill?vatType=${manageBill.vatType}&vatNo=${manageBill.vatNo}`, { method: "DELETE" });
    setSaving(false);
    closeManage();
    fetchBills();
  };

  return (
    <div className="p-4 w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">พิมพ์บิลส่งของ</h1>
          <p className="text-sm text-gray-500">ทั้งหมด {total.toLocaleString()} บิล</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 p-4 mb-4 shadow-sm flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาลูกค้า, เลขที่บิล..."
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), setApplied(search))}
          className="flex-1 border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="button" onClick={() => { setPage(1); setApplied(search); }}
          className="px-6 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium">
          ค้นหา
        </button>
        <button type="button" onClick={() => { setSearch(""); setApplied(""); setPage(1); }}
          className="px-4 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 text-gray-600">
          เคลียร์
        </button>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">เลขที่บิล</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">วันที่</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ลูกค้า / ผู้รับ</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">โครงสร้างผ้า</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-16">พับ</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-24">หลา</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-24">พิมพ์</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-20" aria-label="actions"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : bills.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : bills.map((b, i) => (
                <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-3 py-2 font-mono font-medium text-blue-700">{b.vatType} - {b.vatNo}</td>
                  <td className="px-3 py-2 text-gray-500">{fmtDate(b.createDate)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800">{b.customerName ?? "-"}</div>
                    {b.receiveName && <div className="text-gray-400">{b.receiveName}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 max-w-50 truncate">
                    {b.altFabricStruct || b.fabricStruct || "-"}{" "}
                    {b.fabricW ? `${b.fabricW}''` : ""}{" "}
                    {b.fabricPattern ?? ""}
                    {b.altPurchaseOrder && <span className="ml-1 text-gray-400">({b.altPurchaseOrder})</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-800">{b.foldCount}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{Number(b.totalYard).toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    <button type="button" onClick={() => openPrint(b.vatType, b.vatNo)}
                      className="text-xs px-3 py-1 bg-green-600 text-white hover:bg-green-700 transition-colors font-medium inline-flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M5 1a2 2 0 0 0-2 2v1h10V3a2 2 0 0 0-2-2zm6 8H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1" />
                        <path d="M0 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2H2a2 2 0 0 1-2-2zm2.5 1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1" />
                      </svg>
                      พิมพ์
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button type="button" onClick={() => openManage(b)}
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
            <p className="text-xs text-gray-500">หน้า {page} จาก {totalPages}</p>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">«</button>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">‹</button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">›</button>
              <button type="button" onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">»</button>
            </div>
          </div>
        )}
      </div>

      {/* Manage Modal */}
      {manageBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeManage} />
          <div className="relative bg-white shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">
                จัดการบิล {manageBill.vatType}-{manageBill.vatNo}
              </h2>
              <button type="button" onClick={closeManage} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button type="button" onClick={() => switchTab('bill')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'bill' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                ข้อมูลบิล
              </button>
              <button type="button" onClick={() => switchTab('folds')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'folds' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                แก้ไขพับ ({manageBill.foldCount})
              </button>
            </div>

            {/* Tab: ข้อมูลบิล */}
            {activeTab === 'bill' && (
              <>
                {!confirmDelete ? (
                  <>
                    <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                      {[
                        { label: "ลูกค้า / ผู้สั่ง", key: "customerName" },
                        { label: "ผู้รับ", key: "receiveName" },
                        { label: "โครงสร้างผ้า", key: "fabricStruct" },
                        { label: "ลายผ้า", key: "fabricPattern" },
                        { label: "หน้ากว้าง", key: "fabricW" },
                        { label: "โครงสร้างผ้า (ทางเลือก)", key: "altFabricStruct" },
                        { label: "เลขที่ใบสั่งซื้อ (ทางเลือก)", key: "altPurchaseOrder" },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-500 mb-1">{label}</label>
                          <input
                            value={editForm[key as keyof EditForm]}
                            onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                            title={label}
                            className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                      <p className="text-xs text-gray-400">การแก้ไขจะมีผลกับทุกรายการในบิลนี้ ({manageBill.foldCount} รายการ)</p>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                      <button type="button" onClick={() => setConfirmDelete(true)}
                        className="px-4 py-1.5 text-xs border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                        ลบบิล
                      </button>
                      <div className="flex gap-2">
                        <button type="button" onClick={closeManage} className="px-4 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 text-gray-600">ยกเลิก</button>
                        <button type="button" onClick={handleSave} disabled={saving}
                          className="px-5 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium">
                          {saving ? "กำลังบันทึก..." : "บันทึก"}
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
                      <p className="text-sm font-medium text-gray-900 mb-1">ยืนยันการลบบิล</p>
                      <p className="text-xs text-gray-500">
                        บิล <span className="font-medium text-gray-700">{manageBill.vatType}-{manageBill.vatNo}</span> จำนวน {manageBill.foldCount} รายการ
                      </p>
                      <p className="text-xs text-gray-400 mt-1">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-center">
                      <button type="button" onClick={() => setConfirmDelete(false)} className="px-5 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 text-gray-600">ยกเลิก</button>
                      <button type="button" onClick={handleDelete} disabled={saving}
                        className="px-5 py-1.5 text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-medium">
                        {saving ? "กำลังลบ..." : "ยืนยันลบ"}
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
  );
}
