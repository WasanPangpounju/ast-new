"use client";
import { useState, useEffect, useCallback, useRef } from "react";

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
  hasStockMatch: boolean;
  stockFabricStruct: string | null;
  stockFabricW: string | null;
  stockFabricPattern: string | null;
  stockCustomer: string | null;
  orderId: number | null;
  purchaseOrder: string | null;
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

interface DateHistoryEntry {
  id: number;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
}

interface StockResult {
  fabricStruct: string;
  fabricPattern: string;
  fabricW: string;
  fabricCode: string | null;
  customer: string;
  produced_fold: number;
  produced_yard: number;
  used_fold: number;
  used_yard: number;
}

interface OrderResult {
  id: number;
  purchaseOrder: string;
  customerName: string;
  fabricStructure: string;
  fabricPattern: string;
  fabricId: string;
  fabricW: string;
  orderSumYard: number;
  deliveredYard: number;
  remainingYard: number;
}

type ActiveTab = 'bill' | 'stock' | 'order' | 'folds';

export default function BillListPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [noStockOnly, setNoStockOnly] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [searchDropdown, setSearchDropdown] = useState(false);

  const [manageBill, setManageBill] = useState<Bill | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('bill');
  const [editForm, setEditForm] = useState<EditForm>({ customerName: "", receiveName: "", fabricStruct: "", fabricPattern: "", fabricW: "", altFabricStruct: "", altPurchaseOrder: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [folds, setFolds] = useState<FoldItem[]>([]);
  const [foldsLoading, setFoldsLoading] = useState(false);
  const [editingFold, setEditingFold] = useState<{ id: number; yard: string } | null>(null);
  const [foldSaving, setFoldSaving] = useState(false);
  const [confirmDeleteFold, setConfirmDeleteFold] = useState<number | null>(null);

  const [stockSearch, setStockSearch] = useState("");
  const [stockResults, setStockResults] = useState<StockResult[]>([]);
  const [stockSearching, setStockSearching] = useState(false);
  const [stockSaving, setStockSaving] = useState(false);
  const stockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [orderSearch, setOrderSearch] = useState("");
  const [orderResults, setOrderResults] = useState<OrderResult[]>([]);
  const [orderSearching, setOrderSearching] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const orderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // แก้ไขวันที่บิล (createDate) — inline ที่คอลัมน์ "วันที่" ของตารางบิล
  const [editingDate, setEditingDate] = useState<{ vatType: string; vatNo: number; value: string } | null>(null);
  const [dateSaving, setDateSaving] = useState(false);
  const [historyOpenKey, setHistoryOpenKey] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCache, setHistoryCache] = useState<Record<string, DateHistoryEntry[]>>({});

  const fetchBills = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page) });
    if (applied) p.set("search", applied);
    if (noStockOnly) p.set("noStockOnly", "1");
    fetch(`/api/warehouse/bill?${p}`)
      .then((r) => r.json())
      .then((d) => { setBills(d.bills ?? []); setTotal(d.total ?? 0); })
      .finally(() => setLoading(false));
  }, [page, applied, noStockOnly]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  // Search box suggestions (customer / receiver names) debounce
  useEffect(() => {
    if (!search || search.length < 1) {
      setSearchSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/warehouse/bill/suggestions?q=" + encodeURIComponent(search))
        .then((r) => r.json())
        .then((d) => setSearchSuggestions(d.data ?? []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const totalPages = Math.ceil(total / 20);

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear()}`;
    } catch { return "-"; }
  };

  const fmtDateTime = (d: string) => {
    try {
      return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    } catch { return "-"; }
  };

  const dateKey = (vatType: string, vatNo: number) => `${vatType}-${vatNo}`;

  const openPrint = (vatType: string, vatNo: number) =>
    window.open(`/warehouse/bill/print/${vatNo}?vatType=${vatType}`, "_blank");

  const openEditDate = (b: Bill) => {
    setHistoryOpenKey(null);
    setEditingDate({ vatType: b.vatType, vatNo: b.vatNo, value: new Date(b.createDate).toISOString().slice(0, 10) });
  };

  const handleSaveDate = async () => {
    if (!editingDate || dateSaving) return;
    setDateSaving(true);
    try {
      const res = await fetch("/api/warehouse/bill/date", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vatType: editingDate.vatType, vatNo: editingDate.vatNo, newDate: editingDate.value }),
      });
      if (res.ok) {
        const d = await res.json();
        const key = dateKey(editingDate.vatType, editingDate.vatNo);
        setHistoryCache(c => { const n = { ...c }; delete n[key]; return n; }); // invalidate cached history
        setManageBill(mb => mb && mb.vatType === editingDate.vatType && mb.vatNo === editingDate.vatNo ? { ...mb, createDate: d.createDate } : mb);
        setEditingDate(null);
        fetchBills();
      }
    } finally {
      setDateSaving(false);
    }
  };

  const toggleHistory = async (b: Bill) => {
    const key = dateKey(b.vatType, b.vatNo);
    if (historyOpenKey === key) { setHistoryOpenKey(null); return; }
    setEditingDate(null);
    setHistoryOpenKey(key);
    if (!historyCache[key]) {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/warehouse/bill/date?vatType=${encodeURIComponent(b.vatType)}&vatNo=${b.vatNo}`);
        const d = await res.json();
        setHistoryCache(c => ({ ...c, [key]: d.history ?? [] }));
      } finally {
        setHistoryLoading(false);
      }
    }
  };

  const fetchFolds = useCallback((vatType: string, vatNo: number) => {
    setFoldsLoading(true);
    fetch(`/api/warehouse/bill/folds?vatType=${vatType}&vatNo=${vatNo}`)
      .then(r => r.json())
      .then(d => setFolds(d.folds ?? []))
      .finally(() => setFoldsLoading(false));
  }, []);

  const doStockSearch = useCallback((q: string) => {
    if (!q.trim()) { setStockResults([]); return; }
    setStockSearching(true);
    fetch(`/api/warehouse/stock/search?q=${encodeURIComponent(q.trim())}`)
      .then(r => r.json())
      .then(d => setStockResults(d.results ?? []))
      .finally(() => setStockSearching(false));
  }, []);

  const doOrderSearch = useCallback((q: string) => {
    if (!q.trim()) { setOrderResults([]); return; }
    setOrderSearching(true);
    fetch(`/api/warehouse/orders/search?q=${encodeURIComponent(q.trim())}`)
      .then(r => r.json())
      .then(d => setOrderResults(d.orders ?? []))
      .finally(() => setOrderSearching(false));
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
    setStockSearch(""); setStockResults([]);
    setOrderSearch(""); setOrderResults([]);
    setEditingDate(null);
    setHistoryOpenKey(null);
  };

  const closeManage = () => {
    setManageBill(null);
    setConfirmDelete(false);
    setEditingFold(null);
    setConfirmDeleteFold(null);
    setStockResults([]);
    setOrderResults([]);
    setEditingDate(null);
    setHistoryOpenKey(null);
  };

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setConfirmDelete(false);
    setEditingFold(null);
    setConfirmDeleteFold(null);
    setEditingDate(null);
    setHistoryOpenKey(null);
    if (tab === 'folds' && manageBill) {
      fetchFolds(manageBill.vatType, manageBill.vatNo);
    }
    if (tab === 'stock' && manageBill) {
      const q = manageBill.stockFabricStruct || manageBill.fabricStruct || "";
      setStockSearch(q);
      if (q) doStockSearch(q);
    }
    if (tab === 'order' && manageBill) {
      const q = manageBill.purchaseOrder || manageBill.customerName || "";
      setOrderSearch(q);
      if (q) doOrderSearch(q);
    }
  };

  const handleStockSearchChange = (v: string) => {
    setStockSearch(v);
    if (stockTimer.current) clearTimeout(stockTimer.current);
    stockTimer.current = setTimeout(() => doStockSearch(v), 400);
  };

  const handleSelectStock = async (s: StockResult) => {
    if (!manageBill || stockSaving) return;
    setStockSaving(true);
    await fetch("/api/warehouse/bill", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vatType: manageBill.vatType, vatNo: manageBill.vatNo,
        stockFabricStruct: s.fabricStruct,
        stockFabricW: s.fabricW,
        stockFabricPattern: s.fabricPattern,
        stockCustomer: s.customer,
      }),
    });
    setStockSaving(false);
    setManageBill(b => b ? { ...b, stockFabricStruct: s.fabricStruct, stockFabricW: s.fabricW, stockFabricPattern: s.fabricPattern, stockCustomer: s.customer, hasStockMatch: true } : b);
    fetchBills();
  };

  const handleClearStock = async () => {
    if (!manageBill || stockSaving) return;
    setStockSaving(true);
    await fetch("/api/warehouse/bill", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vatType: manageBill.vatType, vatNo: manageBill.vatNo,
        stockFabricStruct: null, stockFabricW: null,
        stockFabricPattern: null, stockCustomer: null,
      }),
    });
    setStockSaving(false);
    setManageBill(b => b ? { ...b, stockFabricStruct: null, stockFabricW: null, stockFabricPattern: null, stockCustomer: null } : b);
    fetchBills();
  };

  const handleOrderSearchChange = (v: string) => {
    setOrderSearch(v);
    if (orderTimer.current) clearTimeout(orderTimer.current);
    orderTimer.current = setTimeout(() => doOrderSearch(v), 400);
  };

  const handleSelectOrder = async (o: OrderResult) => {
    if (!manageBill || orderSaving) return;
    setOrderSaving(true);
    await fetch("/api/warehouse/bill", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vatType: manageBill.vatType, vatNo: manageBill.vatNo,
        orderId: o.id, purchaseOrder: o.purchaseOrder,
      }),
    });
    setOrderSaving(false);
    setManageBill(b => b ? { ...b, orderId: o.id, purchaseOrder: o.purchaseOrder } : b);
    fetchBills();
  };

  const handleUnlinkOrder = async () => {
    if (!manageBill || orderSaving) return;
    setOrderSaving(true);
    await fetch("/api/warehouse/bill", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vatType: manageBill.vatType, vatNo: manageBill.vatNo,
        orderId: null, purchaseOrder: null,
      }),
    });
    setOrderSaving(false);
    setManageBill(b => b ? { ...b, orderId: null, purchaseOrder: null } : b);
    fetchBills();
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

      <div className="bg-white border border-gray-200 p-4 mb-4 shadow-sm flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-40">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSearchDropdown(true); }}
            onFocus={() => { if (search) setSearchDropdown(true); }}
            onBlur={() => setTimeout(() => setSearchDropdown(false), 200)}
            placeholder="ค้นหาลูกค้า, เลขที่บิล..."
            onKeyDown={(e) => e.key === "Enter" && (setSearchDropdown(false), setPage(1), setApplied(search))}
            className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchDropdown && searchSuggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
              {searchSuggestions.map((v) => (
                <button
                  key={v}
                  type="button"
                  onMouseDown={() => {
                    setSearch(v);
                    setSearchDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0"
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => { setPage(1); setApplied(search); }}
          className="px-6 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium">
          ค้นหา
        </button>
        <button type="button" onClick={() => { setSearch(""); setApplied(""); setNoStockOnly(false); setPage(1); setSearchDropdown(false); }}
          className="px-4 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 text-gray-600">
          เคลียร์
        </button>
        <button
          type="button"
          onClick={() => { setNoStockOnly(v => !v); setPage(1); }}
          className={`px-4 py-1.5 text-sm font-medium border transition-colors ${noStockOnly ? "bg-red-600 text-white border-red-600 hover:bg-red-700" : "border-red-300 text-red-600 hover:bg-red-50"}`}
        >
          {noStockOnly ? "● ไม่มีสต็อก" : "○ ไม่มีสต็อก"}
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
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-20">สต็อก</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-24">พิมพ์</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-20" aria-label="actions"></th>
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
              ) : bills.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
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
                    {b.hasStockMatch ? (
                      <span className="inline-block px-2 py-0.5 text-xs bg-green-100 text-green-700 font-medium">ตัดแล้ว</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs bg-red-100 text-red-700 font-medium">ไม่มีสต็อก</span>
                    )}
                  </td>
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
          <div className="relative bg-white shadow-xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-900 text-sm">
                  จัดการบิล {manageBill.vatType}-{manageBill.vatNo}
                </h2>
                {manageBill.hasStockMatch ? (
                  <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 font-medium">ตัดสต็อกแล้ว</span>
                ) : (
                  <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 font-medium">ไม่มีสต็อก</span>
                )}
              </div>
              <button type="button" onClick={closeManage} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 flex-shrink-0">
              {([ ['bill','ข้อมูลบิล'], ['stock','ตัดสต็อก'], ['order','ออร์เดอร์'], ['folds',`พับ (${manageBill.foldCount})`] ] as [ActiveTab, string][]).map(([id, label]) => (
                <button key={id} type="button" onClick={() => switchTab(id)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab: ข้อมูลบิล */}
            {activeTab === 'bill' && (
              !confirmDelete ? (
                <>
                  <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
                    {([
                      { label: "ลูกค้า / ผู้สั่ง", key: "customerName" },
                      { label: "ผู้รับ", key: "receiveName" },
                      { label: "โครงสร้างผ้า", key: "fabricStruct" },
                      { label: "ลายผ้า", key: "fabricPattern" },
                      { label: "หน้ากว้าง", key: "fabricW" },
                      { label: "โครงสร้างผ้า (ทางเลือก)", key: "altFabricStruct" },
                      { label: "แทนผู้สั่งซื้อ (ทางเลือก)", key: "altPurchaseOrder" },
                    ] as { label: string; key: keyof EditForm }[]).map(({ label, key }) => (
                      <div key={key}>
                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                        <input
                          value={editForm[key]}
                          onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                          title={label}
                          className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}

                    {/* วันที่บิล — บันทึกทันทีแยกจากฟอร์มด้านบน (ต่างจากฟิลด์อื่นที่รวมกดบันทึกทีเดียว) */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">วันที่บิล</label>
                      {editingDate?.vatType === manageBill.vatType && editingDate?.vatNo === manageBill.vatNo ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={editingDate.value}
                            onChange={e => setEditingDate(v => v ? { ...v, value: e.target.value } : v)}
                            title="วันที่บิล"
                            className="border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoFocus
                          />
                          <button type="button" onClick={() => setEditingDate(null)} disabled={dateSaving}
                            className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">ยกเลิก</button>
                          <button type="button" onClick={handleSaveDate} disabled={dateSaving}
                            className="px-2 py-0.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                            {dateSaving ? "กำลังบันทึก..." : "บันทึก"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800">{fmtDate(manageBill.createDate)}</span>
                          <button type="button" onClick={() => openEditDate(manageBill)}
                            className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">แก้ไขวันที่</button>
                          <button type="button" onClick={() => toggleHistory(manageBill)}
                            className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
                            {historyOpenKey === dateKey(manageBill.vatType, manageBill.vatNo) ? "ซ่อนประวัติ" : "ดูประวัติการแก้ไข"}
                          </button>
                        </div>
                      )}
                      {historyOpenKey === dateKey(manageBill.vatType, manageBill.vatNo) && (
                        <div className="mt-2 border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto text-xs">
                          {historyLoading ? (
                            <div className="text-center py-3 text-gray-400">กำลังโหลด...</div>
                          ) : (historyCache[dateKey(manageBill.vatType, manageBill.vatNo)]?.length ?? 0) === 0 ? (
                            <div className="text-center py-3 text-gray-400">ยังไม่มีประวัติแก้ไขวันที่</div>
                          ) : (
                            historyCache[dateKey(manageBill.vatType, manageBill.vatNo)].map(h => (
                              <div key={h.id} className="px-3 py-2">
                                <div className="text-gray-400">{fmtDateTime(h.changedAt)} · {h.changedBy}</div>
                                <div className="text-gray-800 mt-0.5">
                                  {h.oldValue ? fmtDate(h.oldValue) : "-"}
                                  <span className="mx-1 text-gray-400">→</span>
                                  <span className="font-medium text-blue-700">{h.newValue ? fmtDate(h.newValue) : "-"}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-gray-400">การแก้ไขจะมีผลกับทุกรายการในบิลนี้ ({manageBill.foldCount} รายการ)</p>
                  </div>
                  <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
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
                  <div className="px-5 py-6 text-center flex-1">
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
                  <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-center flex-shrink-0">
                    <button type="button" onClick={() => setConfirmDelete(false)} className="px-5 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 text-gray-600">ยกเลิก</button>
                    <button type="button" onClick={handleDelete} disabled={saving}
                      className="px-5 py-1.5 text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-medium">
                      {saving ? "กำลังลบ..." : "ยืนยันลบ"}
                    </button>
                  </div>
                </>
              )
            )}

            {/* Tab: ตัดสต็อก */}
            {activeTab === 'stock' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
                  {/* Current override info */}
                  {(manageBill.stockFabricStruct || manageBill.stockFabricPattern || manageBill.stockFabricW) && (
                    <div className="bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs">
                      <p className="text-blue-600 font-medium mb-0.5">ตัดจากสต็อก (กำหนดไว้)</p>
                      <p className="text-blue-800">
                        {manageBill.stockFabricStruct || manageBill.fabricStruct}
                        {(manageBill.stockFabricW || manageBill.fabricW) ? ` ${manageBill.stockFabricW || manageBill.fabricW}''` : ""}
                        {(manageBill.stockFabricPattern || manageBill.fabricPattern) ? ` ลาย ${manageBill.stockFabricPattern || manageBill.fabricPattern}` : ""}
                        {manageBill.stockCustomer ? ` — ${manageBill.stockCustomer}` : ""}
                      </p>
                    </div>
                  )}

                  {/* Search */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ค้นหาสต็อก</label>
                    <input
                      value={stockSearch}
                      onChange={e => handleStockSearchChange(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doStockSearch(stockSearch)}
                      placeholder="โครงสร้าง, ลาย, รหัสผ้า..."
                      className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Results */}
                  {stockSearching ? (
                    <div className="text-center py-4 text-gray-400 text-xs">กำลังค้นหา...</div>
                  ) : stockResults.length > 0 ? (
                    <div className="border border-gray-200 divide-y divide-gray-100 max-h-64 overflow-y-auto">
                      {stockResults.map((s, i) => {
                        const remaining = s.produced_yard - s.used_yard;
                        const isCurrentMatch =
                          (manageBill.stockFabricStruct || manageBill.fabricStruct) === s.fabricStruct &&
                          (manageBill.stockFabricW || manageBill.fabricW) === s.fabricW &&
                          (manageBill.stockFabricPattern || manageBill.fabricPattern) === s.fabricPattern &&
                          (manageBill.stockCustomer || manageBill.customerName || 'AST') === s.customer;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSelectStock(s)}
                            disabled={stockSaving}
                            className={`w-full text-left px-3 py-2.5 text-xs transition-colors disabled:opacity-50 ${isCurrentMatch ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-medium text-gray-900">
                                  {s.fabricStruct}{s.fabricW ? ` ${s.fabricW}''` : ""}
                                </span>
                                {s.fabricPattern && <span className="text-gray-600"> ลาย {s.fabricPattern}</span>}
                                {s.fabricCode && <span className="ml-1 text-gray-400">({s.fabricCode})</span>}
                                <div className="text-gray-400 mt-0.5">{s.customer}</div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className={`font-medium ${remaining < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                  {remaining.toLocaleString(undefined, { maximumFractionDigits: 1 })} หลา
                                </div>
                                <div className="text-gray-400">คงเหลือ</div>
                              </div>
                            </div>
                            {isCurrentMatch && (
                              <span className="mt-1 inline-block text-blue-600 font-medium">✓ ใช้อยู่</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : stockSearch ? (
                    <div className="text-center py-4 text-gray-400 text-xs">ไม่พบสต็อก</div>
                  ) : null}
                </div>

                {/* Footer */}
                {(manageBill.stockFabricStruct || manageBill.stockFabricPattern || manageBill.stockFabricW) && (
                  <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleClearStock}
                      disabled={stockSaving}
                      className="w-full py-1.5 text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors"
                    >
                      {stockSaving ? "กำลังบันทึก..." : "ล้างการกำหนดสต็อก (ใช้การ match อัตโนมัติ)"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab: ออร์เดอร์ */}
            {activeTab === 'order' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
                  {/* Current order */}
                  {manageBill.orderId && (
                    <div className="bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs">
                      <p className="text-blue-600 font-medium mb-0.5">ออร์เดอร์ปัจจุบัน</p>
                      <p className="text-blue-800 font-medium">
                        {manageBill.purchaseOrder || `#${manageBill.orderId}`}
                      </p>
                    </div>
                  )}

                  {/* Search */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ค้นหาออร์เดอร์</label>
                    <input
                      value={orderSearch}
                      onChange={e => handleOrderSearchChange(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doOrderSearch(orderSearch)}
                      placeholder="เลขที่ SO, ชื่อลูกค้า..."
                      className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Results */}
                  {orderSearching ? (
                    <div className="text-center py-4 text-gray-400 text-xs">กำลังค้นหา...</div>
                  ) : orderResults.length > 0 ? (
                    <div className="border border-gray-200 divide-y divide-gray-100 max-h-64 overflow-y-auto">
                      {orderResults.map((o, i) => {
                        const isLinked = manageBill.orderId === o.id;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSelectOrder(o)}
                            disabled={orderSaving}
                            className={`w-full text-left px-3 py-2.5 text-xs transition-colors disabled:opacity-50 ${isLinked ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-medium text-gray-900">{o.purchaseOrder}</div>
                                <div className="text-gray-600">{o.customerName}</div>
                                <div className="text-gray-400 mt-0.5">
                                  {o.fabricStructure}{o.fabricW ? ` ${o.fabricW}''` : ""}
                                  {o.fabricPattern ? ` ลาย ${o.fabricPattern}` : ""}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className={`font-medium ${o.remainingYard < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                  {o.remainingYard.toLocaleString(undefined, { maximumFractionDigits: 1 })} หลา
                                </div>
                                <div className="text-gray-400">คงเหลือ</div>
                              </div>
                            </div>
                            {isLinked && (
                              <span className="mt-1 inline-block text-blue-600 font-medium">✓ เชื่อมอยู่</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : orderSearch ? (
                    <div className="text-center py-4 text-gray-400 text-xs">ไม่พบออร์เดอร์</div>
                  ) : null}
                </div>

                {/* Footer */}
                {manageBill.orderId && (
                  <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleUnlinkOrder}
                      disabled={orderSaving}
                      className="w-full py-1.5 text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors"
                    >
                      {orderSaving ? "กำลังบันทึก..." : "ยกเลิกการเชื่อมออร์เดอร์"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab: แก้ไขพับ */}
            {activeTab === 'folds' && (
              <div className="flex-1 overflow-y-auto">
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
