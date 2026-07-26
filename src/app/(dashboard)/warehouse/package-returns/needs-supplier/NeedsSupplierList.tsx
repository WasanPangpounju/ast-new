"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Obligation {
  id: number;
  category: "PALLET" | "BOX" | "SACK" | "SPOOL" | "PAPER_BAR";
  variant: string | null;
  qtyDue: number;
  qtyReturned: number;
  sourceType: "MATERIAL_IMPORT" | "MATERIAL_OUTSIDE";
  createdAt: string;
  material: { id: number; lot: string; supplierName: string } | null;
  materialOutside: { id: number; withdrawId: string; supplierName: string } | null;
}

interface Supplier {
  id: number;
  name: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<Obligation["category"], string> = {
  PALLET: "พาเลท",
  BOX: "กล่อง",
  SACK: "กระสอบ",
  SPOOL: "หลอด",
  PAPER_BAR: "แกนกระดาษ",
};

const SOURCE_LABEL: Record<Obligation["sourceType"], string> = {
  MATERIAL_IMPORT: "นำเข้าวัตถุดิบ",
  MATERIAL_OUTSIDE: "เบิกภายนอก",
};

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear() + 543}`;
  } catch {
    return "-";
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function NeedsSupplierList() {
  const qc = useQueryClient();

  const [selectedSupplier, setSelectedSupplier] = useState<Record<number, number | "">>({});
  const [assigning, setAssigning] = useState<Record<number, boolean>>({});
  const [rowError, setRowError] = useState<Record<number, string>>({});

  const { data, isFetching, isError, error } = useQuery<{ data: Obligation[] }>({
    queryKey: ["package-returns-needs-supplier"],
    queryFn: async () => {
      const res = await fetch("/api/warehouse/package-returns/obligations/needs-supplier");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
      return json;
    },
  });

  const { data: suppliersData, isError: isSuppliersError } = useQuery<{ data: Supplier[] }>({
    queryKey: ["package-returns-suppliers"],
    queryFn: async () => {
      const res = await fetch("/api/warehouse/package-returns/suppliers");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "โหลดรายชื่อซัพพลายเออร์ไม่สำเร็จ");
      return json;
    },
  });

  const rows = data?.data ?? [];
  const suppliers = suppliersData?.data ?? [];

  // ── handlers ────────────────────────────────────────────────────────────────
  async function handleAssign(obligationId: number) {
    const supplierId = selectedSupplier[obligationId];
    if (!supplierId) {
      setRowError((prev) => ({ ...prev, [obligationId]: "กรุณาเลือกซัพพลายเออร์ก่อนยืนยัน" }));
      return;
    }

    setAssigning((prev) => ({ ...prev, [obligationId]: true }));
    setRowError((prev) => ({ ...prev, [obligationId]: "" }));

    try {
      const res = await fetch(`/api/warehouse/package-returns/obligations/${obligationId}/supplier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "มอบหมายซัพพลายเออร์ไม่สำเร็จ");

      // Optimistic removal — no full refetch/reload needed, row just disappears.
      qc.setQueryData<{ data: Obligation[] }>(["package-returns-needs-supplier"], (old) =>
        old ? { data: old.data.filter((o) => o.id !== obligationId) } : old
      );
    } catch (err: unknown) {
      setRowError((prev) => ({
        ...prev,
        [obligationId]: err instanceof Error ? err.message : "เกิดข้อผิดพลาด",
      }));
    } finally {
      setAssigning((prev) => ({ ...prev, [obligationId]: false }));
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">มอบหมายซัพพลายเออร์คืนบรรจุภัณฑ์</h1>
        <p className="text-sm text-gray-500">
          รายการค้างคืนที่ยังไม่ทราบซัพพลายเออร์ ทั้งหมด {rows.length.toLocaleString()} รายการ
        </p>
      </div>

      {isSuppliersError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded mb-3">
          โหลดรายชื่อซัพพลายเออร์ไม่สำเร็จ — ลองรีเฟรชหน้าใหม่
        </div>
      )}

      {/* Table */}
      <div className="bg-white shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-10">#</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">วันที่สร้าง</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ประเภท</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">จำนวนที่ต้องคืน</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">มาจาก</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ซัพพลายเออร์เดิม</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-56">มอบหมายซัพพลายเออร์</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isFetching && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-red-400">
                    {error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    ไม่มีรายการรอมอบหมาย
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const originalSupplierName = row.material?.supplierName ?? row.materialOutside?.supplierName ?? null;
                  const isAssigning = !!assigning[row.id];
                  const rowErr = rowError[row.id];
                  return (
                    <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-3 py-2 text-center text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(row.createdAt)}</td>
                      <td className="px-3 py-2 text-gray-800">
                        {CATEGORY_LABEL[row.category]}
                        {row.variant ? ` (${row.variant})` : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{row.qtyDue.toLocaleString()}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{SOURCE_LABEL[row.sourceType]}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[150px] truncate" title={originalSupplierName ?? ""}>
                        {originalSupplierName ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={selectedSupplier[row.id] ?? ""}
                            onChange={(e) =>
                              setSelectedSupplier((prev) => ({
                                ...prev,
                                [row.id]: e.target.value ? Number(e.target.value) : "",
                              }))
                            }
                            className="border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-0"
                          >
                            <option value="">เลือกซัพพลายเออร์...</option>
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAssign(row.id)}
                            disabled={isAssigning}
                            className="px-2.5 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors whitespace-nowrap"
                          >
                            {isAssigning ? "กำลังยืนยัน..." : "ยืนยัน"}
                          </button>
                        </div>
                        {rowErr && <p className="text-red-500 mt-1">{rowErr}</p>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
