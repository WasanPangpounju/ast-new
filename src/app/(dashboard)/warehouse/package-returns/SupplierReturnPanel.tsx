"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AutocompleteInput from "@/components/AutocompleteInput";
import { bangkokYmd } from "@/lib/bangkokDate";
import {
  RETURN_FIELDS,
  SUMMARY_COLUMNS,
  planAllocation,
  type AllocationLine,
  type ColumnTotals,
  type FieldKey,
  type FieldQty,
} from "@/lib/package-return-columns";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SupplierOption {
  id: number;
  name: string;
}

interface Summary {
  supplier: SupplierOption;
  imported: ColumnTotals;
  due: ColumnTotals;
  returned: ColumnTotals;
  outstanding: ColumnTotals;
}

type Receipt = Record<FieldKey, number> & {
  id: number;
  returnDate: string;
  emp: string | null;
  note: string | null;
  unspecifiedSpool: number;
  unspecifiedPallet: number;
  unspecifiedSack: number;
  legacy: boolean; // ย้ายมาจากระบบเดิม — ยกเลิกไม่ได้
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors";
const errB = "border-red-400 focus:ring-red-400";

const emptyQtyInput = (): Record<FieldKey, string> =>
  Object.fromEntries(RETURN_FIELDS.map((f) => [f.key, ""])) as Record<FieldKey, string>;

// returnDate is stored as Bangkok midnight — read it back in Bangkok time, not local/UTC.
function fmtBangkokDate(iso: string) {
  const [y, m, d] = bangkokYmd(iso).split("-");
  return `${d}/${m}/${Number(y) + 543}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "โหลดข้อมูลไม่สำเร็จ");
  return json.data;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-6 pb-3">
      <span className="w-1 h-4 rounded-full bg-blue-500" />
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{children}</span>
    </div>
  );
}

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function SupplierReturnPanel() {
  const qc = useQueryClient();

  const [supplierText, setSupplierText] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [returnDate, setReturnDate] = useState(() => bangkokYmd(new Date()));
  const [qtyInput, setQtyInput] = useState<Record<FieldKey, string>>(emptyQtyInput);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string[]>([]);
  const [confirmLines, setConfirmLines] = useState<AllocationLine[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { data: suppliers = [] } = useQuery<SupplierOption[]>({
    queryKey: ["package-returns-supplier-options"],
    queryFn: () => getJson("/api/warehouse/package-returns/supplier-options"),
  });

  const summaryQuery = useQuery<Summary>({
    queryKey: ["package-returns-summary", supplierId],
    queryFn: () => getJson(`/api/warehouse/package-returns/summary?supplierId=${supplierId}`),
    enabled: supplierId !== null,
  });

  const receiptsQuery = useQuery<Receipt[]>({
    queryKey: ["package-returns-receipts", supplierId],
    queryFn: () => getJson(`/api/warehouse/package-returns/receipts?supplierId=${supplierId}`),
    enabled: supplierId !== null,
  });

  const supplierOptions = useMemo(() => {
    const q = supplierText.trim().toLowerCase();
    return suppliers.filter((s) => !q || s.name.toLowerCase().includes(q)).map((s) => s.name);
  }, [suppliers, supplierText]);

  function selectSupplier(name: string) {
    const s = suppliers.find((x) => x.name === name);
    setSupplierText(name);
    setSupplierId(s?.id ?? null);
    setErrors((prev) => ({ ...prev, supplier: undefined }));
    setFormError([]);
    setSuccessMsg("");
  }

  function onSupplierTextChange(v: string) {
    setSupplierText(v);
    // An exact match counts as selected; anything else clears the table until picked.
    const s = suppliers.find((x) => x.name === v.trim());
    setSupplierId(s?.id ?? null);
    setSuccessMsg("");
  }

  function clearForm() {
    setQtyInput(emptyQtyInput());
    setNote("");
    setReturnDate(bangkokYmd(new Date()));
    setErrors({});
    setFormError([]);
    setSuccessMsg("");
  }

  function handleCheck() {
    const errs: Partial<Record<string, string>> = {};
    setFormError([]);
    setSuccessMsg("");

    if (supplierId === null) errs.supplier = "กรุณาเลือกบริษัทจากรายการ";
    if (!returnDate) errs.returnDate = "กรุณาระบุวันที่คืน";

    const qty = {} as FieldQty;
    for (const f of RETURN_FIELDS) {
      const raw = qtyInput[f.key].trim();
      const n = raw === "" ? 0 : Number(raw);
      if (!Number.isInteger(n) || n < 0) errs[f.key] = "จำนวนเต็ม 0 ขึ้นไป";
      qty[f.key] = Number.isInteger(n) && n > 0 ? n : 0;
    }
    if (!RETURN_FIELDS.some((f) => errs[f.key]) && RETURN_FIELDS.every((f) => qty[f.key] === 0)) {
      errs.qty = "กรุณากรอกจำนวนที่คืนอย่างน้อย 1 ชนิด";
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (!summaryQuery.data) {
      setFormError(["ยังโหลดยอดคงค้างของบริษัทนี้ไม่เสร็จ กรุณารอสักครู่"]);
      return;
    }

    const { lines, errors: overErrors } = planAllocation(qty, summaryQuery.data.outstanding);
    if (overErrors.length > 0) {
      setFormError(overErrors);
      return;
    }
    setSaveError("");
    setConfirmLines(lines);
  }

  async function handleConfirm() {
    if (!confirmLines || supplierId === null) return;
    setSaving(true);
    setSaveError("");
    try {
      const qty = Object.fromEntries(confirmLines.map((l) => [l.field, l.qty]));
      const res = await fetch("/api/warehouse/package-returns/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, returnDate, note: note.trim() || undefined, ...qty }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "บันทึกการคืนไม่สำเร็จ");

      setConfirmLines(null);
      setQtyInput(emptyQtyInput());
      setNote("");
      setSuccessMsg(`บันทึกใบคืน #${json.data.id} เรียบร้อย`);
      qc.invalidateQueries({ queryKey: ["package-returns-summary", supplierId] });
      qc.invalidateQueries({ queryKey: ["package-returns-receipts", supplierId] });
      // The รายการค้าง list (other tab / needs-supplier) reads the same obligations.
      qc.invalidateQueries({ queryKey: ["package-returns-obligations"] });
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      // Totals may have moved under us (409) — refresh so the next ตรวจสอบ uses current numbers.
      qc.invalidateQueries({ queryKey: ["package-returns-summary", supplierId] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        {/* ── บริษัท ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="ชื่อบริษัท" required error={errors.supplier}>
            <AutocompleteInput
              value={supplierText}
              onChange={onSupplierTextChange}
              onSelect={selectSupplier}
              options={supplierOptions}
              placeholder="พิมพ์หรือเลือกชื่อบริษัท"
              inputClassName={`${inp} ${errors.supplier ? errB : ""}`}
            />
          </Field>
        </div>

        {/* ── ตารางสรุปยอด ─────────────────────────────────────────── */}
        <SectionLabel>ยอดบรรจุภัณฑ์ของบริษัท</SectionLabel>
        <SummaryTable
          supplierSelected={supplierId !== null}
          summary={summaryQuery.data}
          loading={summaryQuery.isFetching && !summaryQuery.data}
          error={summaryQuery.isError ? (summaryQuery.error as Error).message : null}
        />

        {/* ── ฟอร์มคืน ─────────────────────────────────────────────── */}
        <SectionLabel>บันทึกการคืน</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field label="วันที่คืน" required error={errors.returnDate}>
            <input type="date" value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className={`${inp} ${errors.returnDate ? errB : ""}`} />
          </Field>
          <Field label="หมายเหตุ">
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุ (ถ้ามี)" className={inp} />
          </Field>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">จำนวนที่คืน <span className="font-normal">(ช่องว่าง = 0)</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {RETURN_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} error={errors[f.key]}>
                <input type="number" min="0" step="1" value={qtyInput[f.key]}
                  onChange={(e) => setQtyInput((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder="0"
                  className={`${inp} ${errors[f.key] ? errB : ""}`} />
              </Field>
            ))}
          </div>
          {errors.qty && <p className="text-xs text-red-500 mt-2">{errors.qty}</p>}
        </div>

        {formError.length > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 space-y-1">
            <p className="font-medium">บันทึกไม่ได้ — คืนเกินยอดคงค้าง</p>
            {formError.map((e) => <p key={e}>• {e}</p>)}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
            {successMsg}
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-6 items-center justify-center">
          <button type="button" onClick={clearForm}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            เคลียร์ข้อมูล
          </button>
          <button type="button" onClick={handleCheck}
            className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors shadow-sm">
            ตรวจสอบ
          </button>
        </div>
      </div>

      {supplierId !== null && (
        <ReceiptHistory
          supplierId={supplierId}
          receipts={receiptsQuery.data ?? []}
          loading={receiptsQuery.isFetching && !receiptsQuery.data}
          error={receiptsQuery.isError ? (receiptsQuery.error as Error).message : null}
        />
      )}

      {confirmLines && (
        <ConfirmModal
          supplierName={supplierText}
          returnDate={returnDate}
          note={note}
          lines={confirmLines}
          saving={saving}
          error={saveError}
          onCancel={() => setConfirmLines(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

// ─── Summary Table ──────────────────────────────────────────────────────────────

type SummaryColumn = (typeof SUMMARY_COLUMNS)[number];

// "hideWhenZero" columns (กระสอบไม่ระบุชนิด) appear only if any row has a value for them.
function visibleColumns(summary?: Summary): SummaryColumn[] {
  return SUMMARY_COLUMNS.filter((c) =>
    !("hideWhenZero" in c) ||
    (!!summary && SUMMARY_ROWS.some((r) => summary[r.key][c.key] !== 0))
  );
}

function groupsOf(columns: SummaryColumn[]) {
  return columns.reduce<{ group: string; span: number }[]>((acc, c) => {
    const last = acc[acc.length - 1];
    if (last && last.group === c.group) last.span++;
    else acc.push({ group: c.group, span: 1 });
    return acc;
  }, []);
}

const SUMMARY_ROWS: { key: keyof Omit<Summary, "supplier">; label: string; cls: string }[] = [
  { key: "imported", label: "นำเข้า", cls: "text-gray-700" },
  { key: "due", label: "ต้องส่งคืน", cls: "text-gray-700" },
  { key: "returned", label: "คืนแล้ว", cls: "text-gray-700" },
  { key: "outstanding", label: "ต้องส่งคืน คงค้าง", cls: "font-semibold text-gray-900 bg-amber-50" },
];

function SummaryTable({ supplierSelected, summary, loading, error }: {
  supplierSelected: boolean; summary?: Summary; loading: boolean; error: string | null;
}) {
  const th = "px-2 py-2 font-medium text-gray-600 border border-gray-200 text-center";
  const columns = visibleColumns(summary);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th rowSpan={2} className={`${th} text-left min-w-[120px]`}>บริษัท</th>
            {groupsOf(columns).map((g) => (
              <th key={g.group} colSpan={g.span} className={th}>{g.group}</th>
            ))}
          </tr>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${th} whitespace-nowrap`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!supplierSelected ? (
            <tr><td colSpan={columns.length + 1} className="text-center py-8 text-gray-400">เลือกบริษัทเพื่อดูยอด</td></tr>
          ) : loading ? (
            <tr><td colSpan={columns.length + 1} className="text-center py-8 text-gray-400">กำลังโหลด...</td></tr>
          ) : error ? (
            <tr><td colSpan={columns.length + 1} className="text-center py-8 text-red-400">{error}</td></tr>
          ) : summary ? (
            SUMMARY_ROWS.map((r) => (
              <tr key={r.key} className={r.cls}>
                <td className="px-2 py-2 border border-gray-200 whitespace-nowrap">{r.label}</td>
                {columns.map((c) => {
                  const v = summary[r.key][c.key];
                  return (
                    <td key={c.key} className={`px-2 py-2 border border-gray-200 text-right ${r.key === "outstanding" && v > 0 ? "text-red-600" : ""}`}>
                      {v.toLocaleString()}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

// ─── Confirm Modal ──────────────────────────────────────────────────────────────

function ConfirmModal({ supplierName, returnDate, note, lines, saving, error, onCancel, onConfirm }: {
  supplierName: string; returnDate: string; note: string; lines: AllocationLine[];
  saving: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  const fromUnspecified = lines.filter((l) => l.fromUnspecified > 0);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-gray-200 shrink-0">
          <h2 className="font-semibold text-gray-900 text-sm">ตรวจสอบการคืนบรรจุภัณฑ์</h2>
          <p className="text-xs text-gray-400 mt-1">กรุณาตรวจสอบข้อมูลก่อนบันทึกจริง</p>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex gap-2"><span className="text-gray-500">บริษัท</span><span className="font-medium text-gray-900">{supplierName}</span></div>
            <div className="flex gap-2"><span className="text-gray-500">วันที่คืน</span><span className="font-medium text-gray-900">{fmtBangkokDate(`${returnDate}T00:00:00+07:00`)}</span></div>
            {note.trim() && (
              <div className="flex gap-2 sm:col-span-2"><span className="text-gray-500">หมายเหตุ</span><span className="font-medium text-gray-900">{note.trim()}</span></div>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">ชนิด</th>
                  <th className="text-right px-3 py-2 font-medium">จำนวนคืน</th>
                  <th className="text-right px-3 py-2 font-medium">ตัดจากชนิดนี้</th>
                  <th className="text-right px-3 py-2 font-medium">ตัดจาก &quot;ไม่ระบุชนิด&quot;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l) => (
                  <tr key={l.field} className={l.fromUnspecified > 0 ? "bg-amber-50" : ""}>
                    <td className="px-3 py-2 text-gray-800">{l.label}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{l.qty.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{l.fromTyped.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right ${l.fromUnspecified > 0 ? "font-semibold text-amber-700" : "text-gray-400"}`}>
                      {l.fromUnspecified > 0 ? l.fromUnspecified.toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {fromUnspecified.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-1">
              <p className="font-medium">มียอดถูกตัดจาก &quot;ไม่ระบุชนิด&quot; เพราะยอดคงค้างของชนิดที่ระบุไม่พอ</p>
              {fromUnspecified.map((l) => (
                <p key={l.field}>• {l.label} {l.fromUnspecified.toLocaleString()} → ตัดจาก{l.unspecifiedLabel}</p>
              ))}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onCancel} disabled={saving}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-60">
            ย้อนกลับแก้ไข
          </button>
          <button type="button" onClick={onConfirm} disabled={saving}
            className="px-4 py-1.5 text-sm text-white rounded-lg font-medium disabled:opacity-60 bg-green-600 hover:bg-green-700">
            {saving ? "กำลังบันทึก..." : "ยืนยันบันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Receipt History ────────────────────────────────────────────────────────────

function ReceiptHistory({ supplierId, receipts, loading, error }: {
  supplierId: number; receipts: Receipt[]; loading: boolean; error: string | null;
}) {
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState("");

  async function handleCancel(r: Receipt) {
    if (!window.confirm(`ยกเลิกใบคืน #${r.id} วันที่ ${fmtBangkokDate(r.returnDate)} ?\nยอดคืนทั้งใบจะถูกคืนกลับเป็นยอดคงค้าง`)) return;
    setCancelling(r.id);
    setCancelError("");
    try {
      const res = await fetch(`/api/warehouse/package-returns/receipts/${r.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "ยกเลิกใบคืนไม่สำเร็จ");
      qc.invalidateQueries({ queryKey: ["package-returns-summary", supplierId] });
      qc.invalidateQueries({ queryKey: ["package-returns-receipts", supplierId] });
      qc.invalidateQueries({ queryKey: ["package-returns-obligations"] });
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setCancelling(null);
    }
  }

  const th = "px-2 py-2 font-medium text-gray-600 whitespace-nowrap";
  return (
    <div className="bg-white shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
        ประวัติการคืน ({receipts.length.toLocaleString()} ครั้ง)
      </div>
      {cancelError && <p className="text-xs text-red-500 px-3 pt-2">{cancelError}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={`${th} text-left`}>เลขที่</th>
              <th className={`${th} text-left`}>วันที่คืน</th>
              {RETURN_FIELDS.map((f) => <th key={f.key} className={`${th} text-right`}>{f.label}</th>)}
              <th className={`${th} text-left`}>ตัดจากไม่ระบุชนิด</th>
              <th className={`${th} text-left`}>ผู้บันทึก</th>
              <th className={`${th} text-left`}>หมายเหตุ</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={RETURN_FIELDS.length + 6} className="text-center py-8 text-gray-400">กำลังโหลด...</td></tr>
            ) : error ? (
              <tr><td colSpan={RETURN_FIELDS.length + 6} className="text-center py-8 text-red-400">{error}</td></tr>
            ) : receipts.length === 0 ? (
              <tr><td colSpan={RETURN_FIELDS.length + 6} className="text-center py-8 text-gray-400">ยังไม่มีประวัติการคืน</td></tr>
            ) : (
              receipts.map((r, i) => {
                const unspecified = [
                  r.unspecifiedSpool > 0 ? `หลอด ${r.unspecifiedSpool}` : "",
                  r.unspecifiedPallet > 0 ? `พาเลท ${r.unspecifiedPallet}` : "",
                  r.unspecifiedSack > 0 ? `กระสอบ ${r.unspecifiedSack}` : "",
                ].filter(Boolean).join(", ");
                return (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-2 py-2 text-gray-500">#{r.id}</td>
                    <td className="px-2 py-2 text-gray-700 whitespace-nowrap">{fmtBangkokDate(r.returnDate)}</td>
                    {RETURN_FIELDS.map((f) => (
                      <td key={f.key} className={`px-2 py-2 text-right ${r[f.key] > 0 ? "text-gray-900 font-medium" : "text-gray-300"}`}>
                        {r[f.key].toLocaleString()}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-amber-700 whitespace-nowrap">{unspecified || "-"}</td>
                    <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{r.emp ?? "-"}</td>
                    <td className="px-2 py-2 text-gray-600 max-w-[160px] truncate" title={r.note ?? ""}>{r.note ?? "-"}</td>
                    <td className="px-2 py-2">
                      {r.legacy ? (
                        <span className="text-gray-400 whitespace-nowrap" title="ใบคืนที่ย้ายมาจากระบบเดิม ยกเลิกไม่ได้">ระบบเดิม</span>
                      ) : (
                        <button type="button" onClick={() => handleCancel(r)} disabled={cancelling === r.id}
                          className="text-red-500 hover:text-red-700 disabled:opacity-50 font-medium whitespace-nowrap">
                          {cancelling === r.id ? "กำลังยกเลิก..." : "ยกเลิก"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
