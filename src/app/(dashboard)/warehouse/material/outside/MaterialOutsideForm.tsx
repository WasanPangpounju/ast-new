"use client";
import { useState, useRef, useEffect } from "react";
import { Calendar } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  supplierName:   string;
  yarnType:       string;
  lot:            string;
  spool:          string;
  weightPSum:     string;
  weightKgSum:    string;
  weightPPackage: string;
  weightKgPackage: string;
  weightWithdrawnP: string;
  weightWithdrawn:  string;
  averageP:  string;
  averageKg: string;
  note:      string;
  withdrawDate: string;
}

interface PendingItem {
  key:            number;
  supplierName:   string;
  yarnType:       string;
  lot:            string;
  spool:          number;
  weightPSum:     number;
  weightKgSum:    number;
  weightPPackage: number;
  weightKgPackage: number;
  weightWithdrawn: number;
  averageP:  number;
  averageKg: number;
  note:      string;
  withdrawDate: string;
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

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide pt-5 pb-2">
      {children}
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

const inp = "w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
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
              className="px-5 py-5 text-xl hover:bg-blue-50 cursor-pointer">
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
    weightPSum: "", weightKgSum: "",
    weightPPackage: "", weightKgPackage: "",
    weightWithdrawnP: "", weightWithdrawn: "",
    averageP: "", averageKg: "",
    note: "", withdrawDate: t,
  };
}

export default function MaterialOutsideForm() {
  const initDate = todayStr();
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

  // ── Weight calculators ──────────────────────────────────────────────────────

  function calcNet(pSum: number, pPkg: number, kgSum: number, kgPkg: number, spool: number) {
    const netKg = kgSum - kgPkg;
    const netP  = pSum  - pPkg;
    const avgKg = spool > 0 ? netKg / spool : 0;
    const avgP  = spool > 0 ? netP  / spool : 0;
    return {
      weightWithdrawn:  netKg > 0 ? fmt3(netKg) : "",
      weightWithdrawnP: netP  > 0 ? fmt3(netP)  : "",
      averageKg: avgKg > 0 ? fmt3(avgKg) : "",
      averageP:  avgP  > 0 ? fmt3(avgP)  : "",
    };
  }

  function onWeightPSum(v: string) {
    const pSum  = parseFloat(v) || 0;
    const kgSum = pSum > 0 ? pSum / LBS_PER_KG : parseFloat(formRef.current.weightKgSum) || 0;
    const kgSumStr = pSum > 0 ? fmt3(kgSum) : formRef.current.weightKgSum;
    const pPkg  = parseFloat(formRef.current.weightPPackage)  || 0;
    const kgPkg = parseFloat(formRef.current.weightKgPackage) || 0;
    const spool = parseInt(formRef.current.spool) || 0;
    const net = calcNet(pSum, pPkg, parseFloat(kgSumStr) || 0, kgPkg, spool);
    patch({ weightPSum: v, weightKgSum: kgSumStr, ...net });
  }

  function onWeightKgSum(v: string) {
    const kgSum = parseFloat(v) || 0;
    const pSum  = kgSum > 0 ? fmt3(kgSum * LBS_PER_KG) : formRef.current.weightPSum;
    const pPkg  = parseFloat(formRef.current.weightPPackage)  || 0;
    const kgPkg = parseFloat(formRef.current.weightKgPackage) || 0;
    const spool = parseInt(formRef.current.spool) || 0;
    const net = calcNet(parseFloat(pSum) || 0, pPkg, kgSum, kgPkg, spool);
    patch({ weightKgSum: v, weightPSum: pSum, ...net });
  }

  function onWeightPPackage(v: string) {
    const pPkg  = parseFloat(v) || 0;
    const kgPkg = pPkg > 0 ? fmt3(pPkg / LBS_PER_KG) : formRef.current.weightKgPackage;
    const pSum  = parseFloat(formRef.current.weightPSum)  || 0;
    const kgSum = parseFloat(formRef.current.weightKgSum) || 0;
    const spool = parseInt(formRef.current.spool) || 0;
    const net = calcNet(pSum, pPkg, kgSum, parseFloat(kgPkg) || 0, spool);
    patch({ weightPPackage: v, weightKgPackage: kgPkg, ...net });
  }

  function onWeightKgPackage(v: string) {
    const kgPkg = parseFloat(v) || 0;
    const pPkg  = kgPkg > 0 ? fmt3(kgPkg * LBS_PER_KG) : formRef.current.weightPPackage;
    const pSum  = parseFloat(formRef.current.weightPSum)  || 0;
    const kgSum = parseFloat(formRef.current.weightKgSum) || 0;
    const spool = parseInt(formRef.current.spool) || 0;
    const net = calcNet(pSum, parseFloat(pPkg) || 0, kgSum, kgPkg, spool);
    patch({ weightKgPackage: v, weightPPackage: pPkg, ...net });
  }

  function onSpoolChange(v: string) {
    const spool = parseInt(v) || 0;
    const pSum  = parseFloat(formRef.current.weightPSum)      || 0;
    const kgSum = parseFloat(formRef.current.weightKgSum)     || 0;
    const pPkg  = parseFloat(formRef.current.weightPPackage)  || 0;
    const kgPkg = parseFloat(formRef.current.weightKgPackage) || 0;
    const net = calcNet(pSum, pPkg, kgSum, kgPkg, spool);
    patch({ spool: v, ...net });
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.yarnType.trim()) e.yarnType = "ระบุชนิดด้าย";
    const sp = parseInt(form.spool);
    if (!form.spool || isNaN(sp) || sp < 1) e.spool = "ต้องมากกว่า 0";
    const w = parseFloat(form.weightWithdrawn);
    if (!form.weightWithdrawn || isNaN(w) || w <= 0) e.weightWithdrawn = "ต้องมากกว่า 0";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Add to pending ──────────────────────────────────────────────────────────

  function handleAddPending() {
    if (!validate()) return;
    setPendingItems((prev) => [...prev, {
      key:             nextKey(),
      supplierName:    form.supplierName,
      yarnType:        form.yarnType,
      lot:             form.lot,
      spool:           parseInt(form.spool),
      weightPSum:      parseFloat(form.weightPSum)      || 0,
      weightKgSum:     parseFloat(form.weightKgSum)     || 0,
      weightPPackage:  parseFloat(form.weightPPackage)  || 0,
      weightKgPackage: parseFloat(form.weightKgPackage) || 0,
      weightWithdrawn: parseFloat(form.weightWithdrawn),
      averageP:        parseFloat(form.averageP)  || 0,
      averageKg:       parseFloat(form.averageKg) || 0,
      note:            form.note,
      withdrawDate:    form.withdrawDate,
    }]);
    setForm((prev) => ({
      ...makeEmpty(prev.withdrawDate),
    }));
    setErrors({});
    setSupOptions([]); setYarnOptions([]); setLotOptions([]);
  }

  // ── Save all pending ────────────────────────────────────────────────────────

  async function handleSaveAll() {
    if (pendingItems.length === 0) return;
    setSaving(true);
    let successCount = 0;
    const failedKeys: number[] = [];

    for (const item of pendingItems) {
      try {
        const res = await fetch("/api/warehouse/material/outside", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            yarnType:        item.yarnType,
            supplierName:    item.supplierName    || undefined,
            lot:             item.lot             || undefined,
            spool:           item.spool,
            weightWithdrawn: item.weightWithdrawn,
            weightPSum:      item.weightPSum      || undefined,
            weightKgSum:     item.weightKgSum     || undefined,
            weightPPackage:  item.weightPPackage  || undefined,
            weightKgPackage: item.weightKgPackage || undefined,
            averageP:        item.averageP        || undefined,
            averageKg:       item.averageKg       || undefined,
            note:            item.note            || undefined,
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
        <h1 className="text-lg font-semibold text-gray-900">เบิกวัตถุดิบออกภายนอก</h1>
        <p className="text-xs text-gray-500">บันทึกการเบิกเส้นด้ายออกใช้งานภายนอก</p>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm p-5">

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
              onChange={(e) => onSpoolChange(e.target.value)}
              placeholder="จำนวน"
              className={`${inp} ${errors.spool ? errB : ""}`} />
          </Field>

          <Field label="วันที่">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input type="date" value={form.withdrawDate}
                onChange={(e) => patch({ withdrawDate: e.target.value })}
                title="วันที่เบิก"
                className={`${inp} pl-9 [&::-webkit-calendar-picker-indicator]:hidden`} />
            </div>
          </Field>
        </div>

        {/* ── น้ำหนักรวม ────────────────────────────────────────────── */}
        <SectionLabel>น้ำหนักรวม (ปอนด์ ↔ กก. อัตโนมัติ)</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">น้ำหนักรวม (lbs)</label>
            <input type="number" min="0.001" step="0.001" value={form.weightPSum}
              onChange={(e) => onWeightPSum(e.target.value)}
              placeholder="ปอนด์"
              className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">น้ำหนักรวม (kg)</label>
            <input type="number" min="0.001" step="0.001" value={form.weightKgSum}
              onChange={(e) => onWeightKgSum(e.target.value)}
              placeholder="กิโลกรัม"
              className={inp} />
          </div>
        </div>

        {/* ── น้ำหนักบรรจุภัณฑ์ ─────────────────────────────────────── */}
        <SectionLabel>น้ำหนักบรรจุภัณฑ์ (ปอนด์ ↔ กก. อัตโนมัติ)</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">บรรจุภัณฑ์ (lbs)</label>
            <input type="number" min="0" step="0.001" value={form.weightPPackage}
              onChange={(e) => onWeightPPackage(e.target.value)}
              placeholder="ปอนด์"
              className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">บรรจุภัณฑ์ (kg)</label>
            <input type="number" min="0" step="0.001" value={form.weightKgPackage}
              onChange={(e) => onWeightKgPackage(e.target.value)}
              placeholder="กิโลกรัม"
              className={inp} />
          </div>
        </div>

        {/* ── น้ำหนักสุทธิ (คำนวณอัตโนมัติ) ───────────────────────── */}
        <SectionLabel>น้ำหนักสุทธิ = รวม − บรรจุภัณฑ์ (คำนวณอัตโนมัติ)</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">สุทธิ (lbs)</label>
            <input type="number" min="0.001" step="0.001" value={form.weightWithdrawnP}
              onChange={(e) => {
                const p = parseFloat(e.target.value) || 0;
                patch({ weightWithdrawnP: e.target.value, weightWithdrawn: p > 0 ? fmt3(p / LBS_PER_KG) : "" });
              }}
              placeholder="ปอนด์"
              className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">สุทธิ (kg) *</label>
            <input type="number" min="0.001" step="0.001" value={form.weightWithdrawn}
              onChange={(e) => {
                const k = parseFloat(e.target.value) || 0;
                patch({ weightWithdrawn: e.target.value, weightWithdrawnP: k > 0 ? fmt3(k * LBS_PER_KG) : "" });
              }}
              placeholder="กิโลกรัม"
              className={`${inp} ${errors.weightWithdrawn ? errB : ""}`} />
          </div>
        </div>
        {errors.weightWithdrawn && <p className="text-xs text-red-500 mt-1">{errors.weightWithdrawn}</p>}

        {/* ── น้ำหนักเฉลี่ย ──────────────────────────────────────────── */}
        <SectionLabel>น้ำหนักเฉลี่ย / ลูก (คำนวณอัตโนมัติ)</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">เฉลี่ย (lbs/ลูก)</label>
            <input type="number" step="0.001" value={form.averageP} readOnly
              placeholder="-"
              className={`${inp} bg-gray-50 text-gray-500`} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">เฉลี่ย (kg/ลูก)</label>
            <input type="number" step="0.001" value={form.averageKg} readOnly
              placeholder="-"
              className={`${inp} bg-gray-50 text-gray-500`} />
          </div>
        </div>

        {/* ── หมายเหตุ + ส่วนควบคุม ──────────────────────────────────── */}
        <SectionLabel>อื่นๆ</SectionLabel>
        <Field label="หมายเหตุ">
          <input value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="หมายเหตุ (ถ้ามี)"
            className={inp} />
        </Field>

        <SectionLabel>ส่วนควบคุม</SectionLabel>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleAddPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium transition-colors">
            + เพิ่มรายการใหม่
          </button>
          <button type="button"
            onClick={() => { setForm(makeEmpty(initDate)); setErrors({}); setSupOptions([]); setYarnOptions([]); setLotOptions([]); }}
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
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">ชนิดด้าย</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">บริษัท</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Lot</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium">ลูก</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium whitespace-nowrap">สุทธิ (kg)</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">วันที่</th>
                    <th className="px-3 py-2.5 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingItems.map((item, i) => (
                    <tr key={item.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2 text-center text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 text-gray-800 max-w-[120px] truncate" title={item.yarnType}>{item.yarnType}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[140px] truncate" title={item.supplierName}>{item.supplierName || "-"}</td>
                      <td className="px-3 py-2 text-gray-500">{item.lot || "-"}</td>
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
