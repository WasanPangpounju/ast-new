"use client";
import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Category = "PALLET" | "BOX" | "SACK" | "SPOOL" | "PAPER_BAR";
type SourceType = "MATERIAL_IMPORT" | "MATERIAL_OUTSIDE";
type Status = "PENDING" | "PARTIALLY_RETURNED" | "RETURNED";

interface Obligation {
  id: number;
  category: Category;
  variant: string | null;
  qtyDue: number;
  qtyReturned: number;
  status: Status;
  sourceType: SourceType;
  recipientName: string | null;
  createdAt: string;
  supplier: { id: number; name: string } | null;
  material: { id: number; lot: string } | null;
  materialOutside: { id: number; withdrawId: string } | null;
}

interface Entry {
  id: number;
  qty: number;
  returnedAt: string;
  emp: string | null;
  note: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<Category, string> = {
  PALLET: "พาเลท",
  BOX: "กล่อง",
  SACK: "กระสอบ",
  SPOOL: "หลอด",
  PAPER_BAR: "แกนกระดาษ",
};

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "รอคืน",
  PARTIALLY_RETURNED: "คืนบางส่วน",
  RETURNED: "คืนครบแล้ว",
};

const STATUS_BADGE: Record<Status, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  PARTIALLY_RETURNED: "bg-amber-100 text-amber-700",
  RETURNED: "bg-green-100 text-green-700",
};

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear() + 543}`;
  } catch {
    return "-";
  }
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${fmtDate(iso)} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return "-";
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────────

const TABS: { key: SourceType; label: string }[] = [
  { key: "MATERIAL_IMPORT", label: "นำเข้าวัตถุดิบ (ซัพพลายเออร์)" },
  { key: "MATERIAL_OUTSIDE", label: "เบิกภายนอก (ผู้รับ)" },
];

export default function PackageReturnsRecord({ emp }: { emp: string }) {
  const [tab, setTab] = useState<SourceType>("MATERIAL_IMPORT");

  return (
    <div className="p-4 max-w-full">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">บันทึกคืนบรรจุภัณฑ์</h1>
        <p className="text-sm text-gray-500">รายการค้างคืนที่ทราบคู่ค้าแล้ว — บันทึกจำนวนที่คืนจริงในแต่ละครั้ง</p>
      </div>

      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ObligationTable sourceType={tab} emp={emp} />
    </div>
  );
}

// ─── Obligation Table (per tab) ─────────────────────────────────────────────────

function ObligationTable({ sourceType, emp }: { sourceType: SourceType; emp: string }) {
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"" | Status>("");
  const [formOpenFor, setFormOpenFor] = useState<number | null>(null);
  const [qtyInput, setQtyInput] = useState<Record<number, string>>({});
  const [empInput, setEmpInput] = useState<Record<number, string>>({});
  const [noteInput, setNoteInput] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [historyOpenFor, setHistoryOpenFor] = useState<number | null>(null);

  const queryKey = ["package-returns-obligations", sourceType, statusFilter];

  const { data, isFetching, isError, error } = useQuery<{ data: Obligation[] }>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ sourceType });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/warehouse/package-returns/obligations?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
      return json;
    },
  });

  const rows = data?.data ?? [];

  function openForm(row: Obligation) {
    setFormOpenFor(row.id);
    setQtyInput((prev) => ({ ...prev, [row.id]: "" }));
    setEmpInput((prev) => ({ ...prev, [row.id]: prev[row.id] ?? emp }));
    setNoteInput((prev) => ({ ...prev, [row.id]: "" }));
    setRowError((prev) => ({ ...prev, [row.id]: "" }));
  }

  function closeForm(obligationId: number) {
    setFormOpenFor(null);
    setRowError((prev) => ({ ...prev, [obligationId]: "" }));
  }

  async function handleSubmit(obligationId: number) {
    const qtyStr = qtyInput[obligationId] ?? "";
    const qty = Number(qtyStr);
    if (!qtyStr || !Number.isInteger(qty) || qty <= 0) {
      setRowError((prev) => ({ ...prev, [obligationId]: "กรุณากรอกจำนวนที่คืนเป็นจำนวนเต็มมากกว่า 0" }));
      return;
    }

    setSubmitting((prev) => ({ ...prev, [obligationId]: true }));
    setRowError((prev) => ({ ...prev, [obligationId]: "" }));

    try {
      const res = await fetch(`/api/warehouse/package-returns/obligations/${obligationId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qty,
          emp: empInput[obligationId]?.trim() || undefined,
          note: noteInput[obligationId]?.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกการคืนไม่สำเร็จ");

      qc.setQueryData<{ data: Obligation[] }>(queryKey, (old) => {
        if (!old) return old;
        const updated = old.data.map((o) => {
          if (o.id !== obligationId) return o;
          const qtyReturned = o.qtyReturned + qty;
          const status: Status = qtyReturned >= o.qtyDue ? "RETURNED" : qtyReturned > 0 ? "PARTIALLY_RETURNED" : "PENDING";
          return { ...o, qtyReturned, status };
        });
        // If the row's new status no longer matches the active filter, drop it from view.
        const filtered = statusFilter
          ? updated.filter((o) => o.status === statusFilter)
          : updated.filter((o) => o.status !== "RETURNED");
        return { data: filtered };
      });

      qc.invalidateQueries({ queryKey: ["package-returns-entries", obligationId] });
      setFormOpenFor(null);
    } catch (err: unknown) {
      setRowError((prev) => ({ ...prev, [obligationId]: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" }));
    } finally {
      setSubmitting((prev) => ({ ...prev, [obligationId]: false }));
    }
  }

  return (
    <div className="bg-white shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 bg-gray-50">
        <span className="text-xs text-gray-500">ทั้งหมด {rows.length.toLocaleString()} รายการ</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | Status)}
          className="border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">ทั้งหมด (ไม่รวมคืนครบแล้ว)</option>
          <option value="PENDING">รอคืน</option>
          <option value="PARTIALLY_RETURNED">คืนบางส่วน</option>
          <option value="RETURNED">คืนครบแล้ว</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-10">#</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">วันที่สร้าง</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-600">คู่ค้า</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-600">ประเภท</th>
              <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">ต้องคืน</th>
              <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">คืนแล้ว</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">สถานะ</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-600 w-72">การบันทึก</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isFetching && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังโหลด...
                  </div>
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-red-400">
                  {error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  ไม่มีรายการ
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const counterparty = row.sourceType === "MATERIAL_IMPORT" ? row.supplier?.name : row.recipientName;
                const isFormOpen = formOpenFor === row.id;
                const isSubmitting = !!submitting[row.id];
                const err = rowError[row.id];
                const isHistoryOpen = historyOpenFor === row.id;

                return (
                  <Fragment key={row.id}>
                    <tr className={`hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-3 py-2 text-center text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(row.createdAt)}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[150px] truncate" title={counterparty ?? ""}>
                        {counterparty ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-800">
                        {CATEGORY_LABEL[row.category]}
                        {row.variant ? ` (${row.variant})` : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{row.qtyDue.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.qtyReturned.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[row.status]}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {row.status !== "RETURNED" && !isFormOpen && (
                            <button
                              type="button"
                              onClick={() => openForm(row)}
                              className="px-2.5 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors whitespace-nowrap"
                            >
                              บันทึกคืน
                            </button>
                          )}
                          {row.status === "RETURNED" && (
                            <button
                              type="button"
                              onClick={() => setHistoryOpenFor(isHistoryOpen ? null : row.id)}
                              className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition-colors whitespace-nowrap"
                            >
                              {isHistoryOpen ? "ปิดประวัติ" : "ดูประวัติการคืน"}
                            </button>
                          )}
                        </div>
                        {err && <p className="text-red-500 mt-1">{err}</p>}
                      </td>
                    </tr>
                    {isFormOpen && (
                      <tr className="bg-blue-50/50">
                        <td colSpan={8} className="px-3 py-2.5">
                          <div className="flex items-end gap-2 flex-wrap">
                            <label className="flex flex-col gap-0.5">
                              <span className="text-gray-500">จำนวนที่คืนครั้งนี้</span>
                              <input
                                type="number"
                                min={1}
                                value={qtyInput[row.id] ?? ""}
                                onChange={(e) => setQtyInput((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                className="border border-gray-300 px-2 py-1 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                              />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="text-gray-500">ผู้บันทึก</span>
                              <input
                                type="text"
                                value={empInput[row.id] ?? ""}
                                onChange={(e) => setEmpInput((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                className="border border-gray-300 px-2 py-1 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </label>
                            <label className="flex flex-col gap-0.5 flex-1 min-w-[160px]">
                              <span className="text-gray-500">หมายเหตุ (ถ้ามี)</span>
                              <input
                                type="text"
                                value={noteInput[row.id] ?? ""}
                                onChange={(e) => setNoteInput((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                className="border border-gray-300 px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleSubmit(row.id)}
                              disabled={isSubmitting}
                              className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
                            >
                              {isSubmitting ? "กำลังบันทึก..." : "ยืนยันการคืน"}
                            </button>
                            <button
                              type="button"
                              onClick={() => closeForm(row.id)}
                              className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isHistoryOpen && <HistoryRow obligationId={row.id} qc={qc} />}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── History Row (expanded under a RETURNED obligation) ────────────────────────

function HistoryRow({ obligationId, qc }: { obligationId: number; qc: ReturnType<typeof useQueryClient> }) {
  const [cancelling, setCancelling] = useState<Record<number, boolean>>({});
  const [cancelError, setCancelError] = useState<string>("");

  const { data, isFetching, isError, error } = useQuery<{ data: Entry[] }>({
    queryKey: ["package-returns-entries", obligationId],
    queryFn: async () => {
      const res = await fetch(`/api/warehouse/package-returns/obligations/${obligationId}/entries`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "โหลดประวัติไม่สำเร็จ");
      return json;
    },
  });

  const entries = data?.data ?? [];

  async function handleCancel(entryId: number) {
    setCancelling((prev) => ({ ...prev, [entryId]: true }));
    setCancelError("");
    try {
      const res = await fetch(`/api/warehouse/package-returns/entries/${entryId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ยกเลิกรายการไม่สำเร็จ");

      qc.setQueryData<{ data: Entry[] }>(["package-returns-entries", obligationId], (old) =>
        old ? { data: old.data.filter((e) => e.id !== entryId) } : old
      );
      // Obligation totals changed (qtyReturned decreased, status may revert) — the list
      // that's currently filtered to RETURNED-only may no longer include this row, and
      // stale numbers would be confusing either way, so just refetch it.
      qc.invalidateQueries({ queryKey: ["package-returns-obligations"] });
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setCancelling((prev) => ({ ...prev, [entryId]: false }));
    }
  }

  return (
    <tr className="bg-gray-50">
      <td colSpan={8} className="px-3 py-2.5">
        <div className="text-gray-600 font-medium mb-1.5">ประวัติการคืน</div>
        {isFetching && entries.length === 0 ? (
          <div className="text-gray-400 py-2">กำลังโหลด...</div>
        ) : isError ? (
          <div className="text-red-400 py-2">{error instanceof Error ? error.message : "โหลดประวัติไม่สำเร็จ"}</div>
        ) : entries.length === 0 ? (
          <div className="text-gray-400 py-2">ไม่มีประวัติการคืน</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-1 font-medium">วันที่-เวลา</th>
                <th className="text-right py-1 font-medium">จำนวน</th>
                <th className="text-left py-1 font-medium">ผู้บันทึก</th>
                <th className="text-left py-1 font-medium">หมายเหตุ</th>
                <th className="text-left py-1 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-1 text-gray-600 whitespace-nowrap">{fmtDateTime(e.returnedAt)}</td>
                  <td className="py-1 text-right text-gray-800">{e.qty.toLocaleString()}</td>
                  <td className="py-1 text-gray-600">{e.emp ?? "-"}</td>
                  <td className="py-1 text-gray-600">{e.note ?? "-"}</td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => handleCancel(e.id)}
                      disabled={!!cancelling[e.id]}
                      className="text-red-500 hover:text-red-700 disabled:opacity-50 font-medium"
                    >
                      {cancelling[e.id] ? "กำลังยกเลิก..." : "ยกเลิก"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {cancelError && <p className="text-red-500 mt-1">{cancelError}</p>}
      </td>
    </tr>
  );
}
