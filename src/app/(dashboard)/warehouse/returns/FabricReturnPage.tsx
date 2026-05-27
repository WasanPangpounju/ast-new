"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { formatThaiDate } from "@/lib/thai-utils";

interface ReturnRecord {
  id: number;
  returnDate: string;
  supplierName: string;
  fabricCode: string;
  qty: number;
  unit: string;
  returnQty: number;
  receivedQty: number | null;
  totalReturned: number | null;
  note: string | null;
  createdAt: string;
}

const TODAY = new Date().toISOString().slice(0, 10);


interface FormState {
  returnDate: string;
  supplierId: number | null;
  supplierName: string;
  fabricCode: string;
  qty: string;
  unit: string;
  returnQty: string;
  receivedQty: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  returnDate: TODAY,
  supplierId: null,
  supplierName: "",
  fabricCode: "",
  qty: "",
  unit: "หลา",
  returnQty: "",
  receivedQty: "",
  note: "",
};

function SupplierInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: number, name: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<{ id: number; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) { setOptions([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/sales/suppliers?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => setOptions(d.suppliers ?? []))
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        placeholder="พิมพ์ชื่อซัพพลายเออร์"
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
          {options.map((s) => (
            <li
              key={s.id}
              onMouseDown={() => { onChange(s.id, s.name); setQuery(s.name); setOpen(false); }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer"
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReturnModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(field: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function handleSave() {
    if (!form.supplierId) { setError("กรุณาเลือกซัพพลายเออร์จากรายการ"); return; }
    if (!form.fabricCode.trim()) { setError("กรุณากรอกรหัสผ้า"); return; }
    if (!form.qty) { setError("กรุณากรอกจำนวน"); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/warehouse/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: form.supplierId,
          fabricCode: form.fabricCode.trim(),
          qty: parseFloat(form.qty) || 0,
          unit: form.unit,
          returnQty: parseFloat(form.returnQty) || 0,
          returnDate: form.returnDate,
          note: form.note || null,
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
          <h2 className="font-semibold text-gray-900 text-sm">เพิ่มรายการส่งคืนผ้า</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">วันที่ส่งคืน</label>
              <input type="date" value={form.returnDate} onChange={(e) => set("returnDate", e.target.value)}
                lang="en"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ซัพพลายเออร์</label>
              <SupplierInput
                value={form.supplierName}
                onChange={(id, name) => { set("supplierId", id); set("supplierName", name); }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">รหัสผ้า</label>
            <input value={form.fabricCode} onChange={(e) => set("fabricCode", e.target.value)}
              placeholder="รหัสผ้า"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
              <input type="number" value={form.qty} onChange={(e) => set("qty", e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">หน่วย</label>
              <select value={form.unit} onChange={(e) => set("unit", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>หลา</option>
                <option>เมตร</option>
                <option>ม้วน</option>
                <option>กก.</option>
              </select>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
            ยกเลิก
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60">
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                กำลังบันทึก...
              </span>
            ) : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ record, onClose, onSaved }: { record: ReturnRecord; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>({
    returnDate: record.returnDate.slice(0, 10),
    supplierId: null,
    supplierName: record.supplierName,
    fabricCode: record.fabricCode,
    qty: String(record.qty),
    unit: record.unit,
    returnQty: String(record.returnQty ?? ""),
    receivedQty: String(record.receivedQty ?? ""),
    note: record.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(field: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  async function handleSave() {
    if (!form.fabricCode.trim()) { setError("กรุณากรอกรหัสผ้า"); return; }
    if (!form.qty) { setError("กรุณากรอกจำนวน"); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/warehouse/returns/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fabricCode: form.fabricCode.trim(),
          qty: parseFloat(form.qty) || 0,
          unit: form.unit,
          returnQty: parseFloat(form.returnQty) || 0,
          receivedQty: parseFloat(form.receivedQty) || 0,
          returnDate: form.returnDate,
          note: form.note || null,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "เกิดข้อผิดพลาด"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">แก้ไขรายการส่งคืนผ้า</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">วันที่ส่งคืน</label>
              <input type="date" value={form.returnDate} onChange={(e) => set("returnDate", e.target.value)}
                lang="en"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ซัพพลายเออร์</label>
              <div className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 text-gray-500">{record.supplierName}</div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">รหัสผ้า</label>
            <input value={form.fabricCode} onChange={(e) => set("fabricCode", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
              <input type="number" value={form.qty} onChange={(e) => set("qty", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">หน่วย</label>
              <select value={form.unit} onChange={(e) => set("unit", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>หลา</option><option>เมตร</option><option>ม้วน</option><option>กก.</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">จำนวนส่งคืน</label>
              <input type="number" value={form.returnQty} onChange={(e) => set("returnQty", e.target.value)}
                placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">เราได้รับ</label>
              <input type="number" value={form.receivedQty} onChange={(e) => set("receivedQty", e.target.value)}
                placeholder="0" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
            <textarea value={form.note} onChange={(e) => set("note", e.target.value)}
              rows={2} placeholder="หมายเหตุ (ถ้ามี)"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">ยกเลิก</button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60">
            {saving ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังบันทึก...</span> : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ onConfirm, onCancel, deleting }: { onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-gray-900 text-sm mb-2">ยืนยันการลบ</h2>
        <p className="text-xs text-gray-500 mb-5">ต้องการลบรายการนี้ใช่หรือไม่? ไม่สามารถกู้คืนได้</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">ยกเลิก</button>
          <button type="button" onClick={onConfirm} disabled={deleting}
            className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
            {deleting ? "กำลังลบ..." : "ลบ"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FabricReturnPage() {
  const [records, setRecords] = useState<ReturnRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ search: "", supplier: "", dateFrom: "", dateTo: "" });
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<ReturnRecord | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const PER_PAGE = 20;

  const fetchRecords = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page) });
    if (applied.search) p.set("search", applied.search);
    if (applied.supplier) p.set("supplier", applied.supplier);
    if (applied.dateFrom) p.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) p.set("dateTo", applied.dateTo);
    fetch(`/api/warehouse/returns?${p}`)
      .then((r) => r.json())
      .then((d) => { setRecords(d.records ?? []); setTotal(d.total ?? 0); })
      .catch(() => { setRecords([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [page, applied]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function applyFilter() { setPage(1); setApplied({ search, supplier, dateFrom, dateTo }); }
  function clearFilter() {
    setSearch(""); setSupplier(""); setDateFrom(""); setDateTo("");
    setPage(1);
    setApplied({ search: "", supplier: "", dateFrom: "", dateTo: "" });
  }

  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/warehouse/returns/${id}`, { method: "DELETE" });
      if (res.ok) { setDeleteId(null); fetchRecords(); }
    } finally { setDeleting(false); }
  }


  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">ส่งคืนผ้าให้ซัพพลายเออร์</h1>
          <p className="text-xs text-gray-500">ทั้งหมด {total} รายการ</p>
        </div>
        <button type="button" onClick={() => setShowModal(true)}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          + เพิ่มรายการส่งคืน
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ค้นหา (รหัสผ้า)</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="รหัสผ้า..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ซัพพลายเออร์</label>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="ชื่อซัพพลายเออร์..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่เริ่มต้น</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              lang="en"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">วันที่สิ้นสุด</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              lang="en"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={applyFilter}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">ค้นหา</button>
          <button type="button" onClick={clearFilter}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">ล้าง</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="min-w-[900px] w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-10">#</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-28">วันที่ส่งคืน</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ซัพพลายเออร์</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">รหัสผ้า</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-24">จำนวน</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-28">จำนวนส่งคืน</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-28">ได้รับจากซัพ</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-28">ยอดคืนสุทธิ</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">หมายเหตุ</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td>
                </tr>
              ) : (
                records.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2 text-gray-400">{(page - 1) * PER_PAGE + idx + 1}</td>
                    <td className="px-3 py-2 text-gray-700">{formatThaiDate(new Date(r.returnDate))}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.supplierName}</td>
                    <td className="px-3 py-2 text-gray-700">{r.fabricCode}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{r.qty.toLocaleString()} {r.unit}</td>
                    <td className="px-3 py-2 text-center text-orange-600 font-medium">{r.returnQty ?? "-"}</td>
                    <td className="px-3 py-2 text-center text-green-600 font-medium">{r.receivedQty ?? "-"}</td>
                    <td className="px-3 py-2 text-center text-blue-600 font-medium">
                      {((r.returnQty ?? 0) - (r.receivedQty ?? 0)).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{r.note ?? "-"}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1 justify-center">
                        <button type="button" onClick={() => setEditRecord(r)}
                          className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">แก้ไข</button>
                        <button type="button" onClick={() => setDeleteId(r.id)}
                          className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100">ลบ</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">หน้า {page} / {totalPages}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">ก่อนหน้า</button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">ถัดไป</button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <ReturnModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchRecords(); }} />
      )}
      {editRecord && (
        <EditModal record={editRecord} onClose={() => setEditRecord(null)} onSaved={() => { setEditRecord(null); fetchRecords(); }} />
      )}
      {deleteId !== null && (
        <DeleteConfirmModal
          deleting={deleting}
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
