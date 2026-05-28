"use client";
import { useState, useEffect, useCallback } from "react";
import { formatThaiDate } from "@/lib/thai-utils";

const TODAY = new Date().toISOString().slice(0, 10);

interface MaterialReturnRecord {
  id: number;
  returnId: string;
  lot: string | null;
  yarnType: string;
  supplierName: string | null;
  spool: number;
  weightReturn: number;
  note: string | null;
  returnDate: string;
  createdAt: string;
}

interface FormState {
  returnDate: string;
  supplierName: string;
  woodPallet: string;
  steelPallet: string;
  box: string;
  sack: string;
  paperCone: string;
  plasticCone: string;
  plasticTube: string;
  paperTube: string;
  dividerPaper: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  returnDate: TODAY,
  supplierName: "",
  woodPallet: "",
  steelPallet: "",
  box: "",
  sack: "",
  paperCone: "",
  plasticCone: "",
  plasticTube: "",
  paperTube: "",
  dividerPaper: "",
  note: "",
};

function AddModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(field: K, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function handleSave() {
    if (!form.supplierName.trim()) {
      setError("กรุณากรอกชื่อซัพพลายเออร์");
      return;
    }
    // รวม qty ทั้งหมด
    const items = [
      { label: "พาเลทไม้", val: form.woodPallet },
      { label: "พาเลทเหล็ก", val: form.steelPallet },
      { label: "กล่อง", val: form.box },
      { label: "กระสอบ", val: form.sack },
      { label: "กรวยกระดาษ", val: form.paperCone },
      { label: "กรวยพลาสติก", val: form.plasticCone },
      { label: "กระบอกพลาสติก", val: form.plasticTube },
      { label: "กระบอกกระดาษ", val: form.paperTube },
      { label: "กระดาษกั้น", val: form.dividerPaper },
    ];
    const totalQty = items.reduce((s, i) => s + (Number(i.val) || 0), 0);
    if (totalQty <= 0) {
      setError("กรุณากรอกจำนวนบรรจุภัณฑ์อย่างน้อย 1 รายการ");
      return;
    }
    const itemNote = items
      .filter((i) => Number(i.val) > 0)
      .map((i) => `${i.label} ${i.val}`)
      .join(", ");
    const fullNote = [itemNote, form.note.trim()].filter(Boolean).join(" | ");

    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/warehouse/material/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yarnType: "บรรจุภัณฑ์",
          supplierName: form.supplierName.trim(),
          spool: totalQty,
          weightReturn: 0,
          note: fullNote || undefined,
          returnDate: form.returnDate || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">
            เพิ่มรายการส่งคืนบรรจุภัณฑ์
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-5 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                วันที่ส่งคืน
              </label>
              <input
                type="date"
                value={form.returnDate}
                onChange={(e) => set("returnDate", e.target.value)}
                lang="en"
                aria-label="วันที่ส่งคืน"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                ซัพพลายเออร์ <span className="text-red-500">*</span>
              </label>
              <input
                value={form.supplierName}
                onChange={(e) => set("supplierName", e.target.value)}
                placeholder="ชื่อซัพพลายเออร์"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">พาเลทไม้</label>
              <input type="number" value={form.woodPallet || ""} onChange={(e) => set("woodPallet", e.target.value)}
                placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">พาเลทเหล็ก</label>
              <input type="number" value={form.steelPallet || ""} onChange={(e) => set("steelPallet", e.target.value)}
                placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">กล่อง</label>
              <input type="number" value={form.box || ""} onChange={(e) => set("box", e.target.value)}
                placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">กระสอบ</label>
              <input type="number" value={form.sack || ""} onChange={(e) => set("sack", e.target.value)}
                placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">กรวยกระดาษ</label>
              <input type="number" value={form.paperCone || ""} onChange={(e) => set("paperCone", e.target.value)}
                placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">กรวยพลาสติก</label>
              <input type="number" value={form.plasticCone || ""} onChange={(e) => set("plasticCone", e.target.value)}
                placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">กระบอกพลาสติก</label>
              <input type="number" value={form.plasticTube || ""} onChange={(e) => set("plasticTube", e.target.value)}
                placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">กระบอกกระดาษ</label>
              <input type="number" value={form.paperTube || ""} onChange={(e) => set("paperTube", e.target.value)}
                placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">กระดาษกั้น</label>
            <input type="number" value={form.dividerPaper || ""} onChange={(e) => set("dividerPaper", e.target.value)}
              placeholder="จำนวน" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
            <textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              rows={2}
              placeholder="หมายเหตุ (ถ้ามี)"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                กำลังบันทึก...
              </span>
            ) : (
              "บันทึก"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FabricReturnPage() {
  const [records, setRecords] = useState<MaterialReturnRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({
    search: "",
    dateFrom: "",
    dateTo: "",
  });
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const PER_PAGE = 20;

  const fetchRecords = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page) });
    if (applied.search) p.set("search", applied.search);
    if (applied.dateFrom) p.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) p.set("dateTo", applied.dateTo);
    fetch(`/api/warehouse/material/return?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setRecords(d.records ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => {
        setRecords([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [page, applied]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  function applyFilter() {
    setPage(1);
    setApplied({ search, dateFrom, dateTo });
  }
  function clearFilter() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    setApplied({ search: "", dateFrom: "", dateTo: "" });
  }

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            ส่งคืนบรรจุภัณฑ์
          </h1>
          <p className="text-xs text-gray-500">ทั้งหมด {total} รายการ</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          + เพิ่มรายการ
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              ค้นหา (ชนิดด้าย)
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="ชนิดด้าย..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              วันที่เริ่มต้น
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              lang="en"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              วันที่สิ้นสุด
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              lang="en"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={applyFilter}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            ค้นหา
          </button>
          <button
            type="button"
            onClick={clearFilter}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            ล้าง
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="min-w-175 w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-10">
                  #
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-28">
                  วันที่ส่งคืน
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  ชนิดด้าย
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  Lot
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  ซัพพลายเออร์
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-24">
                  จำนวนกาก
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-28">
                  น้ำหนักคืน (กก.)
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  หมายเหตุ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                records.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="hover:bg-blue-50/30 transition-colors"
                  >
                    <td className="px-3 py-2 text-gray-400">
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {formatThaiDate(new Date(r.returnDate))}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {r.yarnType}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.lot ?? "-"}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.supplierName ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-orange-600 font-medium">
                      {r.spool.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-600 font-medium">
                      {r.weightReturn.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{r.note ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">
              หน้า {page} / {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <AddModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchRecords();
          }}
        />
      )}
    </div>
  );
}
