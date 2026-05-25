"use client";
import React, { useState, useEffect, useCallback } from "react";

interface Supplier {
  id: number;
  name: string;
  tax: string | null;
  address: string | null;
  tel: string | null;
  email: string | null;
  type: string | null;
}

interface Coordinator {
  id: number;
  tax: string;
  name: string;
  jobTitle: string | null;
  tel: string | null;
}

const TYPES = ["ซัพพลายเออร์", "บุคคลธรรมดา", "นิติบุคคล", "อื่นๆ"];
const emptyForm = {
  name: "",
  tax: "",
  address: "",
  tel: "",
  email: "",
  type: "ซัพพลายเออร์",
};
const emptyCoordForm = { name: "", jobTitle: "", tel: "" };

export default function SalesSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [coordLoading, setCoordLoading] = useState(false);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [coordModal, setCoordModal] = useState<"add" | "edit" | null>(null);
  const [editingCoord, setEditingCoord] = useState<Coordinator | null>(null);
  const [coordForm, setCoordForm] = useState(emptyCoordForm);
  const [coordSaving, setCoordSaving] = useState(false);
  const [coordError, setCoordError] = useState("");

  const totalPages = Math.ceil(total / 20);

  const fetchSuppliers = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page) });
    if (applied) p.set("q", applied);
    if (typeFilter) p.set("type", typeFilter);
    fetch(`/api/sales/suppliers?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setSuppliers(d.suppliers ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [page, applied, typeFilter]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  async function fetchCoordinators(tax: string) {
    setCoordLoading(true);
    try {
      const res = await fetch(
        `/api/sales/coordinators?tax=${encodeURIComponent(tax)}`,
      );
      const d = await res.json();
      setCoordinators(d.coordinators ?? []);
    } catch {}
    setCoordLoading(false);
  }

  async function toggleExpand(supplier: Supplier) {
    if (expanded === supplier.id) {
      setExpanded(null);
      return;
    }
    setCoordinators([]);
    setExpanded(supplier.id);
    if (supplier.tax) await fetchCoordinators(supplier.tax);
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModal("add");
  }
  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      tax: s.tax ?? "",
      address: s.address ?? "",
      tel: s.tel ?? "",
      email: s.email ?? "",
      type: s.type ?? "ซัพพลายเออร์",
    });
    setError("");
    setModal("edit");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const url =
        modal === "edit"
          ? `/api/sales/suppliers/${editing!.id}`
          : "/api/sales/suppliers";
      const method = modal === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      setModal(null);
      fetchSuppliers();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: Supplier) {
    if (!confirm(`ลบซัพพลายเออร์ "${s.name}" ?`)) return;
    await fetch(`/api/sales/suppliers/${s.id}`, { method: "DELETE" });
    fetchSuppliers();
  }

  function openAddCoord() {
    setEditingCoord(null);
    setCoordForm(emptyCoordForm);
    setCoordError("");
    setCoordModal("add");
  }
  function openEditCoord(coord: Coordinator) {
    setEditingCoord(coord);
    setCoordForm({
      name: coord.name,
      jobTitle: coord.jobTitle ?? "",
      tel: coord.tel ?? "",
    });
    setCoordError("");
    setCoordModal("edit");
  }

  async function handleSaveCoord() {
    setCoordSaving(true);
    setCoordError("");
    const tax = suppliers.find((s) => s.id === expanded)?.tax ?? "";
    try {
      const url =
        coordModal === "edit"
          ? `/api/sales/coordinators/${editingCoord!.id}`
          : "/api/sales/coordinators";
      const method = coordModal === "edit" ? "PUT" : "POST";
      const body =
        coordModal === "edit"
          ? {
              name: coordForm.name,
              jobTitle: coordForm.jobTitle,
              tel: coordForm.tel,
            }
          : {
              tax,
              name: coordForm.name,
              jobTitle: coordForm.jobTitle,
              tel: coordForm.tel,
            };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        setCoordError(d.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      setCoordModal(null);
      if (tax) await fetchCoordinators(tax);
    } finally {
      setCoordSaving(false);
    }
  }

  async function handleDeleteCoord(coord: Coordinator) {
    if (!confirm(`ลบผู้ประสานงาน "${coord.name}" ?`)) return;
    await fetch(`/api/sales/coordinators/${coord.id}`, { method: "DELETE" });
    const tax = suppliers.find((s) => s.id === expanded)?.tax ?? "";
    if (tax) await fetchCoordinators(tax);
  }

  function handleExport() {
    const p = new URLSearchParams();
    if (applied) p.set("q", applied);
    if (typeFilter) p.set("type", typeFilter);
    window.location.href = `/api/sales/suppliers/export?${p}`;
  }

  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">
            ข้อมูลซัพพลายเออร์
          </h1>
          <p className="text-sm text-gray-500">
            ทั้งหมด {total.toLocaleString()} ราย
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
          >
            ส่งออก Excel
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1"
              className="bi bi-plus"
              viewBox="0 0 16 16"
            >
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" />
            </svg>{" "}
            เพิ่มซัพพลายเออร์
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm flex gap-2 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อหรือเลขที่ผู้เสียภาษี..."
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), setApplied(q))}
          className="flex-1 min-w-180px border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
        >
          <option value="">ทุกประเภท</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setPage(1);
            setApplied(q);
          }}
          className="px-5 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          ค้นหา
        </button>
        <button
          onClick={() => {
            setQ("");
            setApplied("");
            setTypeFilter("");
            setPage(1);
          }}
          className="px-4 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600"
        >
          เคลียร์
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-12">
                  ลำดับ
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-14">
                  รหัส
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  ชื่อซัพพลายเออร์
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-48">
                  ที่อยู่
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-36">
                  เลขที่ผู้เสียภาษี
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-28">
                  โทรศัพท์
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-24">
                  ประเภท
                </th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-24">
                  จัดการ
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
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                suppliers.map((s, i) => (
                  <React.Fragment key={s.id}>
                    <tr
                      className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${expanded === s.id ? "bg-blue-50/40" : ""}`}
                      onClick={() => toggleExpand(s)}
                    >
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {(page - 1) * 20 + i + 1}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-600">
                        {s.id}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        {s.name}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 w-48 max-w-[192px]">
                        <span
                          className="block truncate"
                          title={s.address ?? ""}
                        >
                          {s.address ?? "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">
                        {s.tax ?? "-"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {s.tel ?? "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {s.type ?? "-"}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(s)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === s.id && (
                      <tr key={`expand-${s.id}`}>
                        <td
                          colSpan={8}
                          className="bg-blue-50/60 px-6 py-3 border-t border-blue-100"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-600 font-medium">
                              ผู้ประสานงาน (tax: {s.tax ?? "-"})
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openAddCoord();
                              }}
                              className="flex items-center text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                fill="currentColor"
                                stroke="currentColor"
                                strokeWidth="1"
                                className="bi bi-plus"
                                viewBox="0 0 16 16"
                              >
                                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" />
                              </svg>{" "}
                              เพิ่มผู้ประสานงาน
                            </button>
                          </div>
                          {coordLoading ? (
                            <div className="text-xs text-gray-400">
                              กำลังโหลด...
                            </div>
                          ) : coordinators.length === 0 ? (
                            <div className="text-xs text-gray-400">
                              ไม่มีข้อมูลผู้ประสานงาน
                            </div>
                          ) : (
                            <table className="text-xs w-full max-w-2xl mb-1">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left pr-4 py-1">ชื่อ</th>
                                  <th className="text-left pr-4 py-1">
                                    ตำแหน่ง
                                  </th>
                                  <th className="text-left pr-4 py-1">
                                    โทรศัพท์
                                  </th>
                                  <th className="text-left py-1">จัดการ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {coordinators.map((coord) => (
                                  <tr key={coord.id}>
                                    <td className="pr-4 py-1 font-medium text-gray-800">
                                      {coord.name}
                                    </td>
                                    <td className="pr-4 py-1 text-gray-600">
                                      {coord.jobTitle ?? "-"}
                                    </td>
                                    <td className="pr-4 py-1 text-gray-600">
                                      {coord.tel ?? "-"}
                                    </td>
                                    <td className="py-1">
                                      <div className="flex gap-1">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openEditCoord(coord);
                                          }}
                                          className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                        >
                                          แก้ไข
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteCoord(coord);
                                          }}
                                          className="px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                                        >
                                          ลบ
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <div className="mt-2 text-xs text-gray-500">
                            อีเมล: {s.email ?? "-"}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              หน้า {page} จาก {totalPages} ({total.toLocaleString()} ราย)
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white"
              >
                ‹
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white"
              >
                ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Supplier Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setModal(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">
                {modal === "add"
                  ? "เพิ่มซัพพลายเออร์ใหม่"
                  : "แก้ไขข้อมูลซัพพลายเออร์"}
              </h2>
              <button
                onClick={() => setModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-3">
              {error && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {[
                { label: "ชื่อซัพพลายเออร์ *", key: "name" },
                { label: "เลขที่ผู้เสียภาษี *", key: "tax" },
                { label: "ที่อยู่", key: "address" },
                { label: "โทรศัพท์", key: "tel" },
                { label: "อีเมล", key: "email" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-1">
                    {label}
                  </label>
                  <input
                    value={(form as any)[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  ประเภท
                </label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coordinator Add/Edit Modal */}
      {coordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setCoordModal(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">
                {coordModal === "add"
                  ? "เพิ่มผู้ประสานงาน"
                  : "แก้ไขผู้ประสานงาน"}
              </h2>
              <button
                onClick={() => setCoordModal(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-3">
              {coordError && (
                <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {coordError}
                </div>
              )}
              {[
                { label: "ชื่อ *", key: "name" },
                { label: "ตำแหน่ง", key: "jobTitle" },
                { label: "โทรศัพท์", key: "tel" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-600 mb-1">
                    {label}
                  </label>
                  <input
                    value={(coordForm as any)[key]}
                    onChange={(e) =>
                      setCoordForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setCoordModal(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveCoord}
                disabled={coordSaving}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
              >
                {coordSaving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
