"use client";
import React, { useState, useEffect, useCallback } from "react";

interface Customer {
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

const TYPES = ["ลูกค้า", "บุคคลธรรมดา", "นิติบุคคล", "โบรกเกอร์", "อื่นๆ"];

const emptyForm = {
  name: "",
  tax: "",
  address: "",
  tel: "",
  email: "",
  type: "ลูกค้า",
};

export default function SalesCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [coordLoading, setCoordLoading] = useState(false);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalPages = Math.ceil(total / 20);

  const fetchCustomers = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({
      page: String(page),
      ...(applied ? { q: applied } : {}),
    });
    fetch(`/api/sales/customers?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setCustomers(d.customers ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [page, applied]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  async function toggleExpand(customer: Customer) {
    if (expanded === customer.id) {
      setExpanded(null);
      return;
    }
    setExpanded(customer.id);
    setCoordLoading(true);
    try {
      const res = await fetch(`/api/sales/customers/${customer.id}`);
      const d = await res.json();
      setCoordinators(d.coordinators ?? []);
    } catch {}
    setCoordLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setModal("add");
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      tax: c.tax ?? "",
      address: c.address ?? "",
      tel: c.tel ?? "",
      email: c.email ?? "",
      type: c.type ?? "ลูกค้า",
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
          ? `/api/sales/customers/${editing!.id}`
          : "/api/sales/customers";
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
      fetchCustomers();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Customer) {
    if (!confirm(`ลบลูกค้า "${c.name}" ?`)) return;
    await fetch(`/api/sales/customers/${c.id}`, { method: "DELETE" });
    fetchCustomers();
  }

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">ข้อมูลลูกค้า</h1>
          <p className="text-xs text-gray-500">
            ทั้งหมด {total.toLocaleString()} ราย
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
        >
          ➕ เพิ่มลูกค้า
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 shadow-sm flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาชื่อหรือเลขที่ผู้เสียภาษี..."
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), setApplied(q))}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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
            setPage(1);
          }}
          className="px-4 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600"
        >
          เคลียร์
        </button>
      </div>

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
                  ชื่อลูกค้า
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
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                customers.map((c, i) => (
                  <React.Fragment key={c.id}>
                    <tr
                      className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${expanded === c.id ? "bg-blue-50/40" : ""}`}
                      onClick={() => toggleExpand(c)}
                    >
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {(page - 1) * 20 + i + 1}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-gray-600">
                        {c.id}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        {c.name}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">
                        {c.tax ?? "-"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {c.tel ?? "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {c.type ?? "-"}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr>
                        <td
                          colSpan={7}
                          className="bg-blue-50/60 px-6 py-3 border-t border-blue-100"
                        >
                          <div className="text-xs text-gray-600 mb-2 font-medium">
                            ผู้ประสานงาน (tax: {c.tax})
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
                            <table className="text-xs w-full max-w-xl">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left pr-4 py-1">ชื่อ</th>
                                  <th className="text-left pr-4 py-1">
                                    ตำแหน่ง
                                  </th>
                                  <th className="text-left py-1">โทรศัพท์</th>
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
                                    <td className="py-1 text-gray-600">
                                      {coord.tel ?? "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <div className="mt-2 text-xs text-gray-500">
                            ที่อยู่: {c.address ?? "-"} &nbsp;|&nbsp; อีเมล:{" "}
                            {c.email ?? "-"}
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setModal(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">
                {modal === "add" ? "เพิ่มลูกค้าใหม่" : "แก้ไขข้อมูลลูกค้า"}
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
                { label: "ชื่อลูกค้า *", key: "name" },
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
    </div>
  );
}
