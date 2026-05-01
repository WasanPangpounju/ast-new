'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerSug { id: number; name: string; tax: string | null; tel: string | null }
interface DeadlineRow { dt: string; qty: string; unit: string; pct: string }

// ─── Small reusable components ────────────────────────────────────────────────

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="block text-xs text-gray-600 mb-0.5">
      {text}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function Input({
  value, onChange, placeholder = '', type = 'text', readOnly = false, className = '',
}: {
  value: string; onChange?: (v: string) => void; placeholder?: string
  type?: string; readOnly?: boolean; className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={e => onChange?.(e.target.value)}
      className={`w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${readOnly ? 'bg-gray-50 text-gray-500' : ''} ${className}`}
    />
  )
}

// ─── Yarn row ─────────────────────────────────────────────────────────────────

function YarnRow({
  label, yarn, company, count, ratio, side,
  onYarnChange, onCompanyChange, onCountChange, onRatioChange,
}: {
  label: string; yarn: string; company: string; count: string; ratio: string; side: 'warp' | 'weft'
  onYarnChange: (v: string) => void; onCompanyChange: (v: string) => void
  onCountChange: (v: string) => void; onRatioChange: (v: string) => void
}) {
  const [yarnSugs, setYarnSugs] = useState<string[]>([])
  const [yarnOpen, setYarnOpen] = useState(false)
  const [compSugs, setCompSugs] = useState<string[]>([])
  const [compOpen, setCompOpen] = useState(false)
  const yarnRef = useRef<HTMLDivElement>(null)
  const compRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!yarn) { setYarnSugs([]); return }
    const t = setTimeout(() => {
      fetch(`/api/sales/autocomplete/yarns?q=${encodeURIComponent(yarn)}&type=${side}`)
        .then(r => r.json()).then(d => setYarnSugs(d.yarns ?? []))
    }, 200)
    return () => clearTimeout(t)
  }, [yarn, side])

  useEffect(() => {
    if (!yarn) { setCompSugs([]); return }
    fetch(`/api/sales/autocomplete/yarn-companies?yarn=${encodeURIComponent(yarn)}&side=${side}`)
      .then(r => r.json()).then(d => setCompSugs(d.companies ?? []))
  }, [yarn, side])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (yarnRef.current && !yarnRef.current.contains(e.target as Node)) setYarnOpen(false)
      if (compRef.current && !compRef.current.contains(e.target as Node)) setCompOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div className="grid grid-cols-4 gap-2">
      {/* Yarn autocomplete */}
      <div ref={yarnRef} className="relative col-span-1">
        <Input
          value={yarn}
          onChange={v => { onYarnChange(v); setYarnOpen(true) }}
          placeholder={label}
        />
        {yarnOpen && yarnSugs.length > 0 && (
          <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
            {yarnSugs.map(s => (
              <button key={s} type="button" onClick={() => { onYarnChange(s); setYarnOpen(false) }}
                className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 truncate">{s}</button>
            ))}
          </div>
        )}
      </div>
      {/* Company autocomplete */}
      <div ref={compRef} className="relative col-span-1">
        <Input
          value={company}
          onChange={v => { onCompanyChange(v); setCompOpen(true) }}
          placeholder="บริษัท"
        />
        {compOpen && compSugs.length > 0 && (
          <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
            {compSugs.map(s => (
              <button key={s} type="button" onClick={() => { onCompanyChange(s); setCompOpen(false) }}
                className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 truncate">{s}</button>
            ))}
          </div>
        )}
      </div>
      <Input value={count} onChange={onCountChange} placeholder="จำนวน (เส้น)" type="number" />
      <Input value={ratio} onChange={onRatioChange} placeholder="อัตราส่วน" />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

// Matches the old Laravel subyarntype(): first two space-separated words, trailing space if only one.
function subyarntype(yarn: string): string {
  const parts = yarn.trim().split(/\s+/)
  return parts[0] + ' ' + (parts[1] ?? '')
}

function buildFabricStruct(
  warpYarn1: string, warpCount1: string,
  warpYarn2: string,
  weftYarn1: string, weftCount1: string,
  weftYarn2: string,
  weftYarn3: string,
  weftYarn4: string,
): string {
  if (!warpYarn1 || !weftYarn1) return ''

  let warpStr: string
  if (warpYarn2) {
    warpStr = '(' + subyarntype(warpYarn1) + '* ' + subyarntype(warpYarn2) + ')'
  } else {
    warpStr = subyarntype(warpYarn1)
  }

  let weftStr: string
  if (weftYarn2 || weftYarn3 || weftYarn4) {
    let w = '(' + subyarntype(weftYarn1)
    if (weftYarn2) w += '* ' + subyarntype(weftYarn2)
    if (weftYarn3) w += '* ' + subyarntype(weftYarn3)
    if (weftYarn4) w += '* ' + subyarntype(weftYarn4)
    weftStr = w + ')'
  } else {
    weftStr = subyarntype(weftYarn1)
  }

  const typeStr = warpStr + ' * ' + weftStr
  const countStr = (warpCount1 || '') + ' * ' + (weftCount1 || '')
  return typeStr + ' / ' + countStr
}

export default function CreateOrderPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Header
  const [vat, setVat] = useState('SO')
  const [createDate, setCreateDate] = useState(TODAY)

  // Customer
  const [customerName, setCustomerName] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSugs, setCustomerSugs] = useState<CustomerSug[]>([])
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)
  const [coordinator, setCoordinator] = useState('')

  // Fabric basic
  const [fabricId, setFabricId] = useState('')
  const [fabricPattern, setFabricPattern] = useState('')
  const [fabricStructure, setFabricStructure] = useState('')
  const [yarnHCount, setYarnHCount] = useState('')
  const [fabricW, setFabricW] = useState('')

  // Warp yarns
  const [warpYarn1, setWarpYarn1] = useState('')
  const [warpComp1, setWarpComp1] = useState('')
  const [warpCount1, setWarpCount1] = useState('')
  const [warpRatio1, setWarpRatio1] = useState('')
  const [warpYarn2, setWarpYarn2] = useState('')
  const [warpComp2, setWarpComp2] = useState('')
  const [warpCount2, setWarpCount2] = useState('')
  const [warpRatio2, setWarpRatio2] = useState('')

  // Weft yarns
  const [weftYarn1, setWeftYarn1] = useState('')
  const [weftComp1, setWeftComp1] = useState('')
  const [weftCount1, setWeftCount1] = useState('')
  const [weftRatio1, setWeftRatio1] = useState('')
  const [weftYarn2, setWeftYarn2] = useState('')
  const [weftComp2, setWeftComp2] = useState('')
  const [weftCount2, setWeftCount2] = useState('')
  const [weftRatio2, setWeftRatio2] = useState('')
  const [weftYarn3, setWeftYarn3] = useState('')
  const [weftComp3, setWeftComp3] = useState('')
  const [weftCount3, setWeftCount3] = useState('')
  const [weftRatio3, setWeftRatio3] = useState('')
  const [weftYarn4, setWeftYarn4] = useState('')
  const [weftComp4, setWeftComp4] = useState('')
  const [weftCount4, setWeftCount4] = useState('')
  const [weftRatio4, setWeftRatio4] = useState('')

  // Fabric spec
  const [phewNumber, setPhewNumber] = useState('')
  const [phewW, setPhewW] = useState('')
  const [stackType, setStackType] = useState('ม้วนเส้น')

  // Order quantity
  const [orderSumYard, setOrderSumYard] = useState('')
  const [fabricSPY, setFabricSPY] = useState('')

  // Price
  const [priceYard, setPriceYard] = useState('')
  const [priceM, setPriceM] = useState('')
  const [discountP, setDiscountP] = useState('')
  const [discountYard, setDiscountYard] = useState('')

  // Other
  const [machineNumber, setMachineNumber] = useState('')
  const [surcharge, setSurcharge] = useState('')
  const [commission, setCommission] = useState('')
  const [po, setPo] = useState('')

  // Deadlines
  const [deadlines, setDeadlines] = useState<DeadlineRow[]>([
    { dt: '', qty: '', unit: 'หลา', pct: '' },
  ])

  // Notes
  const [note, setNote] = useState('')
  const [productionNote, setProductionNote] = useState('')
  const [payment, setPayment] = useState('ชำระภายใน 15 วันหลังได้รับใบแจ้งหนี้')

  // Customer autocomplete
  useEffect(() => {
    if (customerSearch.length < 1) { setCustomerSugs([]); return }
    const t = setTimeout(() => {
      fetch(`/api/sales/autocomplete/customers?q=${encodeURIComponent(customerSearch)}`)
        .then(r => r.json()).then(d => setCustomerSugs(d.customers ?? []))
    }, 200)
    return () => clearTimeout(t)
  }, [customerSearch])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node))
        setCustomerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function handleGenerateStruct() {
    setFabricStructure(buildFabricStruct(
      warpYarn1, warpCount1, warpYarn2,
      weftYarn1, weftCount1, weftYarn2, weftYarn3, weftYarn4,
    ))
  }

  function updateDeadline(i: number, field: keyof DeadlineRow, value: string) {
    setDeadlines(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vat, createDate, customerName, coordinator,
          fabricId, fabricPattern, fabricStructure,
          fabricW, yarnHCount, phewNumber, phewW, stackType,
          warpYarn1, warpComp1, warpCount1, warpRatio1,
          warpYarn2, warpComp2, warpCount2, warpRatio2,
          weftYarn1, weftComp1, weftCount1, weftRatio1,
          weftYarn2, weftComp2, weftCount2, weftRatio2,
          weftYarn3, weftComp3, weftCount3, weftRatio3,
          weftYarn4, weftComp4, weftCount4, weftRatio4,
          orderSumYard, fabricSPY,
          priceYard, priceM, discountP, discountYard,
          machineNumber, surcharge, commission, po,
          note, productionNote, payment,
          deadlines,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'เกิดข้อผิดพลาด'); return }
      router.push(`/sales/orders/${d.order.id}`)
    } finally {
      setSaving(false)
    }
  }

  // ─── Section header ──────────────────────────────────────────────────────────
  const SectionHead = ({ title }: { title: string }) => (
    <div className="col-span-full border-b border-gray-200 pb-1 mb-1">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
    </div>
  )

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-xs text-gray-500 hover:text-gray-700">← กลับ</button>
        <h1 className="text-base font-semibold text-gray-900">สร้างใบสั่งขายใหม่</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

        {/* ── Header: SO number + date + VAT type ─────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <Label text="เลขที่ใบสั่งขาย" />
            <Input value={`${vat}YYMM/##`} readOnly placeholder="สร้างอัตโนมัติ" />
          </div>
          <div>
            <Label text="วันที่" />
            <Input type="date" value={createDate} onChange={setCreateDate} />
          </div>
          <div>
            <Label text="ประเภท VAT" required />
            <div className="flex gap-2">
              {['SO', 'SOB', 'SOX'].map(v => (
                <label key={v} className={`flex-1 text-center py-1.5 rounded border text-sm font-medium cursor-pointer transition-colors ${
                  vat === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  <input type="radio" name="vat" value={v} checked={vat === v} onChange={() => setVat(v)} className="hidden" />
                  {v}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── ข้อมูลลูกค้า ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <SectionHead title="ข้อมูลลูกค้า" />

          <div ref={customerRef} className="relative">
            <Label text="ชื่อลูกค้า" required />
            <input
              value={customerSearch}
              onChange={e => { setCustomerSearch(e.target.value); setCustomerName(e.target.value); setCustomerOpen(true) }}
              onFocus={() => customerSearch.length >= 1 && setCustomerOpen(true)}
              placeholder="พิมพ์ชื่อลูกค้า..."
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {customerOpen && customerSugs.length > 0 && (
              <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                {customerSugs.map(c => (
                  <button key={c.id} type="button"
                    onClick={() => { setCustomerName(c.name); setCustomerSearch(c.name); setCustomerOpen(false) }}
                    className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-sm">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-400">{[c.tax, c.tel].filter(Boolean).join(' · ')}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label text="ผู้ประสานงาน" />
            <Input value={coordinator} onChange={setCoordinator} placeholder="ชื่อผู้ประสาน" />
          </div>
        </div>

        {/* ── ใบคำสั่งซื้อ ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <SectionHead title="ใบคำสั่งซื้อ" />

          <div>
            <Label text="รหัสผ้า" />
            <Input value={fabricId} onChange={setFabricId} placeholder="รหัสผ้า" />
          </div>
          <div>
            <Label text="ลายผ้า" />
            <Input value={fabricPattern} onChange={setFabricPattern} placeholder="ลายผ้า" />
          </div>

          {/* Fabric structure auto-gen */}
          <div className="col-span-full flex gap-2 items-end">
            <div className="flex-1">
              <Label text="โครงสร้างผ้า" />
              <Input value={fabricStructure} onChange={setFabricStructure} placeholder="สร้างอัตโนมัติหรือพิมพ์เอง" />
            </div>
            <button type="button" onClick={handleGenerateStruct}
              className="px-3 py-1.5 text-sm bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 whitespace-nowrap">
              🔨 สร้าง
            </button>
          </div>

          <div>
            <Label text="จำนวนด้ายยืน (เส้น)" />
            <Input value={yarnHCount} onChange={setYarnHCount} placeholder="เส้น" type="number" />
          </div>
          <div>
            <Label text="หน้ากว้าง (นิ้ว)" required />
            <Input value={fabricW} onChange={setFabricW} placeholder="นิ้ว" type="number" />
          </div>
        </div>

        {/* Warp yarn headers */}
        <div>
          <div className="grid grid-cols-4 gap-2 mb-1">
            <span className="text-xs text-gray-500 font-medium">ชนิดด้ายยืน</span>
            <span className="text-xs text-gray-500 font-medium">บริษัท</span>
            <span className="text-xs text-gray-500 font-medium">จำนวน (เส้น)</span>
            <span className="text-xs text-gray-500 font-medium">อัตราส่วน</span>
          </div>
          <div className="space-y-1.5">
            <YarnRow label="ด้ายยืน 1" yarn={warpYarn1} company={warpComp1} count={warpCount1} ratio={warpRatio1} side="warp"
              onYarnChange={setWarpYarn1} onCompanyChange={setWarpComp1} onCountChange={setWarpCount1} onRatioChange={setWarpRatio1} />
            <YarnRow label="ด้ายยืน 2" yarn={warpYarn2} company={warpComp2} count={warpCount2} ratio={warpRatio2} side="warp"
              onYarnChange={setWarpYarn2} onCompanyChange={setWarpComp2} onCountChange={setWarpCount2} onRatioChange={setWarpRatio2} />
          </div>
        </div>

        {/* Weft yarn headers */}
        <div>
          <div className="grid grid-cols-4 gap-2 mb-1">
            <span className="text-xs text-gray-500 font-medium">ชนิดด้ายพุ่ง</span>
            <span className="text-xs text-gray-500 font-medium">บริษัท</span>
            <span className="text-xs text-gray-500 font-medium">จำนวน (เส้น)</span>
            <span className="text-xs text-gray-500 font-medium">อัตราส่วน</span>
          </div>
          <div className="space-y-1.5">
            <YarnRow label="ด้ายพุ่ง 1" yarn={weftYarn1} company={weftComp1} count={weftCount1} ratio={weftRatio1} side="weft"
              onYarnChange={setWeftYarn1} onCompanyChange={setWeftComp1} onCountChange={setWeftCount1} onRatioChange={setWeftRatio1} />
            <YarnRow label="ด้ายพุ่ง 2" yarn={weftYarn2} company={weftComp2} count={weftCount2} ratio={weftRatio2} side="weft"
              onYarnChange={setWeftYarn2} onCompanyChange={setWeftComp2} onCountChange={setWeftCount2} onRatioChange={setWeftRatio2} />
            <YarnRow label="ด้ายพุ่ง 3" yarn={weftYarn3} company={weftComp3} count={weftCount3} ratio={weftRatio3} side="weft"
              onYarnChange={setWeftYarn3} onCompanyChange={setWeftComp3} onCountChange={setWeftCount3} onRatioChange={setWeftRatio3} />
            <YarnRow label="ด้ายพุ่ง 4" yarn={weftYarn4} company={weftComp4} count={weftCount4} ratio={weftRatio4} side="weft"
              onYarnChange={setWeftYarn4} onCompanyChange={setWeftComp4} onCountChange={setWeftCount4} onRatioChange={setWeftRatio4} />
          </div>
        </div>

        {/* Fabric spec */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label text="เบอร์หรี" />
            <Input value={phewNumber} onChange={setPhewNumber} placeholder="เบอร์" />
          </div>
          <div>
            <Label text="หน้าหรี (นิ้ว)" />
            <Input value={phewW} onChange={setPhewW} placeholder="นิ้ว" type="number" />
          </div>
          <div>
            <Label text="การกองผ้า" />
            <select value={stackType} onChange={e => setStackType(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option>ม้วนเส้น</option>
              <option>อื่นๆ</option>
            </select>
          </div>
        </div>

        {/* ── ราคา ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
          <SectionHead title="ราคา" />

          <div>
            <Label text="จำนวนออร์เดอร์ (หลา)" required />
            <Input value={orderSumYard} onChange={setOrderSumYard} placeholder="หลา" type="number" />
          </div>
          <div>
            <Label text="การสีน" required />
            <Input value={fabricSPY} onChange={setFabricSPY} placeholder="ไม่มีให้เลข 0" type="number" />
          </div>

          <div>
            <Label text="ราคาต่อหน่วย (บาท/หลา)" required />
            <Input value={priceYard} onChange={setPriceYard} placeholder="บาท/หลา" type="number" />
          </div>
          <div>
            <Label text="ราคาต่อหน่วย (บาท/เมตร)" />
            <Input value={priceM} onChange={setPriceM} placeholder="บาท/เมตร" type="number" />
          </div>

          <div>
            <Label text="ส่วนลด (%)" />
            <Input value={discountP} onChange={setDiscountP} placeholder="%" type="number" />
          </div>
          <div>
            <Label text="ส่วนลด (หลา)" />
            <Input value={discountYard} onChange={setDiscountYard} placeholder="หลา" type="number" />
          </div>

          <div>
            <Label text="เบอร์เครื่อง" />
            <Input value={machineNumber} onChange={setMachineNumber} placeholder="เบอร์เครื่อง" />
          </div>
          <div>
            <Label text="SURCHARGE" />
            <Input value={surcharge} onChange={setSurcharge} placeholder="Surcharge" />
          </div>

          <div>
            <Label text="คอมมิชชั่น" />
            <Input value={commission} onChange={setCommission} placeholder="คอมมิชชั่น" type="number" />
          </div>
          <div>
            <Label text="PO ลูกค้า" />
            <Input value={po} onChange={setPo} placeholder="เลขที่ PO" />
          </div>
        </div>

        {/* ── กำหนดส่ง ─────────────────────────────────────────────────────── */}
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">กำหนดส่ง</span>
            <button type="button"
              onClick={() => setDeadlines(prev => [...prev, { dt: '', qty: '', unit: 'หลา', pct: '' }])}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
              ➕ เพิ่มครั้ง
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-xs text-left px-2 py-1.5 border border-gray-200 w-8">ครั้ง</th>
                  <th className="text-xs text-left px-2 py-1.5 border border-gray-200">วันที่</th>
                  <th className="text-xs text-left px-2 py-1.5 border border-gray-200">จำนวน</th>
                  <th className="text-xs text-left px-2 py-1.5 border border-gray-200 w-20">หน่วย</th>
                  <th className="text-xs text-left px-2 py-1.5 border border-gray-200 w-16">%</th>
                  <th className="border border-gray-200 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {deadlines.map((row, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 border border-gray-200 text-center text-xs text-gray-500">{i + 1}</td>
                    <td className="px-1 py-1 border border-gray-200">
                      <input type="date" value={row.dt} onChange={e => updateDeadline(i, 'dt', e.target.value)}
                        className="w-full border-0 text-sm focus:outline-none" />
                    </td>
                    <td className="px-1 py-1 border border-gray-200">
                      <input type="number" value={row.qty} onChange={e => updateDeadline(i, 'qty', e.target.value)}
                        placeholder="จำนวน"
                        className="w-full border-0 text-sm focus:outline-none" />
                    </td>
                    <td className="px-1 py-1 border border-gray-200">
                      <select value={row.unit} onChange={e => updateDeadline(i, 'unit', e.target.value)}
                        className="w-full border-0 text-sm focus:outline-none bg-transparent">
                        <option>หลา</option>
                        <option>เมตร</option>
                      </select>
                    </td>
                    <td className="px-1 py-1 border border-gray-200">
                      <input type="number" value={row.pct} onChange={e => updateDeadline(i, 'pct', e.target.value)}
                        placeholder="%"
                        className="w-full border-0 text-sm focus:outline-none" />
                    </td>
                    <td className="px-1 py-1 border border-gray-200 text-center">
                      {deadlines.length > 1 && (
                        <button type="button" onClick={() => setDeadlines(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Notes / payment ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
          <div>
            <Label text="หมายเหตุ" />
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="หมายเหตุ"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <Label text="หมายเหตุการผลิต" />
            <textarea value={productionNote} onChange={e => setProductionNote(e.target.value)} rows={3} placeholder="หมายเหตุการผลิต"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
          <div className="col-span-full">
            <Label text="เงื่อนไขการชำระเงิน" />
            <textarea value={payment} onChange={e => setPayment(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
        </div>

        {/* ── Buttons ───────────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => router.back()}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
            ยกเลิก
          </button>
          <button type="button"
            onClick={() => { if (window.confirm('บันทึกและไปหน้าใบโครงสร้าง?')) handleSubmit({ preventDefault: () => {} } as React.FormEvent) }}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700">
            🏭 ใบโครงสร้าง
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 font-medium">
            {saving ? 'กำลังสร้าง...' : '💾 ใบสั่งขาย'}
          </button>
        </div>
      </form>
    </div>
  )
}
