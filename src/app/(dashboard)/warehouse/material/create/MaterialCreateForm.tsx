"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AutocompleteInput from "@/components/AutocompleteInput";
import ThaiDatePicker from "@/components/ThaiDatePicker";
import ConfirmSubmitModal, { ConfirmRow } from "@/components/ConfirmSubmitModal";

// ─── Constants ─────────────────────────────────────────────────────────────────

const LBS_PER_KG = 2.2046;
const fmt = (n: number, d = 4) => (n > 0 ? n.toFixed(d) : "");

const PALLET_TYPE_LABEL: Record<string, string> = { wood: "ไม้", steel: "เหล็ก" };
const SACK_TYPE_LABEL: Record<string, string> = { p: "ปอ", plastic: "พลาสติก" };
const SPOOL_TYPE_LABEL: Record<string, string> = {
  spool_plastic: "หลอดกรวย พลาสติก",
  spool_paper: "หลอดกรวย กระดาษ",
  spoolC_plastic: "หลอดทรงกระบอก พลาสติก",
  spoolC_paper: "หลอดทรงกระบอก กระดาษ",
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear() + 543}`;
  } catch { return iso; }
}

// ─── State ─────────────────────────────────────────────────────────────────────

interface FormState {
  // ── header
  supplierName: string;
  importStatus: string;
  createDate: string;
  emp: string;
  yarnType: string;
  lot: string;
  // ── packaging counts (sent to API)
  pallet: string;
  box: string;
  sack: string;
  paperBar: string;
  // ── packaging type tags (sent to API)
  palletType: string;
  sackType: string;
  spoolType: string;
  // ── quantities
  spool: string;
  yarnSum: string;
  // ── weights (lbs + kg pairs)
  weightPSum: string;
  weightKgSum: string;
  weightPPackage: string;
  weightKgPackage: string;
  weightPNet: string;   // calculated (editable — see weightPNetTouched)
  weightKgNet: string;  // calculated (editable — see weightKgNetTouched)
  averageP: string;     // calculated (editable — see averagePTouched)
  averageKg: string;    // calculated (editable — see averageKgTouched)
  weightPNetTouched: boolean;  // true once user edits weightPNet directly
  weightKgNetTouched: boolean; // true once user edits weightKgNet directly
  averagePTouched: boolean;    // true once user edits averageP directly
  averageKgTouched: boolean;   // true once user edits averageKg directly
  // ── return packaging (sent to API)
  returnPallet: boolean;
  returnBox: boolean;
  returnSack: boolean;
  returnSpool: boolean;
  returnPaperBar: boolean;
  // ── misc
  note: string;
}

// น้ำหนักสุทธิ (weightPNet/weightKgNet) และน้ำหนักเฉลี่ยต่อลูก (averageP/averageKg)
// auto-fill จาก รวม−บรรจุภัณฑ์ และ สุทธิ÷จำนวนลูก ตามลำดับ — จนกว่าผู้ใช้จะแก้เอง
// เหมือน pattern "จำนวนหลอด" ใน MaterialOutsideForm แต่ต่างจากคู่อื่น (Sum/Package)
// ตรงที่ lb กับ kg ไม่ auto-convert หากันอีกต่อไป — แต่ละหน่วยมี touched flag
// อิสระของตัวเอง (weightPNetTouched/weightKgNetTouched/averagePTouched/averageKgTouched)
// แก้หน่วยไหนก็หยุด auto-calc เฉพาะหน่วยนั้น ไม่กระทบอีกหน่วย
function recalc(s: FormState, p: Partial<FormState>): FormState {
  const n = { ...s, ...p };

  if (!n.weightPNetTouched) {
    const pSum = parseFloat(n.weightPSum) || 0;
    const pPkg = parseFloat(n.weightPPackage) || 0;
    n.weightPNet = fmt(pSum - pPkg);
  }
  if (!n.weightKgNetTouched) {
    const kgSum = parseFloat(n.weightKgSum) || 0;
    const kgPkg = parseFloat(n.weightKgPackage) || 0;
    n.weightKgNet = fmt(kgSum - kgPkg);
  }

  const sp = parseInt(n.spool) || 0;
  if (!n.averagePTouched) {
    const pNet = parseFloat(n.weightPNet) || 0;
    n.averageP = sp > 0 && pNet > 0 ? fmt(pNet / sp) : "";
  }
  if (!n.averageKgTouched) {
    const kgNet = parseFloat(n.weightKgNet) || 0;
    n.averageKg = sp > 0 && kgNet > 0 ? fmt(kgNet / sp) : "";
  }

  return n;
}

function makeEmpty(today: string, emp: string): FormState {
  return {
    supplierName: "", importStatus: "", createDate: today, emp,
    yarnType: "", lot: "",
    pallet: "", box: "", sack: "",
    palletType: "wood", sackType: "plastic",
    spoolType: "spool_plastic", paperBar: "",
    spool: "", yarnSum: "",
    weightPSum: "", weightKgSum: "",
    weightPPackage: "", weightKgPackage: "",
    weightPNet: "", weightKgNet: "",
    averageP: "", averageKg: "",
    weightPNetTouched: false, weightKgNetTouched: false,
    averagePTouched: false, averageKgTouched: false,
    returnPallet: false, returnBox: false, returnSack: false,
    returnSpool: false, returnPaperBar: false,
    note: "",
  };
}

// ─── Small helpers ──────────────────────────────────────────────────────────────

function SectionLabel({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "amber" }) {
  return (
    <div className="flex items-center gap-2 pt-6 pb-3">
      <span className={`w-1 h-4 rounded-full ${color === "amber" ? "bg-amber-400" : "bg-blue-500"}`} />
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{children}</span>
    </div>
  );
}

function Field({
  label, required, error, children,
}: {
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

const inp  = "w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const sel  = "border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
const errB = "border-red-400";

// ─── Component ─────────────────────────────────────────────────────────────────

// field id → DOM id mapping for scroll-to-error
const FIELD_IDS: Partial<Record<string, string>> = {
  supplierName:     "f-supplierName",
  yarnType:         "f-yarnType",
  spool:            "f-spool",
  yarnSum:          "f-yarnSum",
  weightKgSum:      "f-weightKgSum",
  weightKgPackage:  "f-weightKgPackage",
  weightKgNet:      "f-weightKgNet",
};

interface Props { emp: string }

export default function MaterialCreateForm({ emp }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState>(() => makeEmpty(today, emp));
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [supOptions, setSupOptions] = useState<string[]>([]);
  const [yarnOptions, setYarnOptions] = useState<string[]>([]);
  const [lotOptions, setLotOptions] = useState<string[]>([]);
  const supTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yarnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(form);

  useEffect(() => { stateRef.current = form; }, [form]);

  function patch(changes: Partial<FormState>) {
    setForm((prev) => recalc(prev, changes));
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

  function scheduleLotFetch(yarnType: string, supplierName: string, q = "") {
    if (lotTimer.current) clearTimeout(lotTimer.current);
    if (!yarnType.trim()) { setLotOptions([]); return; }
    lotTimer.current = setTimeout(() => fetchLots(yarnType, supplierName, q), 300);
  }

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
    scheduleLotFetch(stateRef.current.yarnType, v, stateRef.current.lot);
  }

  function onYarnTypeChange(v: string) {
    patch({ yarnType: v });
    if (yarnTimer.current) clearTimeout(yarnTimer.current);
    yarnTimer.current = setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        if (v.trim()) p.set("q", v);
        const supplier = stateRef.current.supplierName.trim();
        if (supplier) p.set("supplierName", supplier);
        const res = await fetch(`/api/warehouse/material/yarn-types?${p}`);
        const data = await res.json();
        setYarnOptions(data.data ?? []);
      } catch { setYarnOptions([]); }
    }, 300);
    scheduleLotFetch(v, stateRef.current.supplierName, stateRef.current.lot);
  }

  function onLotChange(v: string) {
    patch({ lot: v });
    scheduleLotFetch(stateRef.current.yarnType, stateRef.current.supplierName, v);
  }

  // ── weight converters ───────────────────────────────────────────────────────
  function onPSum(v: string) {
    const p = parseFloat(v) || 0;
    patch({ weightPSum: v, weightKgSum: p > 0 ? fmt(p / LBS_PER_KG) : "" });
  }
  function onKgSum(v: string) {
    const k = parseFloat(v) || 0;
    patch({ weightKgSum: v, weightPSum: k > 0 ? fmt(k * LBS_PER_KG) : "" });
  }
  function onPPkg(v: string) {
    const p = parseFloat(v) || 0;
    patch({ weightPPackage: v, weightKgPackage: p > 0 ? fmt(p / LBS_PER_KG) : "" });
  }
  function onKgPkg(v: string) {
    const k = parseFloat(v) || 0;
    patch({ weightKgPackage: v, weightPPackage: k > 0 ? fmt(k * LBS_PER_KG) : "" });
  }

  // น้ำหนักสุทธิ: แก้เองได้ — พอแก้แล้วหยุด auto-calc จาก รวม−บรรจุภัณฑ์ เฉพาะหน่วยที่แก้
  // (weightPNetTouched/weightKgNetTouched แยกกัน ไม่ auto-convert หากันอีกต่อไป)
  function onPNet(v: string) {
    patch({ weightPNet: v, weightPNetTouched: true });
  }
  function onKgNet(v: string) {
    patch({ weightKgNet: v, weightKgNetTouched: true });
  }

  // น้ำหนักเฉลี่ยต่อลูก: แก้เองได้ — พอแก้แล้วหยุด auto-calc จาก สุทธิ÷จำนวนลูก เฉพาะหน่วยที่แก้
  function onPAvg(v: string) {
    patch({ averageP: v, averagePTouched: true });
  }
  function onKgAvg(v: string) {
    patch({ averageKg: v, averageKgTouched: true });
  }

  // ── spool ↔ yarnSum sync ────────────────────────────────────────────────────
  function onSpool(v: string) { patch({ spool: v, yarnSum: v }); }
  function onYarnSum(v: string) { patch({ yarnSum: v, spool: v }); }

  // ── validation ──────────────────────────────────────────────────────────────
  function validate() {
    const e: Record<string, string> = {};
    if (!form.supplierName.trim()) e.supplierName = "ระบุชื่อบริษัท";
    if (!form.yarnType.trim())     e.yarnType     = "ระบุชนิดด้าย";
    const sp = parseInt(form.spool);
    if (!form.spool || isNaN(sp) || sp < 1) e.spool = "ต้องมากกว่า 0";
    const yn = parseInt(form.yarnSum);
    if (!form.yarnSum || isNaN(yn) || yn < 1) e.yarnSum = "ต้องมากกว่า 0";
    if (!(parseFloat(form.weightKgSum) > 0))     e.weightKgSum     = "ระบุน้ำหนักรวม";
    if (!(parseFloat(form.weightKgPackage) > 0))  e.weightKgPackage = "ระบุน้ำหนักบรรจุภัณฑ์";
    if (!(parseFloat(form.weightKgNet) > 0))      e.weightKgNet     = "น้ำหนักสุทธิต้องมากกว่า 0";
    setErrors(e);
    // scroll to first error
    if (Object.keys(e).length > 0) {
      const firstKey = Object.keys(e)[0];
      const domId = FIELD_IDS[firstKey];
      if (domId) {
        setTimeout(() => {
          document.getElementById(domId)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      }
    }
    return Object.keys(e).length === 0;
  }

  // ── submit ──────────────────────────────────────────────────────────────────
  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4500);
  }

  function handleSave() {
    if (!validate()) return;
    setConfirmOpen(true);
  }

  function buildConfirmRows(): ConfirmRow[] {
    const returned = (
      [
        ["returnPallet", "พาเลท"], ["returnBox", "กล่อง"], ["returnSack", "กระสอบ"],
        ["returnSpool", "หลอด"], ["returnPaperBar", "กระดาษกั้น"],
      ] as [keyof FormState, string][]
    ).filter(([k]) => form[k]).map(([, label]) => label).join(", ");

    return [{
      key: "item",
      fields: [
        { label: "ชื่อบริษัท", value: form.supplierName },
        { label: "เลขที่ใบส่งสินค้า", value: form.importStatus },
        { label: "วันที่", value: fmtDate(form.createDate) },
        { label: "ชนิดด้าย", value: form.yarnType },
        { label: "ล็อตที่", value: form.lot },
        { label: "จำนวนหลอดทั้งหมด", value: form.spool ? `${form.spool} หลอด (${SPOOL_TYPE_LABEL[form.spoolType] ?? form.spoolType})` : "" },
        { label: "จำนวนด้ายทั้งหมด (ลูก)", value: form.yarnSum },
        { label: "น้ำหนักรวม (lb)", value: form.weightPSum },
        { label: "น้ำหนักรวม (kg)", value: form.weightKgSum },
        { label: "น้ำหนักบรรจุภัณฑ์ (lb)", value: form.weightPPackage },
        { label: "น้ำหนักบรรจุภัณฑ์ (kg)", value: form.weightKgPackage },
        { label: "น้ำหนักสุทธิ (lb)", value: form.weightPNet },
        { label: "น้ำหนักสุทธิ (kg)", value: form.weightKgNet },
        { label: "น้ำหนักเฉลี่ยต่อลูก (lb)", value: form.averageP },
        { label: "น้ำหนักเฉลี่ยต่อลูก (kg)", value: form.averageKg },
        { label: "พาเลท", value: form.pallet ? `${form.pallet} (${PALLET_TYPE_LABEL[form.palletType] ?? form.palletType})` : "" },
        { label: "กล่อง", value: form.box },
        { label: "กระสอบ", value: form.sack ? `${form.sack} (${SACK_TYPE_LABEL[form.sackType] ?? form.sackType})` : "" },
        { label: "กระดาษกั้น", value: form.paperBar },
        { label: "ส่งคืนบรรจุภัณฑ์", value: returned },
        { label: "หมายเหตุ", value: form.note },
      ],
    }];
  }

  async function submitReal() {
    setSaving(true);
    try {
      const item = {
        supplierName:   form.supplierName.trim(),
        importStatus:   form.importStatus.trim() || undefined,
        importDate:     form.createDate,
        yarnType:       form.yarnType.trim(),
        lot:            form.lot.trim() || "-",
        spool:          parseInt(form.spool),
        weightKgNet:    parseFloat(form.weightKgNet),
        weightKgSum:    parseFloat(form.weightKgSum),
        weightKgPackage: parseFloat(form.weightKgPackage),
        weightPNet:     parseFloat(form.weightPNet)     || undefined,
        weightPSum:     parseFloat(form.weightPSum)     || undefined,
        weightPPackage: parseFloat(form.weightPPackage) || undefined,
        averageKg:      parseFloat(form.averageKg)      || undefined,
        averageP:       parseFloat(form.averageP)       || undefined,
        pallet:         parseInt(form.pallet)  || undefined,
        palletType:     form.palletType.trim() || undefined,
        box:            parseInt(form.box)     || undefined,
        sack:           parseInt(form.sack)    || undefined,
        sackType:       form.sackType.trim()   || undefined,
        paperBar:       parseInt(form.paperBar) || undefined,
        spoolType:      form.spoolType.trim()  || undefined,
        returnPallet:   form.returnPallet,
        returnBox:      form.returnBox,
        returnSack:     form.returnSack,
        returnSpool:    form.returnSpool,
        returnPaperBar: form.returnPaperBar,
        emp:            form.emp.trim()  || undefined,
        note:           form.note.trim() || undefined,
      };

      const res = await fetch("/api/warehouse/material/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [item] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      showToast("success", `บันทึกสำเร็จ (ID: ${data.ids?.[0]})`);
      setErrors({});
      setTimeout(() => router.push("/warehouse/material/history"), 1500);
    } catch (err: unknown) {
      showToast("error", "เกิดข้อผิดพลาด: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4" ref={formRef}>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">นำเข้าวัตถุดิบ</h1>
        <p className="text-sm text-gray-500">เพิ่มรายการวัตถุดิบ</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">

        {/* ── ข้อมูลการนำเข้า ─────────────────────────────────────── */}
        <SectionLabel>ข้อมูลการนำเข้า</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="ชื่อบริษัท" required error={errors.supplierName}>
            <AutocompleteInput
              id="f-supplierName"
              value={form.supplierName}
              onChange={onSupplierChange}
              onSelect={(v) => { patch({ supplierName: v }); setSupOptions([]); fetchLots(stateRef.current.yarnType, v, stateRef.current.lot); }}
              options={supOptions}
              placeholder="ชื่อบริษัท"
              inputClassName={`${inp} ${errors.supplierName ? errB : ""}`}
            />
          </Field>
          <Field label="เลขที่ใบส่งสินค้า">
            <input value={form.importStatus}
              onChange={(e) => patch({ importStatus: e.target.value })}
              placeholder="เลขที่ใบส่งสินค้า"
              className={inp} />
          </Field>
          <Field label="วันที่">
            <ThaiDatePicker
              value={form.createDate}
              onChange={(v) => patch({ createDate: v })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <Field label="ชนิดด้าย" required error={errors.yarnType}>
            <AutocompleteInput
              id="f-yarnType"
              value={form.yarnType}
              onChange={onYarnTypeChange}
              onSelect={(v) => { patch({ yarnType: v }); setYarnOptions([]); fetchLots(v, stateRef.current.supplierName, stateRef.current.lot); }}
              options={yarnOptions}
              placeholder="เช่น CP 30/1, R 30"
              inputClassName={`${inp} ${errors.yarnType ? errB : ""}`}
            />
          </Field>
          <Field label="ล็อตที่">
            <AutocompleteInput
              value={form.lot}
              onChange={onLotChange}
              onSelect={(v) => { patch({ lot: v }); setLotOptions([]); }}
              options={lotOptions}
              placeholder="ล็อตที่ (พิมพ์หรือเลือกจากรายการ)"
              inputClassName={inp}
            />
          </Field>
        </div>

        {/* ── บรรจุภัณฑ์ ──────────────────────────────────────────── */}
        <SectionLabel>บรรจุภัณฑ์</SectionLabel>

        {/* 1. พาเลท + กระดาษกั้น */}
        <div className="flex items-end gap-2 mb-3">
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-700 mb-1">พาเลท</label>
            <input type="number" min="0" value={form.pallet}
              onChange={(e) => patch({ pallet: e.target.value })}
              placeholder="จำนวน" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ประเภท</label>
            <select value={form.palletType}
              onChange={(e) => patch({ palletType: e.target.value })}
              className={sel}>
              <option value="wood">ไม้</option>
              <option value="steel">เหล็ก</option>
            </select>
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-700 mb-1">กระดาษกั้น</label>
            <input type="number" min="0" value={form.paperBar}
              onChange={(e) => patch({ paperBar: e.target.value })}
              placeholder="จำนวน" className={inp} />
          </div>
        </div>

        {/* 2. กล่อง */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">กล่อง</label>
          <input type="number" min="0" value={form.box}
            onChange={(e) => patch({ box: e.target.value })}
            placeholder="จำนวน" className={`${inp} w-28`} />
        </div>

        {/* 3. กระสอบ */}
        <div className="flex items-end gap-2 mb-3">
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-700 mb-1">กระสอบ</label>
            <input type="number" min="0" value={form.sack}
              onChange={(e) => patch({ sack: e.target.value })}
              placeholder="จำนวน" className={inp} />
          </div>
          <div className="w-28">
            <label className="block text-xs font-medium text-gray-700 mb-1">ประเภท</label>
            <select value={form.sackType}
              onChange={(e) => patch({ sackType: e.target.value })}
              className={sel}>
              <option value="p">ปอ</option>
              <option value="plastic">พลาสติก</option>
            </select>
          </div>
        </div>

        {/* ── จำนวน ───────────────────────────────────────────────── */}
        <SectionLabel>จำนวน</SectionLabel>

        {/* 5. จำนวนหลอดทั้งหมด */}
        <div className="flex items-end gap-2 mb-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              จำนวนหลอดทั้งหมด (หลอด)
            </label>
            <input id="f-spool" type="number" min="1" value={form.spool}
              onChange={(e) => onSpool(e.target.value)}
              placeholder="จำนวนหลอด"
              className={`${inp} ${errors.spool ? errB : ""}`} />
            {errors.spool && <p className="text-xs text-red-500 mt-0.5">{errors.spool}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ประเภทหลอด</label>
            <select value={form.spoolType}
              onChange={(e) => patch({ spoolType: e.target.value })}
              className={sel}>
              <option value="spool_plastic">หลอดกรวย พลาสติก</option>
              <option value="spool_paper">หลอดกรวย กระดาษ</option>
              <option value="spoolC_plastic">หลอดทรงกระบอก พลาสติก</option>
              <option value="spoolC_paper">หลอดทรงกระบอก กระดาษ</option>
            </select>
          </div>
        </div>

        {/* 6. จำนวนด้ายทั้งหมด (ลูก) */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            จำนวนด้ายทั้งหมด (ลูก)<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input id="f-yarnSum" type="number" min="1" value={form.yarnSum}
            onChange={(e) => onYarnSum(e.target.value)}
            placeholder="จำนวนด้าย"
            className={`${inp} w-40 ${errors.yarnSum ? errB : ""}`} />
          {errors.yarnSum && <p className="text-xs text-red-500 mt-0.5">{errors.yarnSum}</p>}
        </div>

        {/* ── น้ำหนัก ─────────────────────────────────────────────── */}
        <SectionLabel>น้ำหนัก</SectionLabel>

        {/* 7. น้ำหนักรวมทั้งหมด */}
        <div className="mb-1">
          <p className="text-xs font-medium text-gray-600 mb-2">น้ำหนักรวมทั้งหมด</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="ปอนด์">
              <input type="number" step="0.0001" value={form.weightPSum}
                onChange={(e) => onPSum(e.target.value)}
                placeholder="ปอนด์" className={inp} />
            </Field>
            <Field label="กิโลกรัม" required error={errors.weightKgSum}>
              <input id="f-weightKgSum" type="number" step="0.0001" value={form.weightKgSum}
                onChange={(e) => onKgSum(e.target.value)}
                placeholder="กิโลกรัม"
                className={`${inp} ${errors.weightKgSum ? errB : ""}`} />
            </Field>
          </div>
        </div>

        {/* 8. น้ำหนักบรรจุภัณฑ์ */}
        <div className="mb-1 mt-4">
          <p className="text-xs font-medium text-gray-600 mb-2">น้ำหนักบรรจุภัณฑ์</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="ปอนด์">
              <input type="number" step="0.0001" value={form.weightPPackage}
                onChange={(e) => onPPkg(e.target.value)}
                placeholder="ปอนด์" className={inp} />
            </Field>
            <Field label="กิโลกรัม" required error={errors.weightKgPackage}>
              <input id="f-weightKgPackage" type="number" step="0.0001" value={form.weightKgPackage}
                onChange={(e) => onKgPkg(e.target.value)}
                placeholder="กิโลกรัม"
                className={`${inp} ${errors.weightKgPackage ? errB : ""}`} />
            </Field>
          </div>
        </div>

        {/* 9. น้ำหนักสุทธิ (auto-calculated, editable) */}
        <div className="mb-1 mt-4">
          <p className="text-xs font-medium text-gray-600 mb-2">
            น้ำหนักสุทธิ
            <span className="text-gray-400 font-normal ml-1">(คำนวณอัตโนมัติ: รวม − บรรจุภัณฑ์ — แก้ไขเองได้)</span>
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="ปอนด์">
              <input type="number" step="0.0001" value={form.weightPNet}
                onChange={(e) => onPNet(e.target.value)}
                placeholder="ปอนด์" className={inp} />
            </Field>
            <Field label="กิโลกรัม" error={errors.weightKgNet}>
              <input id="f-weightKgNet" type="number" step="0.0001" value={form.weightKgNet}
                onChange={(e) => onKgNet(e.target.value)}
                placeholder="กิโลกรัม"
                className={`${inp} ${errors.weightKgNet ? errB : ""}`} />
            </Field>
          </div>
        </div>

        {/* 10. น้ำหนักเฉลี่ยต่อลูก (auto-calculated, editable) */}
        <div className="mb-1 mt-4 py-2">
          <p className="text-xs font-medium text-gray-600 mb-2">
            น้ำหนักเฉลี่ยต่อลูก
            <span className="text-gray-400 font-normal ml-1">(คำนวณอัตโนมัติ: สุทธิ ÷ จำนวนลูก — แก้ไขเองได้)</span>
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="ปอนด์">
              <input type="number" step="0.0001" value={form.averageP}
                onChange={(e) => onPAvg(e.target.value)}
                placeholder="ปอนด์" className={inp} />
            </Field>
            <Field label="กิโลกรัม">
              <input type="number" step="0.0001" value={form.averageKg}
                onChange={(e) => onKgAvg(e.target.value)}
                placeholder="กิโลกรัม" className={inp} />
            </Field>
          </div>
        </div>

        {/* 11. ส่งคืนบรรจุภัณฑ์ */}
        <SectionLabel color="amber">ส่งคืนบรรจุภัณฑ์</SectionLabel>
        <div className="flex flex-wrap gap-5 py-2">
          {(
            [
              { key: "returnPallet",   label: "พาเลท" },
              { key: "returnBox",      label: "กล่อง" },
              { key: "returnSack",     label: "กระสอบ" },
              { key: "returnSpool",    label: "หลอด" },
              { key: "returnPaperBar", label: "กระดาษกั้น" },
            ] as { key: keyof FormState; label: string }[]
          ).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form[key] as boolean}
                onChange={(e) => patch({ [key]: e.target.checked })}
                className="w-4 h-4 accent-amber-400 cursor-pointer"
              />
              {label}
            </label>
          ))}
        </div>

        {/* หมายเหตุ */}
        <SectionLabel>หมายเหตุ</SectionLabel>
        <textarea value={form.note}
          onChange={(e) => patch({ note: e.target.value })}
          rows={2}
          placeholder="หมายเหตุ (ถ้ามี)"
          className="w-full border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />

        {/* ── Buttons ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pt-5 mt-5">
          <button type="button"
            onClick={() => { setForm(makeEmpty(today, emp)); setErrors({}); setSupOptions([]); setYarnOptions([]); setLotOptions([]); }}
            className="px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50 text-gray-600 transition-colors">
            เคลียร์ข้อมูล
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-6 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>

      <ConfirmSubmitModal
        open={confirmOpen}
        title="ยืนยันการนำเข้าวัตถุดิบ"
        rows={buildConfirmRows()}
        submitting={saving}
        onConfirm={submitReal}
        onCancel={() => setConfirmOpen(false)}
        tone="blue"
      />
    </div>
  );
}
