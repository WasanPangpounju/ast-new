"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AutocompleteInput from "@/components/AutocompleteInput";
import ConfirmSubmitModal, { ConfirmRow } from "@/components/ConfirmSubmitModal";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  supplierName:    string;
  yarnType:        string;
  lot:             string;
  spool:           string;
  weightPSum:      string;
  weightKgSum:     string;
  weightPPackage:  string;
  weightKgPackage: string;
  weightWithdrawnP: string;
  weightWithdrawn:  string;
  averageP:        string;
  averageKg:       string;
  note:            string;
  withdrawDate:    string;
  pallet:          string;
  box:             string;
  sack:            string;
  paperBar:        string;
  returnPallet:    boolean;
  returnBox:       boolean;
  returnSack:      boolean;
  returnSpool:     boolean;
  returnPaperBar:  boolean;
  recipient:       string;
  usageNote:       string;
  paymentComment:  string;
}

interface PendingItem {
  key:             number;
  supplierName:    string;
  yarnType:        string;
  lot:             string;
  spool:           number;
  weightPSum:      number;
  weightKgSum:     number;
  weightPPackage:  number;
  weightKgPackage: number;
  weightWithdrawn: number;
  averageP:        number;
  averageKg:       number;
  note:            string;
  withdrawDate:    string;
  pallet:          number;
  box:             number;
  sack:            number;
  paperBar:        number;
  returnPallet:    boolean;
  returnBox:       boolean;
  returnSack:      boolean;
  returnSpool:     boolean;
  returnPaperBar:  boolean;
  recipient:       string;
  usageNote:       string;
  paymentComment:  string;
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
  return !!(
    f.yarnType.trim() || f.lot.trim() || f.supplierName.trim() ||
    f.spool.trim() || f.weightWithdrawn.trim() ||
    f.weightPSum.trim() || f.weightKgSum.trim() ||
    f.weightPPackage.trim() || f.weightKgPackage.trim() ||
    f.note.trim() ||
    f.pallet.trim() || f.box.trim() || f.sack.trim() || f.paperBar.trim() ||
    f.returnPallet || f.returnBox || f.returnSack || f.returnSpool || f.returnPaperBar ||
    f.recipient.trim() || f.usageNote.trim() || f.paymentComment.trim()
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "amber" }) {
  return (
    <div className={`flex items-center gap-2 pt-6 pb-3`}>
      <span className={`w-1 h-4 rounded-full ${color === "amber" ? "bg-amber-400" : "bg-blue-500"}`} />
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
const ro  = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500";
const errB = "border-red-400 focus:ring-red-400";

// ─── Main Component ─────────────────────────────────────────────────────────────

function makeEmpty(t: string): FormState {
  return {
    supplierName: "", yarnType: "", lot: "", spool: "",
    weightPSum: "", weightKgSum: "",
    weightPPackage: "", weightKgPackage: "",
    weightWithdrawnP: "", weightWithdrawn: "",
    averageP: "", averageKg: "",
    note: "", withdrawDate: t,
    pallet: "", box: "", sack: "", paperBar: "",
    returnPallet: false, returnBox: false, returnSack: false,
    returnSpool: false, returnPaperBar: false,
    recipient: "", usageNote: "", paymentComment: "",
  };
}

export default function MaterialOutsideForm() {
  const initDate = todayStr();
  const router = useRouter();
  const [form, setForm]       = useState<FormState>(() => makeEmpty(initDate));
  const [errors, setErrors]   = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving]   = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{ items: PendingItem[]; currentKey: number | null } | null>(null);
  const [toast, setToast]     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [supOptions, setSupOptions]   = useState<string[]>([]);
  const [yarnOptions, setYarnOptions] = useState<string[]>([]);
  const [lotOptions, setLotOptions]   = useState<string[]>([]);
  const [recipientOptions, setRecipientOptions] = useState<string[]>([]);
  const supTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yarnTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lotTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recipientTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  function onRecipientChange(v: string) {
    patch({ recipient: v });
    if (recipientTimer.current) clearTimeout(recipientTimer.current);
    recipientTimer.current = setTimeout(async () => {
      if (!v.trim()) { setRecipientOptions([]); return; }
      try {
        const res = await fetch(`/api/warehouse/material/outside/recipients?q=${encodeURIComponent(v)}`);
        const data = await res.json();
        setRecipientOptions(data.data ?? []);
      } catch { setRecipientOptions([]); }
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
    if (!form.supplierName.trim()) e.supplierName = "ระบุบริษัท";
    if (!form.yarnType.trim()) e.yarnType = "ระบุชนิดด้าย";
    const sp = parseInt(form.spool);
    if (!form.spool || isNaN(sp) || sp < 1) e.spool = "ต้องมากกว่า 0";
    const w = parseFloat(form.weightWithdrawn);
    if (!form.weightWithdrawn || isNaN(w) || w <= 0) e.weightWithdrawn = "ต้องมากกว่า 0";
    if (!form.recipient.trim()) e.recipient = "ระบุผู้รับวัตถุดิบ";
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
      pallet:          parseInt(form.pallet)   || 0,
      box:             parseInt(form.box)      || 0,
      sack:            parseInt(form.sack)     || 0,
      paperBar:        parseInt(form.paperBar) || 0,
      returnPallet:    form.returnPallet,
      returnBox:       form.returnBox,
      returnSack:      form.returnSack,
      returnSpool:     form.returnSpool,
      returnPaperBar:  form.returnPaperBar,
      recipient:       form.recipient,
      usageNote:       form.usageNote,
      paymentComment:  form.paymentComment,
    }]);
    setForm((prev) => ({
      ...makeEmpty(prev.withdrawDate),
    }));
    setErrors({});
    setSupOptions([]); setYarnOptions([]); setLotOptions([]); setRecipientOptions([]);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  // "บันทึก" is always visible/clickable (not gated on pendingItems). It saves
  // pendingItems PLUS whatever's currently typed in the form (if any) — the
  // current form is always validated first so nothing typed gets silently
  // dropped. "+ เพิ่มรายการใหม่" still works the same as before for batching.

  function handleSave() {
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

    const toSubmit: PendingItem[] = [...pendingItems];
    let currentKey: number | null = null;
    if (touched) {
      currentKey = nextKey();
      toSubmit.push({
        key:             currentKey,
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
        pallet:          parseInt(form.pallet)   || 0,
        box:             parseInt(form.box)      || 0,
        sack:            parseInt(form.sack)     || 0,
        paperBar:        parseInt(form.paperBar) || 0,
        returnPallet:    form.returnPallet,
        returnBox:       form.returnBox,
        returnSack:      form.returnSack,
        returnSpool:     form.returnSpool,
        returnPaperBar:  form.returnPaperBar,
        recipient:       form.recipient,
        usageNote:       form.usageNote,
        paymentComment:  form.paymentComment,
      });
    }

    setPendingSubmit({ items: toSubmit, currentKey });
    setConfirmOpen(true);
  }

  function buildConfirmRows(): ConfirmRow[] {
    if (!pendingSubmit) return [];
    return pendingSubmit.items.map((item) => {
      const returned = (
        [
          [item.returnPallet, "พาเลท"], [item.returnBox, "กล่อง"], [item.returnSack, "กระสอบ"],
          [item.returnSpool, "หลอด"], [item.returnPaperBar, "กระดาษกั้น"],
        ] as [boolean, string][]
      ).filter(([on]) => on).map(([, label]) => label).join(", ");

      return {
        key: item.key,
        fields: [
          { label: "ผู้รับวัตถุดิบ", value: item.recipient },
          { label: "วันที่", value: fmtDate(item.withdrawDate) },
          { label: "บริษัท", value: item.supplierName },
          { label: "ชนิดด้าย", value: item.yarnType },
          { label: "Lot", value: item.lot },
          { label: "จำนวน (ลูก)", value: item.spool ? item.spool.toLocaleString() : "" },
          { label: "น้ำหนักสุทธิ (kg)", value: item.weightWithdrawn ? item.weightWithdrawn.toFixed(3) : "" },
          { label: "น้ำหนักเฉลี่ย/ลูก (kg)", value: item.averageKg ? item.averageKg.toFixed(3) : "" },
          { label: "พาเลท/กล่อง/กระสอบ/กระดาษกั้น", value: [item.pallet, item.box, item.sack, item.paperBar].some((v) => v > 0) ? `${item.pallet || 0}/${item.box || 0}/${item.sack || 0}/${item.paperBar || 0}` : "" },
          { label: "ส่งคืนบรรจุภัณฑ์", value: returned },
          { label: "การนำไปใช้", value: item.usageNote },
          { label: "หมายเหตุการเงิน", value: item.paymentComment },
          { label: "หมายเหตุ", value: item.note },
        ],
      };
    });
  }

  async function submitReal() {
    if (!pendingSubmit) return;
    const { items: toSubmit, currentKey } = pendingSubmit;

    setSaving(true);
    let successCount = 0;
    const failedKeys: number[] = [];

    for (const item of toSubmit) {
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
            withdrawDate:    item.withdrawDate     || undefined,
            pallet:          item.pallet          || undefined,
            box:             item.box             || undefined,
            sack:            item.sack            || undefined,
            paperBar:        item.paperBar        || undefined,
            returnPallet:    item.returnPallet,
            returnBox:       item.returnBox,
            returnSack:      item.returnSack,
            returnSpool:     item.returnSpool,
            returnPaperBar:  item.returnPaperBar,
            recipient:       item.recipient       || undefined,
            usageNote:       item.usageNote       || undefined,
            paymentComment:  item.paymentComment  || undefined,
          }),
        });
        if (!res.ok) throw new Error();
        successCount++;
      } catch {
        failedKeys.push(item.key);
      }
    }

    setSaving(false);
    setConfirmOpen(false);
    setPendingSubmit(null);
    if (failedKeys.length === 0) {
      setPendingItems([]);
      setForm(makeEmpty(form.withdrawDate));
      setErrors({});
      setSupOptions([]); setYarnOptions([]); setLotOptions([]); setRecipientOptions([]);
      showToast("success", `บันทึกสำเร็จ ${successCount} รายการ`);
      setTimeout(() => router.push("/warehouse/material/outside-history"), 1200);
    } else {
      setPendingItems(toSubmit.filter((i) => failedKeys.includes(i.key) && i.key !== currentKey));
      if (currentKey !== null && !failedKeys.includes(currentKey)) {
        setForm(makeEmpty(form.withdrawDate));
        setErrors({});
        setSupOptions([]); setYarnOptions([]); setLotOptions([]); setRecipientOptions([]);
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
        <h1 className="text-3xl font-semibold text-gray-900">เบิกวัตถุดิบออกภายนอก</h1>
        <p className="text-sm text-gray-500">บันทึกการเบิกเส้นด้ายออกใช้งานภายนอก</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">

        {/* ── วัตถุดิบ ──────────────────────────────────────────────── */}
        <SectionLabel>วัตถุดิบ</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            />
          </Field>

          <Field label="จำนวน (ลูก)" required error={errors.spool}>
            <input type="number" min="1" value={form.spool}
              onChange={(e) => onSpoolChange(e.target.value)}
              placeholder="จำนวน"
              className={`${inp} ${errors.spool ? errB : ""}`} />
          </Field>

          <Field label="วันที่">
            <input type="date" value={form.withdrawDate}
              onChange={(e) => patch({ withdrawDate: e.target.value })}
              title="วันที่เบิก"
              className={inp} />
          </Field>
        </div>

        {/* ── น้ำหนัก ───────────────────────────────────────────────── */}
        <SectionLabel>น้ำหนัก</SectionLabel>
        <div className="bg-gray-50 rounded-xl p-4 space-y-4">
          {/* รวม */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">น้ำหนักรวม <span className="font-normal">(lbs ↔ kg อัตโนมัติ)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">lbs</label>
                <input type="number" min="0.001" step="0.001" value={form.weightPSum}
                  onChange={(e) => onWeightPSum(e.target.value)} placeholder="ปอนด์" className={inp} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">kg</label>
                <input type="number" min="0.001" step="0.001" value={form.weightKgSum}
                  onChange={(e) => onWeightKgSum(e.target.value)} placeholder="กิโลกรัม" className={inp} />
              </div>
            </div>
          </div>
          {/* บรรจุภัณฑ์ */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">น้ำหนักบรรจุภัณฑ์ <span className="font-normal">(lbs ↔ kg อัตโนมัติ)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">lbs</label>
                <input type="number" min="0" step="0.001" value={form.weightPPackage}
                  onChange={(e) => onWeightPPackage(e.target.value)} placeholder="ปอนด์" className={inp} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">kg</label>
                <input type="number" min="0" step="0.001" value={form.weightKgPackage}
                  onChange={(e) => onWeightKgPackage(e.target.value)} placeholder="กิโลกรัม" className={inp} />
              </div>
            </div>
          </div>
          {/* สุทธิ */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">น้ำหนักสุทธิ <span className="font-normal">(รวม − บรรจุภัณฑ์)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">lbs</label>
                <input type="number" min="0.001" step="0.001" value={form.weightWithdrawnP}
                  onChange={(e) => {
                    const p = parseFloat(e.target.value) || 0;
                    patch({ weightWithdrawnP: e.target.value, weightWithdrawn: p > 0 ? fmt3(p / LBS_PER_KG) : "" });
                  }}
                  placeholder="ปอนด์" className={`${inp} ${errors.weightWithdrawn ? errB : ""}`} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">kg <span className="text-red-500">*</span></label>
                <input type="number" min="0.001" step="0.001" value={form.weightWithdrawn}
                  onChange={(e) => {
                    const k = parseFloat(e.target.value) || 0;
                    patch({ weightWithdrawn: e.target.value, weightWithdrawnP: k > 0 ? fmt3(k * LBS_PER_KG) : "" });
                  }}
                  placeholder="กิโลกรัม" className={`${inp} ${errors.weightWithdrawn ? errB : ""}`} />
              </div>
            </div>
            {errors.weightWithdrawn && <p className="text-xs text-red-500 mt-1">{errors.weightWithdrawn}</p>}
          </div>
          {/* เฉลี่ย */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">น้ำหนักเฉลี่ย / ลูก <span className="font-normal">(คำนวณอัตโนมัติ)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">lbs/ลูก</label>
                <input type="number" step="0.001" value={form.averageP} readOnly placeholder="-" className={ro} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">kg/ลูก</label>
                <input type="number" step="0.001" value={form.averageKg} readOnly placeholder="-" className={ro} />
              </div>
            </div>
          </div>
        </div>

        {/* ── หมายเหตุ ─────────────────────────────────────────────── */}
        <SectionLabel>อื่นๆ</SectionLabel>
        <Field label="หมายเหตุ">
          <input value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="หมายเหตุ (ถ้ามี)"
            className={inp} />
        </Field>

        {/* ── ส่งคืนบรรจุภัณฑ์ ─────────────────────────────────────── */}
        <SectionLabel color="amber">ส่งคืนบรรจุภัณฑ์</SectionLabel>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="จำนวนพาเลท">
              <input type="number" min="0" value={form.pallet}
                onChange={(e) => patch({ pallet: e.target.value })}
                placeholder="จำนวน" className={inp} />
            </Field>
            <Field label="จำนวนกล่อง">
              <input type="number" min="0" value={form.box}
                onChange={(e) => patch({ box: e.target.value })}
                placeholder="จำนวน" className={inp} />
            </Field>
            <Field label="จำนวนกระสอบ">
              <input type="number" min="0" value={form.sack}
                onChange={(e) => patch({ sack: e.target.value })}
                placeholder="จำนวน" className={inp} />
            </Field>
            <Field label="จำนวนกระดาษกั้น">
              <input type="number" min="0" value={form.paperBar}
                onChange={(e) => patch({ paperBar: e.target.value })}
                placeholder="จำนวน" className={inp} />
            </Field>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {([
              { key: "returnPallet",   label: "พาเลท" },
              { key: "returnBox",      label: "กล่อง" },
              { key: "returnSack",     label: "กระสอบ" },
              { key: "returnSpool",    label: "หลอด" },
              { key: "returnPaperBar", label: "กระดาษกั้น" },
            ] as { key: keyof FormState; label: string }[]).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none shrink-0">
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
          <div className="grid grid-cols-1 gap-3">
            <Field label="ผู้รับวัตถุดิบ" required error={errors.recipient}>
              <AutocompleteInput
                value={form.recipient}
                onChange={onRecipientChange}
                onSelect={(v) => { patch({ recipient: v }); setRecipientOptions([]); }}
                options={recipientOptions}
                placeholder="ผู้รับวัตถุดิบ"
                inputClassName={`${inp} ${errors.recipient ? errB : ""}`}
              />
            </Field>
            <Field label="การนำไปใช้">
              <textarea value={form.usageNote}
                onChange={(e) => patch({ usageNote: e.target.value })}
                rows={2} placeholder="การนำไปใช้"
                className={`${inp} resize-none`} />
            </Field>
            <Field label="หมายเหตุการเงิน">
              <textarea value={form.paymentComment}
                onChange={(e) => patch({ paymentComment: e.target.value })}
                rows={2} placeholder="หมายเหตุการเงิน"
                className={`${inp} resize-none`} />
            </Field>
          </div>
        </div>

        {/* ── ส่วนควบคุม ──────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 pt-6 items-center justify-center">
          <button type="button" onClick={handleAddPending}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm">
            + เพิ่มรายการใหม่
          </button>
          <button type="button"
            onClick={() => { setForm(makeEmpty(initDate)); setErrors({}); setSupOptions([]); setYarnOptions([]); setLotOptions([]); setRecipientOptions([]); }}
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
                    <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">สุทธิ (kg)</th>
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
                        {item.weightWithdrawn.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(item.withdrawDate)}</td>
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

      <ConfirmSubmitModal
        open={confirmOpen}
        title="ยืนยันการเบิกวัตถุดิบออกภายนอก"
        rows={buildConfirmRows()}
        submitting={saving}
        onConfirm={submitReal}
        onCancel={() => { setConfirmOpen(false); setPendingSubmit(null); }}
      />
    </div>
  );
}
