"use client";
import { useState, useRef, useEffect } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  department: string;
  emp: string;
  supplierName: string;
  yarnType: string;
  lot: string;
  spool: string;
  weightWithdrawnP: string;
  weightWithdrawn: string;
  withdrawDate: string;
  note: string;
}

interface PendingItem {
  key: number;
  department: string;
  emp: string;
  supplierName: string;
  yarnType: string;
  lot: string;
  spool: number;
  weightWithdrawn: number;
  withdrawDate: string;
  note: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LBS_PER_KG = 2.2046;
const fmt3 = (n: number) => (n > 0 ? n.toFixed(3) : "");

// ─── localStorage helpers ───────────────────────────────────────────────────────

const EMP_KEY = "material-emp-list";

function getEmpList(): string[] {
  try { return JSON.parse(localStorage.getItem(EMP_KEY) ?? "[]"); } catch { return []; }
}
function saveEmpToList(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const list = getEmpList();
  if (list.includes(trimmed)) return false;
  list.push(trimmed);
  localStorage.setItem(EMP_KEY, JSON.stringify(list));
  return true;
}
function removeEmpFromList(name: string): string[] {
  const list = getEmpList().filter((n) => n !== name);
  localStorage.setItem(EMP_KEY, JSON.stringify(list));
  return list;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear() + 543}`;
  } catch { return iso; }
}

let keySeq = 0;
function nextKey() { return ++keySeq; }

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "amber" }) {
  return (
    <div className="flex items-center gap-2 pt-6 pb-3">
      <span className={`w-1 h-4 rounded-full ${color === "amber" ? "bg-amber-400" : "bg-blue-500"}`} />
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{children}</span>
    </div>
  );
}

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

const inp = "w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const sel = "w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
const errB = "border-red-400";

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
        <ul className="absolute z-10 left-0 right-0 bg-white border border-gray-200 shadow-sm max-h-48 overflow-y-auto mt-0.5">
          {options.map((opt) => (
            <li key={opt}
              onMouseDown={(e) => { e.preventDefault(); onSelect(opt); setShow(false); }}
              className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer">
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

interface Props { emp: string; }

function makeEmpty(t: string, emp: string): FormState {
  return { department: "ห้องสืบผ้า", emp, supplierName: "", yarnType: "", lot: "", spool: "", weightWithdrawnP: "", weightWithdrawn: "", withdrawDate: t, note: "" };
}

export default function MaterialRequisitionForm({ emp }: Props) {
  const initDate = todayStr();
  const [form, setForm] = useState<FormState>(() => makeEmpty(initDate, emp));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [empList, setEmpList] = useState<string[]>([]);
  const [supOptions, setSupOptions]   = useState<string[]>([]);
  const [yarnOptions, setYarnOptions] = useState<string[]>([]);
  const [lotOptions, setLotOptions]   = useState<string[]>([]);
  const supTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yarnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lotTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);

  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { setEmpList(getEmpList()); }, []);

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

  // ── Weight converters ───────────────────────────────────────────────────────

  function onWeightP(v: string) {
    const p = parseFloat(v) || 0;
    patch({ weightWithdrawnP: v, weightWithdrawn: p > 0 ? fmt3(p / LBS_PER_KG) : "" });
  }
  function onWeightKg(v: string) {
    const k = parseFloat(v) || 0;
    patch({ weightWithdrawn: v, weightWithdrawnP: k > 0 ? fmt3(k * LBS_PER_KG) : "" });
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.supplierName.trim()) e.supplierName = "ระบุชื่อบริษัท";
    if (!form.yarnType.trim()) e.yarnType = "ระบุชนิดด้าย";
    const sp = parseInt(form.spool);
    if (!form.spool || isNaN(sp) || sp < 1) e.spool = "ต้องมากกว่า 0";
    const w = parseFloat(form.weightWithdrawn);
    if (!form.weightWithdrawn || isNaN(w) || w <= 0) e.weightWithdrawn = "ต้องมากกว่า 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Add to pending list (no API call) ──────────────────────────────────────

  function handleAddPending() {
    if (!validate()) return;
    setPendingItems((prev) => [...prev, {
      key: nextKey(),
      department: form.department,
      emp: form.emp,
      supplierName: form.supplierName,
      yarnType: form.yarnType,
      lot: form.lot,
      spool: parseInt(form.spool),
      weightWithdrawn: parseFloat(form.weightWithdrawn),
      withdrawDate: form.withdrawDate,
      note: form.note,
    }]);
    setForm((prev) => ({ ...prev, supplierName: "", yarnType: "", lot: "", spool: "", weightWithdrawnP: "", weightWithdrawn: "", note: "" }));
    setErrors({});
    setSupOptions([]);
    setYarnOptions([]);
    setLotOptions([]);
  }

  // ── Save all pending to DB ──────────────────────────────────────────────────

  async function handleSaveAll() {
    if (pendingItems.length === 0) return;
    setSaving(true);
    let successCount = 0;
    const failedKeys: number[] = [];

    for (const item of pendingItems) {
      try {
        const res = await fetch("/api/warehouse/material/requisition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            department:      item.department,
            emp:             item.emp          || undefined,
            spool:           item.spool,
            weightWithdrawn: item.weightWithdrawn,
            note:            item.note         || undefined,
            supplierName:    item.supplierName || undefined,
            yarnType:        item.yarnType     || undefined,
            lot:             item.lot          || undefined,
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
      showToast("success", `บันทึกสำเร็จ ${successCount} รายการ`);
    } else {
      setPendingItems((prev) => prev.filter((i) => failedKeys.includes(i.key)));
      showToast("error", `บันทึกสำเร็จ ${successCount}/${pendingItems.length} รายการ — ${failedKeys.length} รายการล้มเหลว`);
    }
  }

  // ── Delete last pending (local only) ───────────────────────────────────────

  function handleDeleteLast() {
    setPendingItems((prev) => prev.slice(0, -1));
  }

  // ── Delete specific row (local only) ───────────────────────────────────────

  function handleDeleteRow(key: number) {
    setPendingItems((prev) => prev.filter((item) => item.key !== key));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">เบิกวัตถุดิบใช้ภายใน</h1>
        <p className="text-sm text-gray-500">บันทึกการเบิกเส้นด้ายออกใช้งาน</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">

        {/* ── ข้อมูลการเบิก ─────────────────────────────────────────── */}
        <SectionLabel>ข้อมูลการเบิก</SectionLabel>
        <div className="grid grid-cols-3 gap-4 pb-1 items-start">
          <Field label="เบิกวัตถุดิบใช้ที่" required>
            <select value={form.department} onChange={(e) => patch({ department: e.target.value })} className={sel}>
              <option value="ห้องสืบผ้า">ห้องสืบผ้า</option>
              <option value="ห้องทอผ้า">ห้องทอผ้า</option>
            </select>
          </Field>

          <Field label="พนักงาน">
            <div className="flex gap-1.5">
              <input
                value={form.emp}
                onChange={(e) => patch({ emp: e.target.value })}
                placeholder="ชื่อพนักงาน"
                className={inp}
              />
              <button type="button"
                onClick={() => {
                  if (saveEmpToList(form.emp)) {
                    setEmpList(getEmpList());
                    showToast("success", "บันทึกชื่อแล้ว");
                  }
                }}
                className="shrink-0 px-2 py-1.5 text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 whitespace-nowrap">
                + บันทึกชื่อ
              </button>
            </div>
            {empList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {empList.map((name) => (
                  <span key={name}
                    onClick={() => patch({ emp: name })}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded text-gray-700 cursor-pointer hover:bg-blue-50 hover:border-blue-200 select-none">
                    {name}
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setEmpList(removeEmpFromList(name)); }}
                      className="text-gray-400 hover:text-red-500 font-medium leading-none">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="วันที่">
            <input type="date" value={form.withdrawDate}
              onChange={(e) => patch({ withdrawDate: e.target.value })}
              className={inp} />
          </Field>
        </div>

        {/* ── วัตถุดิบ ──────────────────────────────────────────────── */}
        <SectionLabel>วัตถุดิบ</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-1">
          <Field label="บริษัท" required error={errors.supplierName}>
            <AutocompleteInput
              value={form.supplierName}
              onChange={onSupplierChange}
              onSelect={(v) => { patch({ supplierName: v }); setSupOptions([]); }}
              options={supOptions}
              placeholder="พิมพ์ชื่อบริษัท"
              inputClassName={`${inp} ${errors.supplierName ? errB : ""}`}
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
              inputClassName={inp}
            />
          </Field>

          <Field label="จำนวน (ลูก)" required error={errors.spool}>
            <input type="number" min="1" value={form.spool}
              onChange={(e) => patch({ spool: e.target.value })}
              placeholder="จำนวน"
              className={`${inp} ${errors.spool ? errB : ""}`} />
          </Field>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              น้ำหนักที่เบิก<span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">ปอนด์</label>
                <input type="number" min="0.001" step="0.001" value={form.weightWithdrawnP}
                  onChange={(e) => onWeightP(e.target.value)}
                  placeholder="ปอนด์"
                  className={inp} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">กิโลกรัม</label>
                <input type="number" min="0.001" step="0.001" value={form.weightWithdrawn}
                  onChange={(e) => onWeightKg(e.target.value)}
                  placeholder="กิโลกรัม"
                  className={`${inp} ${errors.weightWithdrawn ? errB : ""}`} />
              </div>
            </div>
            {errors.weightWithdrawn && <p className="text-xs text-red-500 mt-0.5">{errors.weightWithdrawn}</p>}
          </div>

          <Field label="หมายเหตุ">
            <input value={form.note}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="หมายเหตุ (ถ้ามี)"
              className={inp} />
          </Field>
        </div>

        {/* ── ส่วนควบคุม ────────────────────────────────────────────── */}
        <SectionLabel>ส่วนควบคุม</SectionLabel>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleAddPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors">
            + เพิ่มรายการใหม่
          </button>
          <button type="button" onClick={handleDeleteLast}
            disabled={pendingItems.length === 0}
            className="px-4 py-2 text-sm border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
            ลบรายการล่าสุด
          </button>
          <button type="button"
            onClick={() => { setForm(makeEmpty(initDate, emp)); setErrors({}); setSupOptions([]); setYarnOptions([]); setLotOptions([]); }}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
            เคลียร์ข้อมูล
          </button>
        </div>

        {/* ── รายการที่รอบันทึก ──────────────────────────────────────── */}
        {pendingItems.length > 0 && (
          <>
            <SectionLabel>รายการที่รอบันทึก</SectionLabel>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2.5 text-center text-gray-500 font-medium w-8">#</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">บริษัท</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">ชนิดด้าย</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium">ลูก</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium whitespace-nowrap">น้ำหนัก (kg)</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">วันที่</th>
                    <th className="px-3 py-2.5 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingItems.map((item, i) => (
                    <tr key={item.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2 text-center text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[140px] truncate" title={item.supplierName}>{item.supplierName}</td>
                      <td className="px-3 py-2 text-gray-800 max-w-[120px] truncate" title={item.yarnType}>{item.yarnType}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">{item.spool.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {item.weightWithdrawn.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(item.withdrawDate)}</td>
                      <td className="px-3 py-2 text-center">
                        <button type="button"
                          onClick={() => handleDeleteRow(item.key)}
                          className="px-2 py-0.5 text-xs text-red-500 border border-red-200 hover:bg-red-50">
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-gray-500">
                รอบันทึก <span className="font-semibold text-gray-800">{pendingItems.length}</span> รายการ
              </p>
              <button type="button" onClick={handleSaveAll} disabled={saving}
                className="px-6 py-2 text-sm bg-green-600 text-white hover:bg-green-700 font-medium disabled:opacity-50 transition-colors">
                {saving ? "กำลังบันทึก..." : `บันทึก ${pendingItems.length} รายการ`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
