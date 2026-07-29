"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  supplierName: string;
  yarnType:     string;
  lot:          string;
  spool:        string;
  weightReturnP: string;
  weightReturn: string;
  note:         string;
  returnDate:   string;
}

interface PendingItem {
  key:          number;
  supplierName: string;
  yarnType:     string;
  lot:          string;
  spool:        number;
  weightReturn: number;
  note:         string;
  returnDate:   string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LBS_PER_KG = 2.2046;
const fmt3 = (n: number) => (n > 0 ? n.toFixed(3) : "");

// ─── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear() + 543}`;
  } catch { return iso; }
}

let keySeq = 0;
function nextKey() { return ++keySeq; }

function isFormTouched(f: FormState): boolean {
  return !!(f.yarnType.trim() || f.lot.trim() || f.supplierName.trim() ||
    f.spool.trim() || f.weightReturn.trim() || f.note.trim());
}

// ─── Sub-components ────────────────────────────────────────────────────────────

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

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors";
const errB = "border-red-400 focus:ring-red-400";

// ─── Autocomplete ───────────────────────────────────────────────────────────────

function AutocompleteInput({
  value, onChange, onSelect, options, placeholder, inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (v: string) => void;
  options: string[];
  placeholder?: string;
  inputClassName?: string;
}) {
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setShow(true); }}
        onFocus={() => { if (options.length > 0) setShow(true); }}
        placeholder={placeholder}
        className={inputClassName ?? inp}
        autoComplete="off"
      />
      {show && options.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto mt-1">
          {options.map((opt) => (
            <li key={opt}
              onMouseDown={(e) => { e.preventDefault(); onSelect(opt); setShow(false); }}
              className="px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer first:rounded-t-lg last:rounded-b-lg transition-colors">
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

function makeEmpty(t: string): FormState {
  return {
    supplierName: "", yarnType: "", lot: "", spool: "",
    weightReturnP: "", weightReturn: "", note: "", returnDate: t,
  };
}

export default function MaterialReturnForm() {
  const initDate = todayStr();
  const router = useRouter();
  const [form, setForm]       = useState<FormState>(() => makeEmpty(initDate));
  const [errors, setErrors]   = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [supOptions, setSupOptions]   = useState<string[]>([]);
  const [yarnOptions, setYarnOptions] = useState<string[]>([]);
  const [lotOptions, setLotOptions]   = useState<string[]>([]);
  const supTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yarnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lotTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef   = useRef(form);

  useEffect(() => { formRef.current = form; }, [form]);

  function patch(changes: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...changes }));
  }

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Autocomplete fetchers ───────────────────────────────────────────────────

  function onSupplierChange(v: string) {
    patch({ supplierName: v });
    if (supTimer.current) clearTimeout(supTimer.current);
    supTimer.current = setTimeout(async () => {
      if (!v.trim()) { setSupOptions([]); return; }
      try {
        const res = await fetch(`/api/warehouse/material/suppliers?q=${encodeURIComponent(v)}`);
        const data = await res.json();
        setSupOptions(data.data ?? []);
      } catch { setSupOptions([]); }
    }, 300);
  }

  function onYarnTypeChange(v: string) {
    patch({ yarnType: v });
    if (!v.trim()) setLotOptions([]);
    if (yarnTimer.current) clearTimeout(yarnTimer.current);
    yarnTimer.current = setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        if (v.trim()) p.set("q", v);
        const supplier = formRef.current.supplierName.trim();
        if (supplier) p.set("supplierName", supplier);
        const res = await fetch(`/api/warehouse/material/yarn-types?${p}`);
        const data = await res.json();
        setYarnOptions(data.data ?? []);
      } catch { setYarnOptions([]); }
    }, 300);
  }

  function fetchLots(yarnType: string, supplierName: string, q = "") {
    if (!yarnType.trim()) { setLotOptions([]); return; }
    const p = new URLSearchParams({ yarnType });
    if (supplierName) p.set("supplierName", supplierName);
    if (q) p.set("q", q);
    fetch(`/api/warehouse/material/lots?${p}`)
      .then((r) => r.json())
      .then((d) => setLotOptions(d.data ?? []))
      .catch(() => setLotOptions([]));
  }

  function onLotChange(v: string) {
    patch({ lot: v });
    if (lotTimer.current) clearTimeout(lotTimer.current);
    lotTimer.current = setTimeout(() => {
      fetchLots(formRef.current.yarnType, formRef.current.supplierName, v);
    }, 300);
  }

  // ── Weight (kg ↔ lbs two-way bind) ──────────────────────────────────────────
  // Only weightReturn (kg) is persisted server-side — weightReturnP (lbs) is a
  // client-only convenience field, converted the same way as MaterialOutsideForm.

  function onWeightReturnP(v: string) {
    const p = parseFloat(v) || 0;
    patch({ weightReturnP: v, weightReturn: p > 0 ? fmt3(p / LBS_PER_KG) : "" });
  }
  function onWeightReturnKg(v: string) {
    const k = parseFloat(v) || 0;
    patch({ weightReturn: v, weightReturnP: k > 0 ? fmt3(k * LBS_PER_KG) : "" });
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  // Business rule: returns are unrestricted (no cap check against outstanding withdrawn
  // balance) — only basic input validity is enforced here.

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.yarnType.trim()) e.yarnType = "ระบุชนิดด้าย";
    const sp = parseInt(form.spool);
    if (!form.spool || isNaN(sp) || sp < 1) e.spool = "ต้องมากกว่า 0";
    const w = parseFloat(form.weightReturn);
    if (!form.weightReturn || isNaN(w) || w <= 0) e.weightReturn = "ต้องมากกว่า 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Add to pending ──────────────────────────────────────────────────────────

  function handleAddPending() {
    if (!validate()) return;
    setPendingItems((prev) => [...prev, {
      key:          nextKey(),
      supplierName: form.supplierName,
      yarnType:     form.yarnType,
      lot:          form.lot,
      spool:        parseInt(form.spool),
      weightReturn: parseFloat(form.weightReturn),
      note:         form.note,
      returnDate:   form.returnDate,
    }]);
    setForm((prev) => ({
      ...makeEmpty(prev.returnDate),
    }));
    setErrors({});
    setSupOptions([]); setYarnOptions([]); setLotOptions([]);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  // "บันทึก" is always visible/clickable (not gated on pendingItems). It saves
  // pendingItems PLUS whatever's currently typed in the form (if any) — the
  // current form is always validated first so nothing typed gets silently
  // dropped. "+ เพิ่มรายการใหม่" still works the same as before for batching.

  async function handleSave() {
    const touched = isFormTouched(form);
    if (touched) {
      if (!validate()) return;
    } else {
      setErrors({});
    }
    if (!touched && pendingItems.length === 0) {
      showToast("error", "กรุณากรอกข้อมูลอย่างน้อย 1 รายการ");
      return;
    }

    setSaving(true);
    const toSubmit: PendingItem[] = [...pendingItems];
    let currentKey: number | null = null;
    if (touched) {
      currentKey = nextKey();
      toSubmit.push({
        key:          currentKey,
        supplierName: form.supplierName,
        yarnType:     form.yarnType,
        lot:          form.lot,
        spool:        parseInt(form.spool),
        weightReturn: parseFloat(form.weightReturn),
        note:         form.note,
        returnDate:   form.returnDate,
      });
    }

    let successCount = 0;
    const failedKeys: number[] = [];
    for (const item of toSubmit) {
      try {
        const res = await fetch("/api/warehouse/material/return", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            yarnType:     item.yarnType,
            supplierName: item.supplierName || undefined,
            lot:          item.lot          || undefined,
            spool:        item.spool,
            weightReturn: item.weightReturn,
            note:         item.note         || undefined,
            returnDate:   item.returnDate   || undefined,
          }),
        });
        if (!res.ok) throw new Error();
        successCount++;
      } catch {
        failedKeys.push(item.key);
      }
    }

    setSaving(false);
    if (failedKeys.length === 0) {
      setPendingItems([]);
      setForm(makeEmpty(form.returnDate));
      setErrors({});
      showToast("success", `บันทึกสำเร็จ ${successCount} รายการ`);
      setTimeout(() => router.push("/warehouse/material/return-history"), 1200);
    } else {
      setPendingItems(toSubmit.filter((i) => failedKeys.includes(i.key) && i.key !== currentKey));
      if (currentKey !== null && !failedKeys.includes(currentKey)) {
        setForm(makeEmpty(form.returnDate));
      }
      showToast("error", `บันทึกสำเร็จ ${successCount}/${toSubmit.length} รายการ — ${failedKeys.length} รายการล้มเหลว`);
    }
  }

  function handleDeleteRow(key: number) {
    setPendingItems((prev) => prev.filter((item) => item.key !== key));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-full">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">คืนวัตถุดิบเข้าสต็อก</h1>
        <p className="text-sm text-gray-500">บันทึกการคืนเส้นด้ายกลับเข้าสต็อก</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">

        {/* ── วัตถุดิบ ──────────────────────────────────────────────── */}
        <SectionLabel>วัตถุดิบ</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="บริษัท">
            <AutocompleteInput
              value={form.supplierName}
              onChange={onSupplierChange}
              onSelect={(v) => { patch({ supplierName: v }); setSupOptions([]); }}
              options={supOptions}
              placeholder="พิมพ์ชื่อบริษัท"
            />
          </Field>

          <Field label="ชนิดด้าย" required error={errors.yarnType}>
            <AutocompleteInput
              value={form.yarnType}
              onChange={onYarnTypeChange}
              onSelect={(v) => { patch({ yarnType: v }); setYarnOptions([]); fetchLots(v, formRef.current.supplierName, formRef.current.lot); }}
              options={yarnOptions}
              placeholder="เช่น CP 30/1, R 30"
              inputClassName={`${inp} ${errors.yarnType ? errB : ""}`}
            />
          </Field>

          <Field label="Lot">
            <AutocompleteInput
              value={form.lot}
              onChange={onLotChange}
              onSelect={(v) => { patch({ lot: v }); setLotOptions([]); }}
              options={lotOptions}
              placeholder="ล็อตที่ (พิมพ์หรือเลือกจากรายการ)"
            />
          </Field>

          <Field label="จำนวน (ลูก)" required error={errors.spool}>
            <input type="number" min="1" value={form.spool}
              onChange={(e) => patch({ spool: e.target.value })}
              placeholder="จำนวน"
              className={`${inp} ${errors.spool ? errB : ""}`} />
          </Field>

          <Field label="วันที่คืน">
            <input type="date" value={form.returnDate}
              onChange={(e) => patch({ returnDate: e.target.value })}
              title="วันที่คืน"
              className={inp} />
          </Field>
        </div>

        {/* ── น้ำหนักที่คืน ─────────────────────────────────────────── */}
        <SectionLabel>น้ำหนักที่คืน</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ปอนด์">
            <input type="number" min="0.001" step="0.001" value={form.weightReturnP}
              onChange={(e) => onWeightReturnP(e.target.value)}
              placeholder="ปอนด์" className={inp} />
          </Field>
          <Field label="กิโลกรัม" required error={errors.weightReturn}>
            <input type="number" min="0.001" step="0.001" value={form.weightReturn}
              onChange={(e) => onWeightReturnKg(e.target.value)}
              placeholder="กิโลกรัม"
              className={`${inp} ${errors.weightReturn ? errB : ""}`} />
          </Field>
        </div>

        {/* ── หมายเหตุ ─────────────────────────────────────────────── */}
        <SectionLabel>อื่นๆ</SectionLabel>
        <Field label="หมายเหตุ">
          <input value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="หมายเหตุ (ถ้ามี)"
            className={inp} />
        </Field>

        {/* ── ส่วนควบคุม ──────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 pt-6 items-center justify-center">
          <button type="button" onClick={handleAddPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm">
            + เพิ่มรายการใหม่
          </button>
          <button type="button"
            onClick={() => { setForm(makeEmpty(initDate)); setErrors({}); setSupOptions([]); setYarnOptions([]); setLotOptions([]); }}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            เคลียร์ข้อมูล
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 transition-colors shadow-sm">
            {saving
              ? "กำลังบันทึก..."
              : (() => {
                  const total = pendingItems.length + (isFormTouched(form) ? 1 : 0);
                  return total > 1 ? `บันทึก ${total} รายการ` : "บันทึก";
                })()}
          </button>
        </div>

        {/* ── รายการที่รอบันทึก ──────────────────────────────────────── */}
        {pendingItems.length > 0 && (
          <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-3">
              รายการที่รอบันทึก ({pendingItems.length})
            </p>
            <div className="overflow-x-auto rounded-lg border border-blue-100">
              <table className="w-full text-xs bg-white">
                <thead>
                  <tr className="bg-blue-100/60 text-blue-800">
                    <th className="px-3 py-2.5 text-center font-medium w-8">#</th>
                    <th className="px-3 py-2.5 text-left font-medium">ชนิดด้าย</th>
                    <th className="px-3 py-2.5 text-left font-medium">บริษัท</th>
                    <th className="px-3 py-2.5 text-left font-medium">Lot</th>
                    <th className="px-3 py-2.5 text-right font-medium">ลูก</th>
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">คืน (kg)</th>
                    <th className="px-3 py-2.5 text-left font-medium">วันที่</th>
                    <th className="px-3 py-2.5 w-12"><span className="sr-only">จัดการ</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingItems.map((item, i) => (
                    <tr key={item.key} className={`${i % 2 === 0 ? "bg-white" : "bg-blue-50/30"} hover:bg-blue-50/50 transition-colors`}>
                      <td className="px-3 py-2 text-center text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-800 font-medium max-w-30 truncate" title={item.yarnType}>{item.yarnType}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-35 truncate" title={item.supplierName}>{item.supplierName || "-"}</td>
                      <td className="px-3 py-2 text-gray-500">{item.lot || "-"}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{item.spool.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">
                        {item.weightReturn.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(item.returnDate)}</td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => handleDeleteRow(item.key)}
                          className="px-2 py-0.5 text-xs text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors flex items-center gap-1 mx-auto">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              รวม <span className="font-semibold text-gray-800">{pendingItems.length}</span> รายการ — กด &quot;บันทึก&quot; ด้านบนเพื่อบันทึกทั้งหมด
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
