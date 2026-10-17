"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { InfiniteScrollStatus } from "@/components/InfiniteScrollStatus";
import { assignOrdersWholeRoll } from "@/lib/billOrders";

// Per-click idempotency token for "เพิ่มพับ" — same pattern as newSessionId()
// in bill/create/page.tsx.
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// One order linked to a bill. A bill normally has at most one, but can span
// several when it was used to cover overflow past the first order's yard.
interface LinkedOrderRef {
  orderId: number;
  purchaseOrder: string | null;
}

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
  altPurchaseOrderIsDepositLink: boolean;
  hasStockMatch: boolean;
  stockFabricStruct: string | null;
  stockFabricW: string | null;
  stockFabricPattern: string | null;
  stockCustomer: string | null;
  orders: LinkedOrderRef[];
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

interface BillHistoryEntry {
  id: number;
  fieldName: string;
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

// An order queued in the "จัดการ" modal order tab — saved as an ordered list
// (order 1 fills first, overflow spills to order 2, ...) like เปิดบิลผ้า.
// remainingYard excludes this bill's own rolls (see /api/warehouse/bill/orders).
interface DraftOrder {
  id: number;
  purchaseOrder: string;
  remainingYard: number;
}

type ActiveTab ='bill' | 'stock' | 'order' | 'folds';

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const FILTER_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

export default function BillListPage() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [noStockOnly, setNoStockOnly] = useState(false);
  // "" = ทั้งหมด; month applies only when a year is chosen
  const [vatTypeFilter, setVatTypeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
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
  // เลือกหลายพับแล้วลบพร้อมกัน — ห้ามเลือกครบทุกพับ (นั่นคือ "ลบบิล" ไม่ใช่แก้พับ)
  const [selectedFoldIds, setSelectedFoldIds] = useState<Set<number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // เพิ่มพับย้อนหลัง — newFoldYard คือช่องกรอกหลาท้ายตาราง, addFoldRequestId คือ
  // idempotency token ต่อการกด "เพิ่มพับ" หนึ่งครั้ง (เหมือน pendingRequestId ใน
  // bill/create/page.tsx — reuse ตัวเดิมถ้า fetch ล้มเหลวแล้วกดซ้ำโดยไม่แก้เลข)
  const [newFoldYard, setNewFoldYard] = useState("");
  const [addFoldSaving, setAddFoldSaving] = useState(false);
  const [addFoldRequestId, setAddFoldRequestId] = useState<string | null>(null);
  // กด "บันทึก" แล้วต้องยืนยันอีกชั้นก่อนยิง POST — เดิม Enter/คลิกครั้งเดียวเพิ่มทันที
  const [confirmAddFold, setConfirmAddFold] = useState(false);

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
  const [orderDraft, setOrderDraft] = useState<DraftOrder[]>([]);
  const [orderDraftInitial, setOrderDraftInitial] = useState<number[]>([]);
  const [orderDraftLoading, setOrderDraftLoading] = useState(false);
  const [billRollYards, setBillRollYards] = useState<number[]>([]);
  const [confirmSaveOrders, setConfirmSaveOrders] = useState(false);

  // แก้ไขวันที่บิล (createDate) / เลขที่บิล (vatNo) — ในแท็บ "ข้อมูลบิล" ของ modal จัดการ
  const [editingDate, setEditingDate] = useState<{ vatType: string; vatNo: number; value: string } | null>(null);
  const [dateSaving, setDateSaving] = useState(false);
  const [editingVatNo, setEditingVatNo] = useState<{ vatType: string; vatNo: number; value: string } | null>(null);
  const [vatNoSaving, setVatNoSaving] = useState(false);
  const [vatNoError, setVatNoError] = useState<string | null>(null);
  const [historyOpenKey, setHistoryOpenKey] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCache, setHistoryCache] = useState<Record<string, BillHistoryEntry[]>>({});

  const fetchBillsPage = useCallback((page: number) => {
    const p = new URLSearchParams({ page: String(page) });
    if (applied) p.set("search", applied);
    if (noStockOnly) p.set("noStockOnly", "1");
    if (vatTypeFilter) p.set("vatType", vatTypeFilter);
    if (yearFilter) {
      p.set("year", yearFilter);
      if (monthFilter) p.set("month", monthFilter);
    }
    return fetch(`/api/warehouse/bill?${p}`)
      .then((r) => r.json())
      .then((d) => ({ items: d.bills ?? [], total: d.total ?? 0 }));
  }, [applied, noStockOnly, vatTypeFilter, yearFilter, monthFilter]);

  const { items: bills, total, initialLoading, loadingMore, hasMore, sentinelRef, reload } = useInfiniteScroll<Bill>(fetchBillsPage);

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

  // ประวัติแก้ไขของบิล (audit_logs) — shared by the "ข้อมูลบิล" and "ออร์เดอร์" tabs.
  const HISTORY_LABELS: Record<string, string> = { createDate: "วันที่", vatNo: "เลขที่บิล", orders: "ออร์เดอร์" };
  const fmtHistoryValue = (fieldName: string, v: string | null) => {
    if (!v) return "-";
    if (fieldName === "createDate") return fmtDate(v);
    if (fieldName === "orders") {
      try {
        const list = JSON.parse(v) as { orderId: number; purchaseOrder: string | null; rolls: number }[];
        return list.length === 0
          ? "ไม่ผูกออร์เดอร์"
          : list.map(o => `${o.purchaseOrder || `#${o.orderId}`} (${o.rolls} ม้วน)`).join(", ");
      } catch { return v; }
    }
    return v;
  };
  const renderHistory = (b: Bill) => {
    const entries = historyCache[dateKey(b.vatType, b.vatNo)] ?? [];
    return (
      <div className="mt-2 border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto text-xs">
        {historyLoading ? (
          <div className="text-center py-3 text-gray-400">กำลังโหลด...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-3 text-gray-400">ยังไม่มีประวัติการแก้ไข</div>
        ) : (
          entries.map(h => (
            <div key={h.id} className="px-3 py-2">
              <div className="text-gray-400">{fmtDateTime(h.changedAt)} · {h.changedBy}</div>
              <div className="text-gray-800 mt-0.5">
                <span className="text-gray-500">{HISTORY_LABELS[h.fieldName] ?? h.fieldName}:</span>{" "}
                {fmtHistoryValue(h.fieldName, h.oldValue)}
                <span className="mx-1 text-gray-400">→</span>
                <span className="font-medium text-blue-700">{fmtHistoryValue(h.fieldName, h.newValue)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const openPrint = (vatType: string, vatNo: number) =>
    window.open(`/warehouse/bill/print/${vatNo}?vatType=${vatType}`, "_blank");

  const openEditDate = (b: Bill) => {
    setHistoryOpenKey(null);
    setEditingVatNo(null);
    setEditingDate({ vatType: b.vatType, vatNo: b.vatNo, value: new Date(b.createDate).toISOString().slice(0, 10) });
  };

  const openEditVatNo = (b: Bill) => {
    setHistoryOpenKey(null);
    setEditingDate(null);
    setVatNoError(null);
    setEditingVatNo({ vatType: b.vatType, vatNo: b.vatNo, value: String(b.vatNo) });
  };

  const handleSaveVatNo = async () => {
    if (!editingVatNo || vatNoSaving) return;
    const newNo = Number(editingVatNo.value);
    // เช็คขั้นต้นฝั่ง frontend — รูปแบบถูกต้องและไม่ใช่เลขเดิม ก่อนยิงไปให้ backend เช็คซ้ำกับข้อมูลจริง (source of truth)
    if (!Number.isInteger(newNo) || newNo <= 0) {
      setVatNoError("กรุณากรอกเลขที่บิลเป็นจำนวนเต็มบวก");
      return;
    }
    if (newNo === editingVatNo.vatNo) {
      setVatNoError("เลขที่บิลใหม่ต้องไม่ซ้ำกับเลขเดิม");
      return;
    }
    setVatNoSaving(true);
    setVatNoError(null);
    try {
      const res = await fetch("/api/warehouse/bill/vatno", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vatType: editingVatNo.vatType, oldVatNo: editingVatNo.vatNo, newVatNo: newNo }),
      });
      const d = await res.json();
      if (!res.ok) {
        setVatNoError(d.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setHistoryOpenKey(null); // key เปลี่ยนตามเลขที่บิลใหม่ — ปิดประวัติเดิมไว้ก่อน เปิดใหม่จะดึงของเลขที่ใหม่
      setManageBill(mb => mb && mb.vatType === editingVatNo.vatType && mb.vatNo === editingVatNo.vatNo ? { ...mb, vatNo: d.vatNo } : mb);
      setEditingVatNo(null);
      reload();
    } finally {
      setVatNoSaving(false);
    }
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
        reload();
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
    setSelectedFoldIds(new Set());
    setConfirmBulkDelete(false);
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

  // `bill` = the bill being re-linked — its own rolls are left out of each
  // order's คงเหลือ, so results match the draft list above them.
  const doOrderSearch = useCallback((q: string, bill: { vatType: string; vatNo: number } | null) => {
    if (!q.trim()) { setOrderResults([]); return; }
    setOrderSearching(true);
    const exclude = bill ? `&excludeVatType=${encodeURIComponent(bill.vatType)}&excludeVatNo=${bill.vatNo}` : "";
    fetch(`/api/warehouse/orders/search?q=${encodeURIComponent(q.trim())}${exclude}`)
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
    setSelectedFoldIds(new Set()); setConfirmBulkDelete(false);
    setNewFoldYard(""); setAddFoldRequestId(null); setConfirmAddFold(false);
    setStockSearch(""); setStockResults([]);
    setOrderSearch(""); setOrderResults([]);
    setOrderDraft([]); setOrderDraftInitial([]); setBillRollYards([]); setConfirmSaveOrders(false);
    setEditingDate(null);
    setEditingVatNo(null); setVatNoError(null);
    setHistoryOpenKey(null);
  };

  const closeManage = () => {
    setManageBill(null);
    setConfirmDelete(false);
    setEditingFold(null);
    setConfirmDeleteFold(null);
    setSelectedFoldIds(new Set()); setConfirmBulkDelete(false);
    setNewFoldYard(""); setAddFoldRequestId(null); setConfirmAddFold(false);
    setStockResults([]);
    setOrderResults([]);
    setOrderDraft([]); setOrderDraftInitial([]); setBillRollYards([]); setConfirmSaveOrders(false);
    setEditingDate(null);
    setEditingVatNo(null); setVatNoError(null);
    setHistoryOpenKey(null);
  };

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setConfirmDelete(false);
    setEditingFold(null);
    setConfirmDeleteFold(null);
    setSelectedFoldIds(new Set()); setConfirmBulkDelete(false);
    setNewFoldYard(""); setAddFoldRequestId(null); setConfirmAddFold(false);
    setEditingDate(null);
    setEditingVatNo(null); setVatNoError(null);
    setHistoryOpenKey(null);
    if (tab === 'folds' && manageBill) {
      fetchFolds(manageBill.vatType, manageBill.vatNo);
    }
    if (tab === 'stock' && manageBill) {
      const q = manageBill.stockFabricStruct || manageBill.fabricStruct || "";
      setStockSearch(q);
      if (q) doStockSearch(q);
    }
    setConfirmSaveOrders(false);
    if (tab === 'order' && manageBill) {
      loadOrderDraft(manageBill.vatType, manageBill.vatNo);
      const q =manageBill.orders[0]?.purchaseOrder || manageBill.customerName || "";
      setOrderSearch(q);
      if (q) doOrderSearch(q, manageBill);
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
    reload();
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
    reload();
  };

  const handleOrderSearchChange = (v: string) => {
    setOrderSearch(v);
    if (orderTimer.current) clearTimeout(orderTimer.current);
    orderTimer.current = setTimeout(() => doOrderSearch(v, manageBill), 400);
  };

  // Loads the orders currently linked to this bill (in fill order) as the
  // editable draft list, plus each roll's yard for the split preview.
  const loadOrderDraft = async (vatType: string, vatNo: number) => {
    setOrderDraftLoading(true);
    try {
      const res = await fetch(`/api/warehouse/bill/orders?vatType=${encodeURIComponent(vatType)}&vatNo=${vatNo}`);
      const d = await res.json();
      const list: DraftOrder[] = (d.orders ?? []).map((o: DraftOrder) => ({ id: o.id, purchaseOrder: o.purchaseOrder, remainingYard: o.remainingYard }));
      setOrderDraft(list);
      setOrderDraftInitial(list.map(o => o.id));
      setBillRollYards(d.rollYards ?? []);
    } finally {
      setOrderDraftLoading(false);
    }
  };

  // Queues an order at the end of the draft list — its remainingYard is
  // re-fetched with this bill excluded, so it matches what the save will use.
  const handleQueueOrder = async (o: OrderResult) => {
    if (!manageBill || orderDraft.some(d => d.id === o.id)) return;
    setConfirmSaveOrders(false);
    const res = await fetch(`/api/warehouse/bill/orders?vatType=${encodeURIComponent(manageBill.vatType)}&vatNo=${manageBill.vatNo}&ids=${o.id}`);
    const d = await res.json().catch(() => ({}));
    const cap = (d.orders ?? [])[0];
    setOrderDraft(prev => prev.some(x => x.id === o.id) ? prev : [
      ...prev,
      { id: o.id, purchaseOrder: o.purchaseOrder, remainingYard: cap ? cap.remainingYard : o.remainingYard },
    ]);
  };

  const handleRemoveDraftOrder = (id: number) => {
    setConfirmSaveOrders(false);
    setOrderDraft(prev => prev.filter(x => x.id !== id));
  };

  // Re-links every roll in the bill to the draft list (whole rolls only —
  // fold count and printed layout never change). Empty list unlinks all.
  const handleSaveOrders = async () => {
    if (!manageBill || orderSaving) return;
    setOrderSaving(true);
    try {
      const res = await fetch("/api/warehouse/bill/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vatType: manageBill.vatType, vatNo: manageBill.vatNo, orderIds: orderDraft.map(o => o.id) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error ?? "บันทึกออร์เดอร์ไม่สำเร็จ"); return; }
      const key = dateKey(manageBill.vatType, manageBill.vatNo);
      setHistoryCache(c => { const n = { ...c }; delete n[key]; return n; }); // invalidate cached history
      setManageBill(b => b ? { ...b, orders: d.orders ?? [] } : b);
      setConfirmSaveOrders(false);
      await loadOrderDraft(manageBill.vatType, manageBill.vatNo);
      reload();
    } finally {
      setOrderSaving(false);
    }
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
    reload();
  };

  const handleDeleteFold = async (id: number) => {
    if (!manageBill) return;
    // เก็บยอดของแถวที่จะลบไว้ก่อน — ใช้ปรับ foldCount/totalYard ใน header ของ
    // modal เอง เพราะ manageBill เป็น snapshot แยกจาก bills list (reload() แค่
    // รีเฟรชตาราง list ด้านหลัง ไม่ย้อนอัปเดต manageBill ที่ modal เปิดค้างอยู่)
    const deleted = folds.find(f => f.id === id);
    setFoldSaving(true);
    await fetch(`/api/warehouse/bill/folds?id=${id}`, { method: 'DELETE' });
    setFoldSaving(false);
    setConfirmDeleteFold(null);
    fetchFolds(manageBill.vatType, manageBill.vatNo);
    if (deleted) {
      setManageBill(b => b ? { ...b, foldCount: b.foldCount - 1, totalYard: b.totalYard - deleted.sumYard } : b);
    }
    reload();
  };

  const toggleFoldSelected = (id: number) => {
    setConfirmBulkDelete(false);
    setSelectedFoldIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteFolds = async () => {
    if (!manageBill || bulkDeleting || selectedFoldIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/warehouse/bill/folds/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vatType: manageBill.vatType, vatNo: manageBill.vatNo, ids: [...selectedFoldIds] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "ลบพับไม่สำเร็จ");
      // same reason as handleDeleteFold — manageBill is a snapshot, adjust it here
      setManageBill(b => b ? { ...b, foldCount: b.foldCount - data.count, totalYard: b.totalYard - data.deletedYard } : b);
      fetchFolds(manageBill.vatType, manageBill.vatNo);
      reload();
    } catch (err: unknown) {
      alert("เกิดข้อผิดพลาด: " + (err instanceof Error ? err.message : String(err)));
      fetchFolds(manageBill.vatType, manageBill.vatNo);
    } finally {
      setBulkDeleting(false);
      setConfirmBulkDelete(false);
    }
  };

  // เพิ่มพับย้อนหลังเข้าบิลที่มีอยู่แล้ว — ระวัง: บิลนี้อาจเคยพิมพ์/ส่งลูกค้าไปแล้ว
  // (ดูป้ายเตือนใน UI) เพิ่มพับใหม่จะทำให้เอกสารที่พิมพ์ไปแล้วไม่ตรงกับระบบอีกต่อไป
  // ขั้นแรก: ตรวจค่าแล้วเปิดกล่องยืนยัน — ยังไม่บันทึกอะไร
  const requestAddFold = () => {
    if (!manageBill || addFoldSaving) return;
    if (!(parseFloat(newFoldYard) > 0)) {
      alert("กรุณากรอกจำนวนหลาให้ถูกต้อง");
      return;
    }
    setConfirmAddFold(true);
  };

  const handleAddFold = async () => {
    if (!manageBill || addFoldSaving) return;
    const yard = parseFloat(newFoldYard);
    if (!(yard > 0)) return;
    // Reuse the same requestId on a retry of a still-pending attempt (fetch
    // failed/lost response) — same pattern as bill/create/page.tsx's
    // pendingRequestId. Cleared on success or when newFoldYard changes below.
    const requestId = addFoldRequestId ?? newRequestId();
    if (!addFoldRequestId) setAddFoldRequestId(requestId);
    setAddFoldSaving(true);
    try {
      const res = await fetch('/api/warehouse/bill/folds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vatType: manageBill.vatType, vatNo: manageBill.vatNo, sumYard: yard, requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "เพิ่มพับไม่สำเร็จ");
      setNewFoldYard("");
      setAddFoldRequestId(null);
      setConfirmAddFold(false);
      setManageBill(b => b ? { ...b, foldCount: b.foldCount + 1, totalYard: b.totalYard + yard } : b);
      fetchFolds(manageBill.vatType, manageBill.vatNo);
      reload();
    } catch (err: unknown) {
      // ไม่เคลียร์ addFoldRequestId — ให้กดซ้ำโดยไม่แก้เลขหลาแล้ว retry ด้วย
      // requestId เดิมได้ (กันแถวซ้ำ เหมือน handleSave ใน bill/create/page.tsx)
      alert("เกิดข้อผิดพลาด: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAddFoldSaving(false);
    }
  };

  const handleSave = async () => {
    if (!manageBill) return;
    setSaving(true);
    // A stock-deposit withdrawal's altPurchaseOrder is its link to the deposit bill:
    // leave it out so the PATCH keeps it as is.
    const { altPurchaseOrder, ...rest } = editForm;
    const fields = manageBill.altPurchaseOrderIsDepositLink ? rest : { ...rest, altPurchaseOrder };
    await fetch("/api/warehouse/bill", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vatType: manageBill.vatType, vatNo: manageBill.vatNo, ...fields }),
    });
    setSaving(false);
    closeManage();
    reload();
  };

  const handleDelete = async () => {
    if (!manageBill) return;
    setSaving(true);
    await fetch(`/api/warehouse/bill?vatType=${manageBill.vatType}&vatNo=${manageBill.vatNo}`, { method: "DELETE" });
    setSaving(false);
    closeManage();
    reload();
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
            onKeyDown={(e) => e.key === "Enter" && (setSearchDropdown(false), setApplied(search))}
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
        <select
          value={vatTypeFilter}
          onChange={(e) => setVatTypeFilter(e.target.value)}
          title="ประเภทบิล"
          className="border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุกประเภทบิล</option>
          <option value="A">บิล A</option>
          <option value="B">บิล B</option>
          <option value="C">บิล C</option>
        </select>
        <select
          value={yearFilter}
          onChange={(e) => { setYearFilter(e.target.value); if (!e.target.value) setMonthFilter(""); }}
          title="ปี"
          className="border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทุกปี</option>
          {FILTER_YEARS.map((y) => (
            <option key={y} value={y}>{y + 543}</option>
          ))}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          disabled={!yearFilter}
          title={yearFilter ? "เดือน" : "เลือกปีก่อน"}
          className="border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">ทุกเดือน</option>
          {THAI_MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <button type="button" onClick={() => { setApplied(search); }}
          className="px-6 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium">
          ค้นหา
        </button>
        <button type="button" onClick={() => { setSearch(""); setApplied(""); setNoStockOnly(false); setVatTypeFilter(""); setYearFilter(""); setMonthFilter(""); setSearchDropdown(false); }}
          className="px-4 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 text-gray-600">
          เคลียร์
        </button>
        <button
          type="button"
          onClick={() => { setNoStockOnly(v => !v); }}
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
              {initialLoading ? (
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
                    {b.altPurchaseOrder && !b.altPurchaseOrderIsDepositLink && <span className="ml-1 text-gray-400">({b.altPurchaseOrder})</span>}
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
        <InfiniteScrollStatus
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          total={total}
          loadedCount={bills.length}
          itemLabel="บิล"
        />
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
                        {key === "altPurchaseOrder" && manageBill.altPurchaseOrderIsDepositLink ? (
                          <input
                            value="บิลเบิกผ้าฝาก (ผูกกับบิลฝาก)"
                            readOnly
                            title="ผูกกับบิลฝากในสต็อกผ้าฝากจัดเก็บ แก้ไขไม่ได้"
                            className="w-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm text-gray-500 cursor-not-allowed"
                          />
                        ) : (
                        <input
                          value={editForm[key]}
                          onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                          title={label}
                          className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        )}
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
                      {historyOpenKey === dateKey(manageBill.vatType, manageBill.vatNo) && renderHistory(manageBill)}
                    </div>

                    {/* เลขที่บิล (vatType-vatNo) — บันทึกทันทีแยกจากฟอร์มด้านบน เหมือนวันที่บิล ประวัติแก้ไขดูรวมกับวันที่บิลได้จากปุ่ม "ดูประวัติการแก้ไข" ด้านบน */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">เลขที่บิล</label>
                      {editingVatNo?.vatType === manageBill.vatType && editingVatNo?.vatNo === manageBill.vatNo ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{manageBill.vatType} -</span>
                            <input
                              type="number" min="1" step="1"
                              value={editingVatNo.value}
                              onChange={e => { setEditingVatNo(v => v ? { ...v, value: e.target.value } : v); setVatNoError(null); }}
                              title="เลขที่บิล"
                              className="w-28 border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              autoFocus
                            />
                            <button type="button" onClick={() => { setEditingVatNo(null); setVatNoError(null); }} disabled={vatNoSaving}
                              className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">ยกเลิก</button>
                            <button type="button" onClick={handleSaveVatNo} disabled={vatNoSaving}
                              className="px-2 py-0.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                              {vatNoSaving ? "กำลังบันทึก..." : "บันทึก"}
                            </button>
                          </div>
                          {vatNoError && <p className="text-xs text-red-500 mt-1">{vatNoError}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-800 font-mono">{manageBill.vatType}-{manageBill.vatNo}</span>
                          <button type="button" onClick={() => openEditVatNo(manageBill)}
                            className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">แก้ไขเลขที่บิล</button>
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
            {activeTab === 'order' && (() => {
              // Preview with the same whole-roll fill the save uses: order 1
              // first, overflow to the next, a roll never split across orders.
              const preview = assignOrdersWholeRoll(
                billRollYards.map(yard => ({ yard })),
                orderDraft.map(o => ({ id: o.id, purchaseOrder: o.purchaseOrder, remaining: o.remainingYard })),
              );
              const previewOf = (id: number) => preview.filter(r => r.orderId === id);
              const billYard = billRollYards.reduce((sum, y) => sum + y, 0);
              const remainingTotal = orderDraft.reduce((sum, o) => sum + o.remainingYard, 0);
              const overflowYard = orderDraft.length > 0 ? billYard - remainingTotal : 0;
              const dirty = orderDraft.map(o => o.id).join(",") !== orderDraftInitial.join(",");
              const fmtYard = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
              return (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-5 py-4 space-y-3 flex-1 overflow-y-auto">
                  <p className="text-xs text-gray-500">
                    เลือกได้หลายออร์เดอร์ — ระบบเติมออร์เดอร์ 1 ก่อน ส่วนที่เกินไปออร์เดอร์ถัดไปตามลำดับ (ย้ายทั้งม้วน ไม่แบ่งม้วน จำนวนพับ/หน้าพิมพ์ไม่เปลี่ยน)
                  </p>

                  {/* Draft list — saved only on "บันทึกออร์เดอร์" */}
                  {orderDraftLoading ? (
                    <div className="text-center py-3 text-gray-400 text-xs">กำลังโหลด...</div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-green-700 font-medium text-xs">
                        ออร์เดอร์ที่ผูก ({orderDraft.length}) · บิลนี้ {billRollYards.length} ม้วน {fmtYard(billYard)} หลา
                      </p>
                      {orderDraft.length === 0 ? (
                        <div className="px-3 py-2 border border-dashed border-gray-300 text-xs text-gray-400">
                          {orderDraftInitial.length > 0
                            ? "ไม่มีออร์เดอร์ในรายการ — บันทึกตอนนี้ = ยกเลิกการเชื่อมออร์เดอร์ทั้งหมด"
                            : "ยังไม่ได้ผูกออร์เดอร์ — ค้นหาแล้วกด \"+ เพิ่มในรายการ\" ด้านล่าง"}
                        </div>
                      ) : orderDraft.map((o, i) => {
                        const rolls = previewOf(o.id);
                        return (
                          <div key={o.id} className="px-3 py-1.5 bg-green-50 border border-green-200 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
                            <span className="font-mono font-semibold text-green-800">
                              {orderDraft.length > 1 ? `${i + 1}. ` : ""}SO: {o.purchaseOrder || `#${o.id}`}
                            </span>
                            <span className={o.remainingYard > 0 ? "text-green-700" : "text-red-600"}>
                              คงค้าง: {fmtYard(o.remainingYard)} หลา
                            </span>
                            <span className={rolls.length === 0 ? "text-gray-400" : "text-blue-700"}>
                              {rolls.length === 0
                                ? "จะไม่ได้รับม้วน"
                                : `จะได้ ${rolls.length} ม้วน ${fmtYard(rolls.reduce((sum, r) => sum + r.yard, 0))} หลา`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftOrder(o.id)}
                              disabled={orderSaving}
                              className="ml-auto text-green-700 hover:text-red-600 disabled:opacity-50"
                            >
                              ลบ
                            </button>
                          </div>
                        );
                      })}
                      {overflowYard > 0 && (
                        <div className="px-3 py-1.5 bg-amber-50 border border-amber-300 text-xs text-amber-800">
                          ยอดบิล ({fmtYard(billYard)} หลา) เกินออร์เดอร์ที่เลือก ({fmtYard(remainingTotal)} หลา) อยู่ {fmtYard(overflowYard)} หลา
                          <br />
                          ส่วนที่เกินจะไปอยู่ที่ออร์เดอร์สุดท้าย — เลือกออร์เดอร์เพิ่มเติมเพื่อรับส่วนที่เกิน
                        </div>
                      )}
                    </div>
                  )}

                  {/* Search */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ค้นหาออร์เดอร์</label>
                    <input
                      value={orderSearch}
                      onChange={e => handleOrderSearchChange(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doOrderSearch(orderSearch, manageBill)}
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
                        const isQueued = orderDraft.some(d => d.id === o.id);
                        return (
                          <div
                            key={i}
                            className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${isQueued ? 'bg-green-50' : ''}`}
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
                            {isQueued ? (
                              <span className="mt-1 inline-block text-green-700 font-medium">✓ อยู่ในรายการ</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleQueueOrder(o)}
                                disabled={orderSaving || orderDraftLoading}
                                className="mt-1.5 px-2 py-0.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >
                                + เพิ่มในรายการ
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : orderSearch ? (
                    <div className="text-center py-4 text-gray-400 text-xs">ไม่พบออร์เดอร์</div>
                  ) : null}

                  <div>
                    <button type="button" onClick={() => toggleHistory(manageBill)}
                      className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
                      {historyOpenKey === dateKey(manageBill.vatType, manageBill.vatNo) ? "ซ่อนประวัติ" : "ดูประวัติการแก้ไข"}
                    </button>
                    {historyOpenKey === dateKey(manageBill.vatType, manageBill.vatNo) && renderHistory(manageBill)}
                  </div>
                </div>

                {/* Footer — save the draft list (with a confirm step) */}
                {dirty && (
                  <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
                    {confirmSaveOrders ? (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-700">
                          {orderDraft.length === 0
                            ? "ยืนยันยกเลิกการเชื่อมออร์เดอร์ทั้งหมดของบิลนี้?"
                            : `ยืนยันผูกบิลนี้กับ ${orderDraft.length} ออร์เดอร์ตามลำดับที่แสดง?`}
                        </p>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleSaveOrders} disabled={orderSaving}
                            className="flex-1 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                            {orderSaving ? "กำลังบันทึก..." : "ยืนยัน"}
                          </button>
                          <button type="button" onClick={() => setConfirmSaveOrders(false)} disabled={orderSaving}
                            className="flex-1 py-1.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setConfirmSaveOrders(true)}
                          className="flex-1 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700">
                          บันทึกออร์เดอร์
                        </button>
                        <button type="button" onClick={() => loadOrderDraft(manageBill.vatType, manageBill.vatNo)}
                          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
                          คืนค่าเดิม
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })()}

            {/* Tab: แก้ไขพับ */}
            {activeTab === 'folds' && (
              <div className="flex-1 overflow-y-auto">
                {/* เพิ่มพับย้อนหลังกระทบเอกสารที่อาจพิมพ์ส่งลูกค้าไปแล้ว — ไม่มีการล็อกบิล
                    ที่ "ปิด" แล้วในระบบนี้ (ไม่มี field สถานะ printed/closed) ป้ายเตือนนี้
                    จึงเป็นแนวป้องกันเดียวที่มี ณ ตอนนี้ */}
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center justify-between gap-2 flex-wrap">
                  <span>⚠️ เพิ่มพับย้อนหลัง — บิลที่พิมพ์ส่งลูกค้าไปแล้วจะไม่ตรงกับระบบ ต้องพิมพ์ใหม่</span>
                  <button type="button" onClick={() => openPrint(manageBill.vatType, manageBill.vatNo)}
                    className="flex-shrink-0 px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300">
                    ไปหน้าพิมพ์
                  </button>
                </div>

                {foldsLoading ? (
                  <div className="flex justify-center py-8 text-gray-400 text-xs">กำลังโหลด...</div>
                ) : folds.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-xs">ไม่พบข้อมูล</div>
                ) : (
                  <>
                  {selectedFoldIds.size > 0 && (() => {
                    const selYard = folds.filter(f => selectedFoldIds.has(f.id)).reduce((s, f) => s + f.sumYard, 0);
                    const all = selectedFoldIds.size >= folds.length;
                    return (
                      <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-xs flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-red-800">
                          เลือก {selectedFoldIds.size} พับ (รวม {selYard.toLocaleString(undefined, { maximumFractionDigits: 2 })} หลา)
                          {all && <span className="block text-red-600">ไม่สามารถลบทุกพับได้ — หากต้องการลบทั้งบิลให้ใช้ปุ่ม &quot;ลบบิล&quot; ในแท็บข้อมูลบิล</span>}
                        </span>
                        {confirmBulkDelete ? (
                          <div className="flex gap-1">
                            <button type="button" onClick={() => setConfirmBulkDelete(false)} disabled={bulkDeleting}
                              className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50">ยกเลิก</button>
                            <button type="button" onClick={handleBulkDeleteFolds} disabled={bulkDeleting}
                              className="px-2 py-0.5 text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                              {bulkDeleting ? "กำลังลบ..." : `ยืนยันลบ ${selectedFoldIds.size} พับ`}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button type="button" onClick={() => setSelectedFoldIds(new Set())}
                              className="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 bg-white hover:bg-gray-50">ล้างที่เลือก</button>
                            <button type="button" onClick={() => setConfirmBulkDelete(true)} disabled={all}
                              className="px-2 py-0.5 text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">ลบที่เลือก</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-center px-2 py-2 w-8">
                          <input
                            type="checkbox"
                            title="เลือกทั้งหมด"
                            checked={folds.length > 0 && selectedFoldIds.size === folds.length}
                            onChange={e => { setConfirmBulkDelete(false); setSelectedFoldIds(e.target.checked ? new Set(folds.map(f => f.id)) : new Set()); }}
                          />
                        </th>
                        <th className="text-center px-3 py-2 font-medium text-gray-600 w-12">ลำดับ</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">หลา</th>
                        <th className="px-3 py-2 w-28" aria-label="actions"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {folds.map((f, idx) => (
                        <tr key={f.id} className={selectedFoldIds.has(f.id) ? "bg-red-50/50" : "hover:bg-gray-50"}>
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox" title={`เลือกพับที่ ${idx + 1}`} checked={selectedFoldIds.has(f.id)} onChange={() => toggleFoldSelected(f.id)} />
                          </td>
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
                        <td />
                        <td className="px-3 py-2 text-xs text-gray-500 text-center">{folds.length} พับ</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-gray-800">
                          {folds.reduce((s, f) => s + f.sumYard, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                  </>
                )}

                {/* ฟอร์มเพิ่มพับ — แสดงเสมอไม่ว่าจะมีพับอยู่แล้วกี่แถว (ยกเว้นระหว่างโหลด) */}
                {!foldsLoading && confirmAddFold && (
                  <div className="px-3 py-2 border-t border-blue-200 bg-blue-50 text-xs flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-blue-900">
                      ยืนยันเพิ่มพับ <span className="font-semibold">{parseFloat(newFoldYard).toLocaleString(undefined, { maximumFractionDigits: 2 })} หลา</span> เข้าบิล{" "}
                      <span className="font-semibold">{manageBill.vatType}-{manageBill.vatNo}</span>?
                      <span className="block text-blue-700">
                        หลังบันทึก: {manageBill.foldCount + 1} พับ รวม {(manageBill.totalYard + parseFloat(newFoldYard)).toLocaleString(undefined, { maximumFractionDigits: 2 })} หลา
                      </span>
                    </span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setConfirmAddFold(false)} disabled={addFoldSaving}
                        className="px-2 py-1 text-xs border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50">ยกเลิก</button>
                      <button type="button" onClick={handleAddFold} disabled={addFoldSaving}
                        className="px-3 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                        {addFoldSaving ? "กำลังบันทึก..." : "ยืนยันบันทึก"}
                      </button>
                    </div>
                  </div>
                )}
                {!foldsLoading && !confirmAddFold && (
                  <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50 flex-wrap">
                    <span className="text-xs text-gray-500 flex-shrink-0">เพิ่มพับใหม่:</span>
                    <input
                      type="number" min="0" step="0.5"
                      value={newFoldYard}
                      onChange={e => {
                        setNewFoldYard(e.target.value);
                        // แก้เลขหลังจากกด "เพิ่มพับ" ไม่สำเร็จ = ตั้งใจส่งค่าใหม่ ไม่ใช่ retry
                        // ของเดิม — ต้อง invalidate token กันไม่ให้ backend เข้าใจผิดว่าซ้ำ
                        if (addFoldRequestId) setAddFoldRequestId(null);
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') requestAddFold(); }}
                      placeholder="จำนวนหลา"
                      title="จำนวนหลา"
                      className="w-28 border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button type="button" onClick={requestAddFold} disabled={addFoldSaving}
                      className="px-3 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                      บันทึก
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
