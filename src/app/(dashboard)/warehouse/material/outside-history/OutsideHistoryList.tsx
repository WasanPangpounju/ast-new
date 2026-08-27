"use client";
import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AutocompleteInput from "@/components/AutocompleteInput";
import { useFieldSuggestions } from "@/hooks/useFieldSuggestions";
import { useLoadMoreSentinel } from "@/hooks/useLoadMoreSentinel";
import { InfiniteScrollStatus } from "@/components/InfiniteScrollStatus";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Outside {
  id:              number;
  withdrawId:      string;
  yarnType:        string;
  supplierName:    string | null;
  lot:             string | null;
  spool:           number;
  weightWithdrawn: number;
  weightWithdrawnP: number;
  weightPSum:      number | null;
  weightKgSum:     number | null;
  weightPPackage:  number | null;
  weightKgPackage: number | null;
  averageP:        number | null;
  averageKg:       number | null;
  note:            string | null;
  withdrawDate:    string;
  pallet:          number | null;
  palletType:      string | null;
  box:             number | null;
  sack:            number | null;
  sackType:        string | null;
  paperBar:        number | null;
  spoolType:       string | null;
  spoolReturnCount: number | null;
  returnPallet:    boolean;
  returnBox:       boolean;
  returnSack:      boolean;
  returnSpool:     boolean;
  returnPaperBar:  boolean;
  recipient:       string | null;
  usageNote:       string | null;
  paymentComment:  string | null;
  createdAt:       string;
  material: {
    lot: string;
    yarnType: string;
    supplierName: string;
  } | null;
}

interface SearchFilters {
  withdrawId: string;
  yarnType: string;
  supplierName: string;
  lot: string;
  recipient: string;
  dateFrom: string;
  dateTo: string;
}

const emptyFilters: SearchFilters = {
  withdrawId: "", yarnType: "", supplierName: "", lot: "", recipient: "", dateFrom: "", dateTo: "",
};

interface OutsideResponse {
  data: Outside[];
  total: number;
  page: number;
  totalPages: number;
}

type Tab = "detail" | "edit";

interface EditState {
  supplierName:    string;
  yarnType:        string;
  lot:             string;
  spool:           string;
  weightPSum:      string;
  weightKgSum:     string;
  weightPPackage:  string;
  weightKgPackage: string;
  weightWithdrawnP: string;
  weightWithdrawn:  string;
  averageP:        string;
  averageKg:       string;
  note:            string;
  withdrawDate:    string;
  pallet:          string;
  palletType:      string;
  box:             string;
  sack:            string;
  sackType:        string;
  paperBar:        string;
  spoolType:       string;
  spoolReturnCount: string;
  spoolReturnCountTouched: boolean;
  returnPallet:    boolean;
  returnBox:       boolean;
  returnSack:      boolean;
  returnSpool:     boolean;
  returnPaperBar:  boolean;
  recipient:       string;
  usageNote:       string;
  paymentComment:  string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear() + 543}`;
  } catch { return "-"; }
}

function numFmt(n: number | null | undefined, dec = 3) {
  if (n == null) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function yn(b: boolean) {
  return b ? "ใช่" : "ไม่ใช่";
}

const PALLET_TYPE_LABEL: Record<string, string> = { wood: "ไม้", steel: "เหล็ก" };
const SACK_TYPE_LABEL: Record<string, string> = { p: "ปอ", plastic: "พลาสติก" };
const SPOOL_TYPE_LABEL: Record<string, string> = {
  spool_plastic: "หลอดกรวย พลาสติก",
  spool_paper: "หลอดกรวย กระดาษ",
  spoolC_plastic: "หลอดทรงกระบอก พลาสติก",
  spoolC_paper: "หลอดทรงกระบอก กระดาษ",
};

const LIMIT = 20;
const LBS_PER_KG = 2.2046;
const fmt3 = (n: number) => (n > 0 ? n.toFixed(3) : "");
const inp = "w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const errB = "border-red-400 focus:ring-red-400";

function calcNet(pSum: number, pPkg: number, kgSum: number, kgPkg: number, spool: number) {
  const netKg = kgSum - kgPkg;
  const netP  = pSum  - pPkg;
  const avgKg = spool > 0 ? netKg / spool : 0;
  const avgP  = spool > 0 ? netP  / spool : 0;
  return {
    weightWithdrawn:  netKg > 0 ? fmt3(netKg) : "",
    weightWithdrawnP: netP  > 0 ? fmt3(netP)  : "",
    averageKg: avgKg > 0 ? fmt3(avgKg) : "",
    averageP:  avgP  > 0 ? fmt3(avgP)  : "",
  };
}

function toEditState(r: Outside): EditState {
  return {
    supplierName:    r.supplierName ?? "",
    yarnType:        r.yarnType,
    lot:             r.lot ?? "",
    spool:           String(r.spool),
    weightPSum:      r.weightPSum      != null ? String(r.weightPSum)      : "",
    weightKgSum:     r.weightKgSum     != null ? String(r.weightKgSum)     : "",
    weightPPackage:  r.weightPPackage  != null ? String(r.weightPPackage)  : "",
    weightKgPackage: r.weightKgPackage != null ? String(r.weightKgPackage) : "",
    weightWithdrawnP: fmt3(r.weightWithdrawnP),
    weightWithdrawn:  String(r.weightWithdrawn),
    averageP:        r.averageP  != null ? String(r.averageP)  : "",
    averageKg:       r.averageKg != null ? String(r.averageKg) : "",
    note:            r.note ?? "",
    withdrawDate:    r.withdrawDate.slice(0, 10),
    pallet:          r.pallet   != null ? String(r.pallet)   : "",
    palletType:      r.palletType ?? "wood",
    box:             r.box      != null ? String(r.box)      : "",
    sack:            r.sack     != null ? String(r.sack)     : "",
    sackType:        r.sackType ?? "plastic",
    paperBar:        r.paperBar != null ? String(r.paperBar) : "",
    spoolType:       r.spoolType ?? "spool_plastic",
    spoolReturnCount: String(r.spoolReturnCount ?? r.spool),
    spoolReturnCountTouched: false,
    returnPallet:    r.returnPallet,
    returnBox:       r.returnBox,
    returnSack:      r.returnSack,
    returnSpool:     r.returnSpool,
    returnPaperBar:  r.returnPaperBar,
    recipient:       r.recipient      ?? "",
    usageNote:       r.usageNote      ?? "",
    paymentComment:  r.paymentComment ?? "",
  };
}

function DRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 w-44 shrink-0">{label}</span>
      <span className="text-xs text-gray-800 font-medium">{value ?? "-"}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function OutsideHistoryList() {
  const qc = useQueryClient();

  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [applied, setApplied] = useState<SearchFilters>(emptyFilters);

  const yarnTypeSuggest  = useFieldSuggestions("/api/warehouse/material/yarn-types");
  const supplierSuggest  = useFieldSuggestions("/api/warehouse/material/suppliers");
  const lotSuggest       = useFieldSuggestions("/api/warehouse/material/lots");
  const recipientSuggest = useFieldSuggestions("/api/warehouse/material/outside/recipients");

  const [selected, setSelected]   = useState<Outside | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("detail");
  const [deleting, setDeleting]   = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editState, setEditState]   = useState<EditState | null>(null);
  const [editErrors, setEditErrors] = useState<Partial<Record<string, string>>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  // ── list query (infinite scroll) ────────────────────────────────────────────
  const { data, isFetching, isFetchingNextPage, isError, fetchNextPage, hasNextPage } = useInfiniteQuery<OutsideResponse>({
    queryKey: ["material-outside", applied],
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams({ page: String(pageParam), limit: String(LIMIT) });
      if (applied.withdrawId)   p.set("withdrawId",   applied.withdrawId);
      if (applied.yarnType)     p.set("yarnType",     applied.yarnType);
      if (applied.supplierName) p.set("supplierName", applied.supplierName);
      if (applied.lot)          p.set("lot",          applied.lot);
      if (applied.recipient)    p.set("recipient",    applied.recipient);
      if (applied.dateFrom)     p.set("dateFrom",      applied.dateFrom);
      if (applied.dateTo)       p.set("dateTo",        applied.dateTo);
      const res = await fetch(`/api/warehouse/material/outside?${p}`);
      if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      return res.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, pg) => s + pg.data.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });

  const sentinelRef = useLoadMoreSentinel(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  });

  const rows  = data?.pages.flatMap((pg) => pg.data) ?? [];
  const total = data?.pages[data.pages.length - 1]?.total ?? 0;

  // ── handlers ────────────────────────────────────────────────────────────────
  function setField<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
  function handleSearch() {
    setApplied(filters);
  }
  function handleClear() {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    yarnTypeSuggest.clear(); supplierSuggest.clear(); lotSuggest.clear(); recipientSuggest.clear();
  }

  function openModal(row: Outside) {
    setSelected(row);
    setActiveTab("detail");
    setDeleteMsg(null);
    setEditState(toEditState(row));
    setEditErrors({});
    setEditMsg(null);
    setConfirmDelete(false);
  }
  function closeModal() {
    setSelected(null);
    setDeleteMsg(null);
    setEditState(null);
    setEditErrors({});
    setEditMsg(null);
    setConfirmDelete(false);
  }
  function switchTab(t: Tab) {
    setActiveTab(t);
    setDeleteMsg(null);
    setEditMsg(null);
    setConfirmDelete(false);
    if (t === "edit" && selected) { setEditState(toEditState(selected)); setEditErrors({}); }
  }

  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    setDeleteMsg(null);
    try {
      const res = await fetch(`/api/warehouse/material/outside?id=${selected.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "ลบไม่สำเร็จ");
      qc.invalidateQueries({ queryKey: ["material-outside"] });
      closeModal();
    } catch (err: unknown) {
      setDeleteMsg(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setDeleting(false);
    }
  }

  // ── Edit handlers ───────────────────────────────────────────────────────────

  function patchEdit(changes: Partial<EditState>) {
    setEditState((s) => s ? { ...s, ...changes } : s);
  }

  function onEditWeightPSum(v: string) {
    setEditState((s) => {
      if (!s) return s;
      const pSum  = parseFloat(v) || 0;
      const kgSum = pSum > 0 ? pSum / LBS_PER_KG : parseFloat(s.weightKgSum) || 0;
      const kgSumStr = pSum > 0 ? fmt3(kgSum) : s.weightKgSum;
      const pPkg  = parseFloat(s.weightPPackage)  || 0;
      const kgPkg = parseFloat(s.weightKgPackage) || 0;
      const spool = parseInt(s.spool) || 0;
      const net = calcNet(pSum, pPkg, parseFloat(kgSumStr) || 0, kgPkg, spool);
      return { ...s, weightPSum: v, weightKgSum: kgSumStr, ...net };
    });
  }
  function onEditWeightKgSum(v: string) {
    setEditState((s) => {
      if (!s) return s;
      const kgSum = parseFloat(v) || 0;
      const pSum  = kgSum > 0 ? fmt3(kgSum * LBS_PER_KG) : s.weightPSum;
      const pPkg  = parseFloat(s.weightPPackage)  || 0;
      const kgPkg = parseFloat(s.weightKgPackage) || 0;
      const spool = parseInt(s.spool) || 0;
      const net = calcNet(parseFloat(pSum) || 0, pPkg, kgSum, kgPkg, spool);
      return { ...s, weightKgSum: v, weightPSum: pSum, ...net };
    });
  }
  function onEditWeightPPackage(v: string) {
    setEditState((s) => {
      if (!s) return s;
      const pPkg  = parseFloat(v) || 0;
      const kgPkg = pPkg > 0 ? fmt3(pPkg / LBS_PER_KG) : s.weightKgPackage;
      const pSum  = parseFloat(s.weightPSum)  || 0;
      const kgSum = parseFloat(s.weightKgSum) || 0;
      const spool = parseInt(s.spool) || 0;
      const net = calcNet(pSum, pPkg, kgSum, parseFloat(kgPkg) || 0, spool);
      return { ...s, weightPPackage: v, weightKgPackage: kgPkg, ...net };
    });
  }
  function onEditWeightKgPackage(v: string) {
    setEditState((s) => {
      if (!s) return s;
      const kgPkg = parseFloat(v) || 0;
      const pPkg  = kgPkg > 0 ? fmt3(kgPkg * LBS_PER_KG) : s.weightPPackage;
      const pSum  = parseFloat(s.weightPSum)  || 0;
      const kgSum = parseFloat(s.weightKgSum) || 0;
      const spool = parseInt(s.spool) || 0;
      const net = calcNet(pSum, parseFloat(pPkg) || 0, kgSum, kgPkg, spool);
      return { ...s, weightKgPackage: v, weightPPackage: pPkg, ...net };
    });
  }
  function onEditSpool(v: string) {
    setEditState((s) => {
      if (!s) return s;
      const spool = parseInt(v) || 0;
      const pSum  = parseFloat(s.weightPSum)      || 0;
      const kgSum = parseFloat(s.weightKgSum)     || 0;
      const pPkg  = parseFloat(s.weightPPackage)  || 0;
      const kgPkg = parseFloat(s.weightKgPackage) || 0;
      const net = calcNet(pSum, pPkg, kgSum, kgPkg, spool);
      // "จำนวนหลอด" follows "จำนวน (ลูก)" until edited directly in this session (see onEditSpoolReturnCount)
      const followSpool = !s.spoolReturnCountTouched;
      return { ...s, spool: v, ...net, ...(followSpool ? { spoolReturnCount: v } : {}) };
    });
  }
  function onEditSpoolReturnCount(v: string) {
    patchEdit({ spoolReturnCount: v, spoolReturnCountTouched: true });
  }
  function onEditWeightWithdrawnP(v: string) {
    const p = parseFloat(v) || 0;
    patchEdit({ weightWithdrawnP: v, weightWithdrawn: p > 0 ? fmt3(p / LBS_PER_KG) : "" });
  }
  function onEditWeightWithdrawnKg(v: string) {
    const k = parseFloat(v) || 0;
    patchEdit({ weightWithdrawn: v, weightWithdrawnP: k > 0 ? fmt3(k * LBS_PER_KG) : "" });
  }

  function validateEdit(s: EditState): boolean {
    const e: Record<string, string> = {};
    if (!s.supplierName.trim()) e.supplierName = "ระบุบริษัท";
    if (!s.yarnType.trim()) e.yarnType = "ระบุชนิดด้าย";
    const sp = parseInt(s.spool);
    if (!s.spool || isNaN(sp) || sp < 1) e.spool = "ต้องมากกว่า 0";
    const w = parseFloat(s.weightWithdrawn);
    if (!s.weightWithdrawn || isNaN(w) || w <= 0) e.weightWithdrawn = "ต้องมากกว่า 0";
    if (!s.recipient.trim()) e.recipient = "ระบุผู้รับวัตถุดิบ";
    setEditErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSaveEdit() {
    if (!selected || !editState) return;
    if (!validateEdit(editState)) return;

    setEditSaving(true);
    setEditMsg(null);
    try {
      const res = await fetch(`/api/warehouse/material/outside?id=${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName:    editState.supplierName.trim() || null,
          yarnType:        editState.yarnType,
          lot:             editState.lot.trim() || null,
          spool:           parseInt(editState.spool),
          weightWithdrawn: parseFloat(editState.weightWithdrawn),
          weightPSum:      editState.weightPSum      ? parseFloat(editState.weightPSum)      : null,
          weightKgSum:     editState.weightKgSum     ? parseFloat(editState.weightKgSum)     : null,
          weightPPackage:  editState.weightPPackage  ? parseFloat(editState.weightPPackage)  : null,
          weightKgPackage: editState.weightKgPackage ? parseFloat(editState.weightKgPackage) : null,
          averageP:        editState.averageP  ? parseFloat(editState.averageP)  : null,
          averageKg:       editState.averageKg ? parseFloat(editState.averageKg) : null,
          note:            editState.note.trim() || null,
          withdrawDate:    editState.withdrawDate || undefined,
          pallet:          editState.pallet   ? parseInt(editState.pallet)   : null,
          palletType:      editState.palletType || null,
          box:             editState.box      ? parseInt(editState.box)      : null,
          sack:            editState.sack     ? parseInt(editState.sack)     : null,
          sackType:        editState.sackType || null,
          paperBar:        editState.paperBar ? parseInt(editState.paperBar) : null,
          spoolType:       editState.spoolType || null,
          spoolReturnCount: editState.spoolReturnCount ? parseInt(editState.spoolReturnCount) : null,
          returnPallet:    editState.returnPallet,
          returnBox:       editState.returnBox,
          returnSack:      editState.returnSack,
          returnSpool:     editState.returnSpool,
          returnPaperBar:  editState.returnPaperBar,
          recipient:       editState.recipient.trim() || null,
          usageNote:       editState.usageNote.trim() || null,
          paymentComment:  editState.paymentComment.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "บันทึกไม่สำเร็จ");
      setEditMsg({ ok: true, text: "บันทึกสำเร็จ" });
      setSelected((prev) => {
        if (!prev) return prev;
        const updated: Outside = { ...prev, ...d.data, weightWithdrawnP: d.data.weightWithdrawn * LBS_PER_KG };
        setEditState(toEditState(updated));
        return updated;
      });
      qc.invalidateQueries({ queryKey: ["material-outside"] });
    } catch (err: unknown) {
      setEditMsg({ ok: false, text: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" });
    } finally {
      setEditSaving(false);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">ประวัติการเบิกวัตถุดิบภายนอก</h1>
          <p className="text-sm text-gray-500">ทั้งหมด {total.toLocaleString()} รายการ</p>
        </div>
        <Link href="/warehouse/material/outside"
          className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors whitespace-nowrap">
          + เบิกภายนอก
        </Link>
      </div>

      {/* Search */}
      <div className="bg-white border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ชนิดด้าย</label>
            <AutocompleteInput
              value={filters.yarnType}
              onChange={(v) => { setField("yarnType", v); yarnTypeSuggest.fetchSuggestions(v); }}
              onSelect={(v) => { setField("yarnType", v); yarnTypeSuggest.clear(); }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              options={yarnTypeSuggest.options}
              placeholder="พิมพ์ชนิดด้าย..."
              inputClassName={inp}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">บริษัท</label>
            <AutocompleteInput
              value={filters.supplierName}
              onChange={(v) => { setField("supplierName", v); supplierSuggest.fetchSuggestions(v); }}
              onSelect={(v) => { setField("supplierName", v); supplierSuggest.clear(); }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              options={supplierSuggest.options}
              placeholder="พิมพ์ชื่อบริษัท..."
              inputClassName={inp}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Lot</label>
            <AutocompleteInput
              value={filters.lot}
              onChange={(v) => { setField("lot", v); lotSuggest.fetchSuggestions(v); }}
              onSelect={(v) => { setField("lot", v); lotSuggest.clear(); }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              options={lotSuggest.options}
              placeholder="พิมพ์ Lot..."
              inputClassName={inp}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ผู้รับวัตถุดิบ</label>
            <AutocompleteInput
              value={filters.recipient}
              onChange={(v) => { setField("recipient", v); recipientSuggest.fetchSuggestions(v); }}
              onSelect={(v) => { setField("recipient", v); recipientSuggest.clear(); }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              options={recipientSuggest.options}
              placeholder="พิมพ์ชื่อผู้รับ..."
              inputClassName={inp}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">เลขที่เบิก</label>
            <input value={filters.withdrawId} onChange={(e) => setField("withdrawId", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="พิมพ์เลขที่เบิก..."
              className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่เริ่ม</label>
            <input type="date" value={filters.dateFrom} onChange={(e) => setField("dateFrom", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่สิ้นสุด</label>
            <input type="date" value={filters.dateTo} onChange={(e) => setField("dateTo", e.target.value)} className={inp} />
          </div>
          <div className="flex items-end gap-2">
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
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-10">#</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">วันที่</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ชนิดด้าย</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ชื่อบริษัท</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">Lot</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">จำนวน (ลูก)</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">น้ำหนักสุทธิ (lbs)</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">น้ำหนักสุทธิ (kg)</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-16">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isFetching && rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : isError ? (
                <tr><td colSpan={9} className="text-center py-12 text-red-400">โหลดข้อมูลไม่สำเร็จ</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : rows.map((row, i) => (
                <tr key={row.id}
                  className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  <td className="px-3 py-2 text-center text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(row.withdrawDate)}</td>
                  <td className="px-3 py-2 text-gray-800 max-w-[120px] truncate" title={row.yarnType}>
                    {row.yarnType}
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-[150px] truncate" title={row.supplierName ?? ""}>
                    {row.supplierName ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-[100px] truncate">{row.lot ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{row.spool.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{numFmt(row.weightWithdrawnP)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{numFmt(row.weightWithdrawn)}</td>
                  <td className="px-3 py-2 text-center">
                    <button type="button" onClick={() => openModal(row)}
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
          hasMore={!!hasNextPage}
          loadingMore={isFetchingNextPage}
          total={total}
          loadedCount={rows.length}
        />
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">

            {/* Modal header */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">จัดการรายการเบิกภายนอก</h2>
                <p className="text-xs text-gray-400">ID: {selected.id} · {selected.yarnType}</p>
              </div>
              <button type="button" onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none w-7 h-7 flex items-center justify-center">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 shrink-0">
              {([
                { key: "detail", label: "ดูรายละเอียด" },
                { key: "edit",   label: "แก้ไข" },
              ] as { key: Tab; label: string }[]).map(({ key, label }) => (
                <button key={key} type="button"
                  onClick={() => switchTab(key)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === key
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── ดูรายละเอียด ─────────────────────────────────── */}
            {activeTab === "detail" && (
            <>
              <div className="overflow-y-auto flex-1 px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ข้อมูลวัตถุดิบ</p>
                <DRow label="วันที่เบิก"   value={fmtDate(selected.withdrawDate)} />
                <DRow label="ชนิดด้าย"     value={selected.yarnType} />
                <DRow label="ชื่อบริษัท"   value={selected.supplierName} />
                <DRow label="Lot"           value={selected.lot} />

                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-2">จำนวน & น้ำหนัก</p>
                <DRow label="จำนวน (ลูก)"            value={selected.spool.toLocaleString()} />
                <DRow label="น้ำหนักรวม (lbs)"        value={numFmt(selected.weightPSum)} />
                <DRow label="น้ำหนักรวม (kg)"         value={numFmt(selected.weightKgSum)} />
                <DRow label="น้ำหนักบรรจุภัณฑ์ (lbs)" value={numFmt(selected.weightPPackage)} />
                <DRow label="น้ำหนักบรรจุภัณฑ์ (kg)"  value={numFmt(selected.weightKgPackage)} />
                <DRow label="น้ำหนักสุทธิ (lbs)"      value={numFmt(selected.weightWithdrawnP)} />
                <DRow label="น้ำหนักสุทธิ (kg)"       value={numFmt(selected.weightWithdrawn)} />
                <DRow label="เฉลี่ย / ลูก (lbs)"      value={numFmt(selected.averageP)} />
                <DRow label="เฉลี่ย / ลูก (kg)"       value={numFmt(selected.averageKg)} />

                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-2">ส่งคืนบรรจุภัณฑ์</p>
                <DRow label="จำนวนพาเลท"     value={selected.pallet?.toLocaleString()} />
                <DRow label="ประเภทพาเลท"    value={selected.palletType ? (PALLET_TYPE_LABEL[selected.palletType] ?? selected.palletType) : null} />
                <DRow label="จำนวนกล่อง"     value={selected.box?.toLocaleString()} />
                <DRow label="จำนวนกระสอบ"    value={selected.sack?.toLocaleString()} />
                <DRow label="ประเภทกระสอบ"   value={selected.sackType ? (SACK_TYPE_LABEL[selected.sackType] ?? selected.sackType) : null} />
                <DRow label="จำนวนกระดาษกั้น" value={selected.paperBar?.toLocaleString()} />
                <DRow label="จำนวนหลอด"      value={(selected.spoolReturnCount ?? selected.spool).toLocaleString()} />
                <DRow label="ประเภทหลอด"     value={selected.spoolType ? (SPOOL_TYPE_LABEL[selected.spoolType] ?? selected.spoolType) : null} />
                <DRow label="คืนพาเลท"       value={yn(selected.returnPallet)} />
                <DRow label="คืนกล่อง"       value={yn(selected.returnBox)} />
                <DRow label="คืนกระสอบ"      value={yn(selected.returnSack)} />
                <DRow label="คืนหลอด"        value={yn(selected.returnSpool)} />
                <DRow label="คืนกระดาษกั้น"   value={yn(selected.returnPaperBar)} />
                <DRow label="ผู้รับวัตถุดิบ"  value={selected.recipient} />
                <DRow label="การนำไปใช้"     value={selected.usageNote} />
                <DRow label="หมายเหตุการเงิน" value={selected.paymentComment} />

                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-2">อื่นๆ</p>
                <DRow label="หมายเหตุ" value={selected.note} />
              </div>
              <div className="shrink-0 px-5 py-3 border-t border-gray-100 flex justify-center">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-4 py-1.5 text-xs border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    ลบรายการนี้
                  </button>
                ) : (
                  <div className="bg-red-50 border border-red-100 px-4 py-3">
                    <p className="text-xs text-red-700 font-medium mb-0.5">ยืนยันการลบรายการนี้?</p>
                    <p className="text-xs text-red-400 mb-3">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                    {deleteMsg && <p className="text-xs text-red-500 mb-2">{deleteMsg}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-1.5 text-xs border border-gray-300 hover:bg-white text-gray-600 transition-colors">
                        ยกเลิก
                      </button>
                      <button type="button" onClick={handleDelete} disabled={deleting}
                        className="flex-1 py-1.5 text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 font-medium transition-colors">
                        {deleting ? "กำลังลบ..." : "ยืนยันลบ"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
            )}

            {/* ── แก้ไข ─────────────────────────────────────────── */}
            {activeTab === "edit" && editState && (
              <>
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">วัตถุดิบ</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        บริษัท<span className="text-red-500 ml-0.5">*</span>
                      </label>
                      <input value={editState.supplierName}
                        onChange={(e) => patchEdit({ supplierName: e.target.value })}
                        placeholder="ชื่อบริษัท"
                        className={`${inp} ${editErrors.supplierName ? errB : ""}`} />
                      {editErrors.supplierName && <p className="text-xs text-red-500 mt-0.5">{editErrors.supplierName}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        ชนิดด้าย<span className="text-red-500 ml-0.5">*</span>
                      </label>
                      <input value={editState.yarnType}
                        onChange={(e) => patchEdit({ yarnType: e.target.value })}
                        placeholder="ชนิดด้าย"
                        className={`${inp} ${editErrors.yarnType ? errB : ""}`} />
                      {editErrors.yarnType && <p className="text-xs text-red-500 mt-0.5">{editErrors.yarnType}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Lot</label>
                      <input value={editState.lot}
                        onChange={(e) => patchEdit({ lot: e.target.value })}
                        placeholder="Lot" className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        จำนวน (ลูก)<span className="text-red-500 ml-0.5">*</span>
                      </label>
                      <input type="number" min="1" value={editState.spool}
                        onChange={(e) => onEditSpool(e.target.value)}
                        placeholder="จำนวน"
                        className={`${inp} ${editErrors.spool ? errB : ""}`} />
                      {editErrors.spool && <p className="text-xs text-red-500 mt-0.5">{editErrors.spool}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">วันที่</label>
                      <input type="date" value={editState.withdrawDate}
                        onChange={(e) => patchEdit({ withdrawDate: e.target.value })}
                        className={inp} />
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">น้ำหนัก</p>
                  <div className="bg-gray-50 p-3 space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">น้ำหนักรวม</p>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" min="0" step="0.001" value={editState.weightPSum}
                          onChange={(e) => onEditWeightPSum(e.target.value)} placeholder="ปอนด์" className={inp} />
                        <input type="number" min="0" step="0.001" value={editState.weightKgSum}
                          onChange={(e) => onEditWeightKgSum(e.target.value)} placeholder="กิโลกรัม" className={inp} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">น้ำหนักบรรจุภัณฑ์</p>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" min="0" step="0.001" value={editState.weightPPackage}
                          onChange={(e) => onEditWeightPPackage(e.target.value)} placeholder="ปอนด์" className={inp} />
                        <input type="number" min="0" step="0.001" value={editState.weightKgPackage}
                          onChange={(e) => onEditWeightKgPackage(e.target.value)} placeholder="กิโลกรัม" className={inp} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">
                        น้ำหนักสุทธิ<span className="text-red-500 ml-0.5">*</span>
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" min="0.001" step="0.001" value={editState.weightWithdrawnP}
                          onChange={(e) => onEditWeightWithdrawnP(e.target.value)}
                          placeholder="ปอนด์" className={`${inp} ${editErrors.weightWithdrawn ? errB : ""}`} />
                        <input type="number" min="0.001" step="0.001" value={editState.weightWithdrawn}
                          onChange={(e) => onEditWeightWithdrawnKg(e.target.value)}
                          placeholder="กิโลกรัม" className={`${inp} ${editErrors.weightWithdrawn ? errB : ""}`} />
                      </div>
                      {editErrors.weightWithdrawn && <p className="text-xs text-red-500 mt-1">{editErrors.weightWithdrawn}</p>}
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">ส่งคืนบรรจุภัณฑ์</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <input type="number" min="0" value={editState.pallet}
                      onChange={(e) => patchEdit({ pallet: e.target.value })} placeholder="จำนวนพาเลท" className={inp} />
                    <select value={editState.palletType}
                      onChange={(e) => patchEdit({ palletType: e.target.value })} className={inp}>
                      <option value="wood">ไม้</option>
                      <option value="steel">เหล็ก</option>
                    </select>
                    <input type="number" min="0" value={editState.box}
                      onChange={(e) => patchEdit({ box: e.target.value })} placeholder="จำนวนกล่อง" className={inp} />
                    <input type="number" min="0" value={editState.paperBar}
                      onChange={(e) => patchEdit({ paperBar: e.target.value })} placeholder="จำนวนกระดาษกั้น" className={inp} />
                    <input type="number" min="0" value={editState.sack}
                      onChange={(e) => patchEdit({ sack: e.target.value })} placeholder="จำนวนกระสอบ" className={inp} />
                    <select value={editState.sackType}
                      onChange={(e) => patchEdit({ sackType: e.target.value })} className={inp}>
                      <option value="p">ปอ</option>
                      <option value="plastic">พลาสติก</option>
                    </select>
                    <input type="number" min="0" value={editState.spoolReturnCount}
                      onChange={(e) => onEditSpoolReturnCount(e.target.value)} placeholder="จำนวนหลอด" className={inp} />
                    <select value={editState.spoolType}
                      onChange={(e) => patchEdit({ spoolType: e.target.value })} className={inp}>
                      <option value="spool_plastic">หลอดกรวย พลาสติก</option>
                      <option value="spool_paper">หลอดกรวย กระดาษ</option>
                      <option value="spoolC_plastic">หลอดทรงกระบอก พลาสติก</option>
                      <option value="spoolC_paper">หลอดทรงกระบอก กระดาษ</option>
                    </select>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {([
                      { key: "returnPallet",   label: "พาเลท" },
                      { key: "returnBox",      label: "กล่อง" },
                      { key: "returnSack",     label: "กระสอบ" },
                      { key: "returnSpool",    label: "หลอด" },
                      { key: "returnPaperBar", label: "กระดาษกั้น" },
                    ] as { key: keyof EditState; label: string }[]).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none shrink-0">
                        <input type="checkbox" checked={editState[key] as boolean}
                          onChange={(e) => patchEdit({ [key]: e.target.checked })}
                          className="w-4 h-4 accent-amber-400 cursor-pointer" />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      ผู้รับวัตถุดิบ<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <input value={editState.recipient}
                      onChange={(e) => patchEdit({ recipient: e.target.value })}
                      placeholder="ผู้รับวัตถุดิบ"
                      className={`${inp} ${editErrors.recipient ? errB : ""}`} />
                    {editErrors.recipient && <p className="text-xs text-red-500 mt-0.5">{editErrors.recipient}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">การนำไปใช้</label>
                    <textarea value={editState.usageNote}
                      onChange={(e) => patchEdit({ usageNote: e.target.value })}
                      rows={2} placeholder="การนำไปใช้" className={`${inp} resize-none`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">หมายเหตุการเงิน</label>
                    <textarea value={editState.paymentComment}
                      onChange={(e) => patchEdit({ paymentComment: e.target.value })}
                      rows={2} placeholder="หมายเหตุการเงิน" className={`${inp} resize-none`} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">หมายเหตุ</label>
                    <input value={editState.note}
                      onChange={(e) => patchEdit({ note: e.target.value })}
                      placeholder="หมายเหตุ (ถ้ามี)" className={inp} />
                  </div>

                  {editMsg && (
                    <p className={`text-xs px-3 py-2 ${editMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      {editMsg.text}
                    </p>
                  )}
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
                  <button type="button" onClick={closeModal}
                    className="px-4 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 text-gray-600">
                    ยกเลิก
                  </button>
                  <button type="button" onClick={handleSaveEdit} disabled={editSaving}
                    className="px-5 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium">
                    {editSaving ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
