"use client";
import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";

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
  createdAt:       string;
  material: {
    lot: string;
    yarnType: string;
    supplierName: string;
  } | null;
}

interface OutsideResponse {
  data: Outside[];
  total: number;
  page: number;
  totalPages: number;
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

const LIMIT = 20;
const inp = "w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

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

  const [q, setQ]               = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [appliedQ, setAppliedQ]               = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo]     = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected]   = useState<Outside | null>(null);
  const [deleting, setDeleting]   = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── list query ──────────────────────────────────────────────────────────────
  const { data, isFetching, isError } = useQuery<OutsideResponse>({
    queryKey: ["material-outside", appliedQ, appliedDateFrom, appliedDateTo, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (appliedQ)        p.set("q",       appliedQ);
      if (appliedDateFrom) p.set("dateFrom", appliedDateFrom);
      if (appliedDateTo)   p.set("dateTo",   appliedDateTo);
      const res = await fetch(`/api/warehouse/material/outside?${p}`);
      if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      return res.json();
    },
    placeholderData: keepPreviousData,
  });

  const rows       = data?.data       ?? [];
  const total      = data?.total      ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const from       = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to         = Math.min(page * LIMIT, total);

  // ── handlers ────────────────────────────────────────────────────────────────
  function handleSearch() {
    setPage(1);
    setAppliedQ(q);
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
  }
  function handleClear() {
    setQ(""); setDateFrom(""); setDateTo("");
    setAppliedQ(""); setAppliedDateFrom(""); setAppliedDateTo("");
    setPage(1);
  }

  function openModal(row: Outside) {
    setSelected(row);
    setDeleteMsg(null);
    setConfirmDelete(false);
  }
  function closeModal() {
    setSelected(null);
    setDeleteMsg(null);
    setConfirmDelete(false);
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">ค้นหา (ชนิดด้าย, บริษัท, Lot, เลขที่เบิก)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="พิมพ์ค้นหา..."
              className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่เริ่ม</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่สิ้นสุด</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inp} />
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
                  <td className="px-3 py-2 text-center text-gray-400">{(page - 1) * LIMIT + i + 1}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(row.createdAt)}</td>
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

        {/* Pagination */}
        {totalPages >= 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              {total === 0
                ? "ไม่มีข้อมูล"
                : `แสดง ${from.toLocaleString()}–${to.toLocaleString()} จาก ${total.toLocaleString()} รายการ`}
              {isFetching && <span className="ml-2 text-blue-500">กำลังโหลด...</span>}
            </p>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">«</button>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">‹</button>
              <span className="px-3 py-1 text-xs border border-gray-300 bg-white">{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">›</button>
              <button type="button" onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">»</button>
            </div>
          </div>
        )}
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

            {/* ── ดูรายละเอียด ─────────────────────────────────── */}
            <>
              <div className="overflow-y-auto flex-1 px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">ข้อมูลวัตถุดิบ</p>
                <DRow label="วันที่เบิก"   value={fmtDate(selected.createdAt)} />
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
          </div>
        </div>
      )}
    </div>
  );
}
