'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerSug { id: number; name: string; tax: string | null; tel: string | null }
interface DeadlineRow { dt: string; qty: string; unit: string; pct: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toThaiDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${parseInt(y) + 543}`
}

const TODAY = new Date().toISOString().slice(0, 10)

function buildFabricStruct(
  warpYarn1: string, warpCount1: string, warpYarn2: string,
  weftYarn1: string, weftCount1: string,
  weftYarn2: string, weftYarn3: string, weftYarn4: string,
): string {
  if (!warpYarn1 || !weftYarn1) return ''
  const warpParts = [warpYarn1.trim(), warpYarn2.trim()].filter(Boolean)
  const weftParts = [weftYarn1.trim(), weftYarn2.trim(), weftYarn3.trim(), weftYarn4.trim()].filter(Boolean)
  return `${warpParts.join(' + ')} * ${weftParts.join(' + ')} / ${warpCount1 || ''} * ${weftCount1 || ''}`
}

// ─── Base components ──────────────────────────────────────────────────────────

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {text}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function Input({
  value, onChange, placeholder = '', type = 'text',
  readOnly = false, gray = false, className = '',
}: {
  value: string; onChange?: (v: string) => void; placeholder?: string
  type?: string; readOnly?: boolean; gray?: boolean; className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={e => onChange?.(e.target.value)}
      className={`w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500
        ${readOnly || gray ? 'bg-gray-100 text-gray-500' : 'bg-white'} ${className}`}
    />
  )
}

// ─── Yarn name autocomplete ───────────────────────────────────────────────────

function YarnAC({ value, onChange, side, placeholder }: {
  value: string; onChange: (v: string) => void; side: 'warp' | 'weft'; placeholder: string
}) {
  const [sugs, setSugs] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === ' ') {
      const q = value.trim()
      if (!q) return
      fetch(`/api/sales/autocomplete/yarns?q=${encodeURIComponent(q)}&type=${side}`)
        .then(r => r.json())
        .then(d => { setSugs(d.yarns ?? []); setOpen(true) })
    }
  }

  return (
    <div ref={ref} className="relative">
      <input value={value} onChange={e => onChange(e.target.value)} onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
      {open && sugs.length > 0 && (
        <div className="absolute z-30 w-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
          {sugs.map(s => (
            <button key={s} type="button" onClick={() => { onChange(s); setOpen(false) }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 truncate">{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Company autocomplete (pulls from suppliers) ──────────────────────────────

function CompAC({ value, onChange }: {
  value: string; onChange: (v: string) => void
}) {
  const [sugs, setSugs] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === ' ') {
      const q = value.trim()
      if (!q) return
      fetch(`/api/sales/autocomplete/yarn-companies?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(d => { setSugs(d.companies ?? []); setOpen(true) })
    }
  }

  return (
    <div ref={ref} className="relative">
      <input value={value} onChange={e => onChange(e.target.value)} onKeyDown={handleKeyDown}
        placeholder="บริษัท"
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
      {open && sugs.length > 0 && (
        <div className="absolute z-30 w-full mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
          {sugs.map(s => (
            <button key={s} type="button" onClick={() => { onChange(s); setOpen(false) }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 truncate">{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabId = 'customer' | 'order' | 'supplier' | 'verify'
const TABS: { id: TabId; label: string }[] = [
  { id: 'customer', label: 'ข้อมูลลูกค้า' },
  { id: 'order',    label: 'ใบคำสั่งขาย' },
  { id: 'supplier', label: 'ข้อมูลซัพพลายเออร์' },
  { id: 'verify',   label: 'ตรวจสอบใบสั่งขาย' },
]

// ─── Yarn row ─────────────────────────────────────────────────────────────────

function YarnRow({
  label, required, yarn, comp, count, ratio,
  onYarn, onComp, onCount, onRatio, side, grayRatio = false,
}: {
  label: string; required?: boolean
  yarn: string; comp: string; count: string; ratio: string
  onYarn: (v: string) => void; onComp: (v: string) => void
  onCount: (v: string) => void; onRatio: (v: string) => void
  side: 'warp' | 'weft'; grayRatio?: boolean
}) {
  return (
    <tr>
      <td className="pr-2 py-1 text-xs text-gray-500 whitespace-nowrap align-top pt-2 w-28">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </td>
      <td className="pr-2 py-1"><YarnAC value={yarn} onChange={onYarn} side={side} placeholder={label} /></td>
      <td className="pr-2 py-1"><CompAC value={comp} onChange={onComp} /></td>
      <td className="pr-2 py-1">
        <input type="number" value={count} onChange={e => onCount(e.target.value)} placeholder="เส้น"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
      </td>
      <td className="py-1">
        <input type="text" value={ratio} onChange={e => onRatio(e.target.value)} placeholder="อัตราส่วน"
          className={`w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500
            ${grayRatio ? 'bg-gray-100 cursor-not-allowed text-gray-400' : ''}`} />
      </td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CreateOrderPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('order')
  const [secOpen, setSecOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [fabricStructureError, setFabricStructureError] = useState(false)
  const [orderNo, setOrderNo] = useState('')
  const [orderNoEdited, setOrderNoEdited] = useState(false)
  const [orderNoLoading, setOrderNoLoading] = useState(false)
  const [billNo, setBillNo] = useState('')

  // Header
  const [createDate, setCreateDate] = useState(TODAY)
  const [vat, setVat] = useState('SO')

  // Customer
  const [customerName, setCustomerName] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSugs, setCustomerSugs] = useState<CustomerSug[]>([])
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)
  const [coordinator, setCoordinator] = useState('')

  // Fabric
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

  // Spec
  const [phewNumber, setPhewNumber] = useState('')
  const [phewW, setPhewW] = useState('')
  const [stackType, setStackType] = useState('')

  // Quantity
  const [orderSumYard, setOrderSumYard] = useState('')
  const [orderSumMeter, setOrderSumMeter] = useState('')
  const [fabricSPY, setFabricSPY] = useState('')
  const [fabricSPYPct, setFabricSPYPct] = useState('')

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
  const [payment, setPayment] = useState('ชำระเงินภายใน 15 วันหลังได้รับสินค้า')

  // Fetch next SO number (changes with vat) and global bill count (always)
  useEffect(() => {
    setOrderNoLoading(true)
    fetch(`/api/sales/orders/next-no?vat=${vat}`)
      .then(r => r.json())
      .then(d => {
        if (d.purchaseOrder && !orderNoEdited) setOrderNo(d.purchaseOrder)
        if (d.billNo) setBillNo(d.billNo.toString())
      })
      .catch(() => {})
      .finally(() => setOrderNoLoading(false))
  }, [vat, orderNoEdited])

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


  // Auto-build fabric structure (disabled — use สร้าง button instead)
  // useEffect(() => {
  //   setFabricStructure(buildFabricStruct(
  //     warpYarn1, warpCount1, warpYarn2,
  //     weftYarn1, weftCount1, weftYarn2, weftYarn3, weftYarn4,
  //   ))
  // }, [warpYarn1, warpCount1, warpYarn2, weftYarn1, weftCount1, weftYarn2, weftYarn3, weftYarn4])

  function updateDeadline(i: number, field: keyof DeadlineRow, value: string) {
    setDeadlines(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function buildFormBody(extra?: object) {
    return JSON.stringify({
      vat, purchaseOrder: orderNo || undefined, createDate, customerName, coordinator,
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
      ...extra,
    })
  }

  function validate(): boolean {
    if (!fabricStructure.trim()) {
      setFabricStructureError(true)
      return false
    }
    return true
  }

  // ปุ่ม 💾 ใบสั่งขาย — บันทึก SO + สร้าง BillOfStructure + toast + อยู่หน้าเดิม
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildFormBody({ createStructure: true }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'เกิดข้อผิดพลาด'); return }
      setToast('บันทึกสำเร็จ')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  // ปุ่ม 🏭 ใบโครงสร้าง — บันทึก SO + เปิดฟอร์มใบโครงสร้าง
  async function handleOpenStructure() {
    if (!validate()) return
    setSaving(true); setError('')
    try {
      const soRes = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildFormBody(),
      })
      const soData = await soRes.json()
      if (!soRes.ok) { setError(soData.error ?? 'เกิดข้อผิดพลาด'); return }

      await fetch(`/api/sales/orders/${soData.order.id}/open-structure`, { method: 'POST' })
      router.push(`/sales/orders/${soData.order.id}/structure`)
    } finally {
      setSaving(false)
    }
  }

  const thaiDate = toThaiDate(createDate)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#ece9d8] border-b-2 border-gray-400 px-2 pt-1 flex items-end justify-between select-none">
        <div className="flex items-end gap-0.5">
          {TABS.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-1.5 text-sm border border-b-0 border-gray-400 font-medium transition-colors
                ${activeTab === tab.id
                  ? 'bg-white text-gray-900 relative -mb-px z-10'
                  : 'bg-[#d4d0c8] text-gray-600 hover:bg-[#e0ddd4]'}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="pb-1.5 pr-1 text-sm text-gray-600">
          วันที่ {thaiDate}&nbsp;&nbsp;NO.<span className="font-semibold text-blue-700">{billNo || '...'}</span>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="p-3 max-w-4xl">
        <form onSubmit={handleSubmit}>
          {toast && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-300 rounded px-3 py-2 mb-3">{toast}</div>
          )}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-300 rounded px-3 py-2 mb-3">{error}</div>
          )}

          {/* ── ใบคำสั่งขาย tab ───────────────────────────────────────────── */}
          {activeTab === 'order' && (
            <div className="border border-gray-300 bg-white shadow-sm rounded">
              {/* ► Section header */}
              <button type="button" onClick={() => setSecOpen(p => !p)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-300 text-sm font-semibold text-gray-800 hover:bg-gray-200 text-left rounded-t">
                <span className="text-[10px]">{secOpen ? '▼' : '►'}</span>
                เพิ่มคำสั่งซื้อ
              </button>

              {secOpen && (
                <div className="p-5 space-y-4">
                  {/* Header: date + NO right-aligned */}
                  <div className="flex justify-end text-sm text-gray-600">
                    วันที่ {thaiDate}&nbsp;&nbsp;NO.<span className="font-medium text-gray-900">{billNo || '...'}</span>
                  </div>

                  {/* Row 1: No. | วันที่ */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label text="No." />
                      <Input
                        value={billNo}
                        readOnly
                        gray
                        placeholder="กำลังโหลด..."
                      />
                    </div>
                    <div>
                      <Label text="วันที่" />
                      <Input type="date" value={createDate} onChange={setCreateDate} />
                    </div>
                  </div>

                  {/* Row 2: ชื่อลูกค้า | ผู้ประสานงาน */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label text="ชื่อลูกค้า" required />
                      <div ref={customerRef} className="relative">
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
                    </div>
                    <div>
                      <Label text="ผู้ประสานงาน" required />
                      <Input value={coordinator} onChange={setCoordinator} placeholder="ชื่อผู้ประสาน" />
                    </div>
                  </div>

                  {/* Row 3: รหัสผ้า | ลายผ้า */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label text="รหัสผ้า" required />
                      <Input value={fabricId} onChange={setFabricId} placeholder="รหัสผ้า" />
                    </div>
                    <div>
                      <Label text="ลายผ้า" required />
                      <Input value={fabricPattern} onChange={setFabricPattern} placeholder="ลายผ้า" />
                    </div>
                  </div>

                  {/* Row 4: โครงสร้างผ้า full width + สร้าง button */}
                  <div>
                    <Label text="โครงสร้างผ้า" required />
                    <div className="flex gap-2">
                      <input
                        value={fabricStructure}
                        onChange={e => {
                          setFabricStructure(e.target.value)
                          if (e.target.value.trim()) setFabricStructureError(false)
                        }}
                        placeholder="สร้างอัตโนมัติหรือพิมพ์เอง"
                        className={`flex-1 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1
                          ${fabricStructureError
                            ? 'border-red-400 focus:ring-red-400 bg-red-50'
                            : 'border-gray-300 focus:ring-blue-500'}`}
                      />
                      <button type="button"
                        onClick={() => {
                          const v = buildFabricStruct(warpYarn1, warpCount1, warpYarn2, weftYarn1, weftCount1, weftYarn2, weftYarn3, weftYarn4)
                          setFabricStructure(v)
                          if (v.trim()) setFabricStructureError(false)
                        }}
                        className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded font-medium hover:bg-teal-700 whitespace-nowrap">
                        สร้าง
                      </button>
                    </div>
                    {fabricStructureError && (
                      <p className="text-xs text-red-500 mt-1">กรุณากรอกโครงสร้างผ้า หรือกด "สร้าง" เพื่อสร้างอัตโนมัติ</p>
                    )}
                  </div>

                  {/* Row 5: จำนวนด้ายยืน | หน้าผ้า */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label text="จำนวนด้ายยืน (เส้น)" />
                      <Input value={yarnHCount} onChange={setYarnHCount} placeholder="เส้น" type="number" />
                    </div>
                    <div>
                      <Label text="หน้าผ้า (นิ้ว)" required />
                      <Input value={fabricW} onChange={setFabricW} placeholder="นิ้ว" type="number" />
                    </div>
                  </div>

                  {/* ── Yarn table ──────────────────────────────────────────── */}
                  <div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left text-xs font-medium text-gray-600 pb-1 w-28"></th>
                          <th className="text-left text-xs font-medium text-gray-600 pb-1 pr-2">ชนิด</th>
                          <th className="text-left text-xs font-medium text-gray-600 pb-1 pr-2">บริษัท</th>
                          <th className="text-left text-xs font-medium text-gray-600 pb-1 pr-2">จำนวน (เส้น)</th>
                          <th className="text-left text-xs font-medium text-gray-600 pb-1">อัตราส่วน</th>
                        </tr>
                      </thead>
                      <tbody>
                        <YarnRow label="ชนิดด้ายยืน 1" required side="warp"
                          yarn={warpYarn1} comp={warpComp1} count={warpCount1} ratio={warpRatio1}
                          onYarn={setWarpYarn1} onComp={setWarpComp1} onCount={setWarpCount1} onRatio={setWarpRatio1} />
                        <YarnRow label="ชนิดด้ายยืน 2" side="warp" grayRatio
                          yarn={warpYarn2} comp={warpComp2} count={warpCount2} ratio={warpRatio2}
                          onYarn={setWarpYarn2} onComp={setWarpComp2} onCount={setWarpCount2} onRatio={setWarpRatio2} />
                        <tr><td colSpan={5} className="py-1" /></tr>
                        <YarnRow label="ชนิดด้ายพุ่ง 1" required side="weft"
                          yarn={weftYarn1} comp={weftComp1} count={weftCount1} ratio={weftRatio1}
                          onYarn={setWeftYarn1} onComp={setWeftComp1} onCount={setWeftCount1} onRatio={setWeftRatio1} />
                        <YarnRow label="ชนิดด้ายพุ่ง 2" side="weft" grayRatio
                          yarn={weftYarn2} comp={weftComp2} count={weftCount2} ratio={weftRatio2}
                          onYarn={setWeftYarn2} onComp={setWeftComp2} onCount={setWeftCount2} onRatio={setWeftRatio2} />
                        <YarnRow label="ชนิดด้ายพุ่ง 3" side="weft" grayRatio
                          yarn={weftYarn3} comp={weftComp3} count={weftCount3} ratio={weftRatio3}
                          onYarn={setWeftYarn3} onComp={setWeftComp3} onCount={setWeftCount3} onRatio={setWeftRatio3} />
                        <YarnRow label="ชนิดด้ายพุ่ง 4" side="weft" grayRatio
                          yarn={weftYarn4} comp={weftComp4} count={weftCount4} ratio={weftRatio4}
                          onYarn={setWeftYarn4} onComp={setWeftComp4} onCount={setWeftCount4} onRatio={setWeftRatio4} />
                      </tbody>
                    </table>
                  </div>

                  {/* เบอร์หวี | หน้าหวี | การลงผ้า */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label text="เบอร์หวี" />
                      <Input value={phewNumber} onChange={setPhewNumber} placeholder="เบอร์" />
                    </div>
                    <div>
                      <Label text="หน้าหวี (นิ้ว)" />
                      <Input value={phewW} onChange={setPhewW} placeholder="นิ้ว" type="number" />
                    </div>
                    <div>
                      <Label text="การลงผ้า" />
                      <Input value={stackType} onChange={setStackType} placeholder="การลงผ้า" />
                    </div>
                  </div>

                  {/* ── Order quantity ────────────────────────────────────── */}
                  <div className="space-y-3">
                    {/* จำนวนออเดอร์ — bidirectional */}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label text="จำนวนออเดอร์ (หลา)" required />
                        <Input value={orderSumYard} type="number" placeholder="หลา"
                          onChange={v => {
                            setOrderSumYard(v)
                            setOrderSumMeter(v && !isNaN(+v) ? (+v * 0.9144).toFixed(2) : '')
                          }} />
                      </div>
                      <span className="text-sm text-gray-400 pb-2 shrink-0">หรือ</span>
                      <div className="flex-1">
                        <Label text="เมตร" />
                        <Input value={orderSumMeter} type="number" placeholder="เมตร"
                          onChange={v => {
                            setOrderSumMeter(v)
                            setOrderSumYard(v && !isNaN(+v) ? (+v / 0.9144).toFixed(2) : '')
                          }} />
                      </div>
                    </div>
                    {/* การสืบ */}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label text="การสืบ" required />
                        <Input value={fabricSPY} onChange={setFabricSPY} placeholder="ไม่มีให้เลข 0" type="number" />
                      </div>
                      <span className="text-sm text-gray-400 pb-2 shrink-0">%</span>
                    </div>
                    {/* รวมหลัง การสืบ (derived, read-only) */}
                    {(() => {
                      const yard = parseFloat(orderSumYard)
                      const pct = parseFloat(fabricSPY)
                      if (!yard) return null
                      const totalYard = (!pct || pct === 0) ? yard : yard * (1 + pct / 100)
                      const totalMeter = totalYard * 0.9144
                      return (
                        <div className="flex items-end gap-2 mt-1">
                          <div className="flex-1">
                            <Label text="รวม (หลา)" />
                            <Input value={totalYard.toFixed(2)} readOnly />
                          </div>
                          <span className="text-sm text-gray-400 pb-2 shrink-0">/</span>
                          <div className="flex-1">
                            <Label text="รวม (เมตร)" />
                            <Input value={totalMeter.toFixed(2)} readOnly />
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* ── Price ──────────────────────────────────────────────── */}
                  <div className="space-y-3">
                    {/* ราคาต่อหน่วย — bidirectional */}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label text="ราคาต่อหน่วย (บาท/หลา)" required />
                        <Input value={priceYard} type="number" placeholder="บาท/หลา"
                          onChange={v => {
                            setPriceYard(v)
                            setPriceM(v && !isNaN(+v) ? (+v / 1.0936).toFixed(2) : '')
                          }} />
                      </div>
                      <span className="text-sm text-gray-400 pb-2 shrink-0">หรือ</span>
                      <div className="flex-1">
                        <Label text="ราคา (บาท/เมตร)" />
                        <Input value={priceM} type="number" placeholder="บาท/เมตร"
                          onChange={v => {
                            setPriceM(v)
                            setPriceYard(v && !isNaN(+v) ? (+v * 1.0936).toFixed(2) : '')
                          }} />
                      </div>
                    </div>

                    {/* ส่วนลด + ราคาหลังลด */}
                    <div className="flex items-end gap-2">
                      <div className="w-40">
                        <Label text="ส่วนลด (%)" />
                        <Input value={discountP} onChange={setDiscountP} placeholder="%" type="number" />
                      </div>
                      {(() => {
                        const py = parseFloat(priceYard)
                        const pm = parseFloat(priceM)
                        const dp = parseFloat(discountP)
                        if ((!py && !pm) || isNaN(dp)) return null
                        const factor = 1 - dp / 100
                        const afterY = py ? py * factor : 0
                        const afterM = pm ? pm * factor : 0
                        return (
                          <div className="flex items-end gap-2 flex-1">
                            <span className="text-sm text-gray-400 pb-2 shrink-0">→ ราคาหลังลด</span>
                            <div className="flex-1">
                              <Label text="บาท/หลา" />
                              <Input value={afterY.toFixed(2)} readOnly />
                            </div>
                            <span className="text-sm text-gray-400 pb-2 shrink-0">/</span>
                            <div className="flex-1">
                              <Label text="บาท/เมตร" />
                              <Input value={afterM.toFixed(2)} readOnly />
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* ราคารวม */}
                    {(() => {
                      const py = parseFloat(priceYard)
                      const pm = parseFloat(priceM)
                      const yard = parseFloat(orderSumYard)
                      const meter = parseFloat(orderSumMeter)
                      const dp = parseFloat(discountP) || 0
                      const factor = 1 - dp / 100
                      if ((!py && !pm) || (!yard && !meter)) return null
                      const total = yard && py
                        ? yard * py * factor
                        : meter * pm * factor
                      return (
                        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                          <span className="text-sm font-medium text-blue-800">ราคารวม</span>
                          <span className="text-base font-semibold text-blue-900">
                            {total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
                          </span>
                          {yard ? (
                            <span className="text-xs text-blue-600">({yard.toLocaleString()} หลา × {(py * factor).toFixed(2)} บาท/หลา)</span>
                          ) : (
                            <span className="text-xs text-blue-600">({meter.toLocaleString()} เมตร × {(pm * factor).toFixed(2)} บาท/เมตร)</span>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* ── Other fields (2 col) ───────────────────────────────── */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label text="เบอร์เครื่อง" />
                      <Input value={machineNumber} onChange={setMachineNumber} placeholder="เบอร์เครื่อง" />
                    </div>
                    <div />
                    <div>
                      <Label text="SURCHARGE" />
                      <Input value={surcharge} onChange={setSurcharge} placeholder="Surcharge" />
                    </div>
                    <div />
                    <div>
                      <Label text="คอมมิชชั่น" />
                      <Input value={commission} onChange={setCommission} placeholder="คอมมิชชั่น" type="number" />
                    </div>
                    <div>
                      <Label text="VAT" />
                      <select value={vat} onChange={e => setVat(e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="SO">SO (excluding vat)</option>
                        <option value="SOX">SO (including vat)</option>
                        <option value="SOB">SOB</option>
                      </select>
                    </div>
                    <div>
                      <Label text="เลขที่ใบสั่งซื้อ" />
                      <Input
                        value={orderNo}
                        onChange={v => {
                          setOrderNo(v)
                          if (v === '') setOrderNoEdited(false)
                          else setOrderNoEdited(true)
                        }}
                        placeholder={orderNoLoading ? 'กำลังโหลด...' : 'เลขที่ใบสั่งซื้อ'}
                      />
                    </div>
                    <div>
                      <Label text="PO ลูกค้า" />
                      <Input value={po} onChange={setPo} placeholder="เลขที่ PO" />
                    </div>
                  </div>

                  {/* ── กำหนดส่ง ────────────────────────────────────────────── */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">กำหนดส่ง</div>
                    <table className="w-full text-sm border-collapse border border-gray-200">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 px-2 py-1.5 text-xs text-left font-medium text-gray-600 w-14">ครั้งที่</th>
                          <th className="border border-gray-200 px-2 py-1.5 text-xs text-left font-medium text-gray-600">วันที่</th>
                          <th className="border border-gray-200 px-2 py-1.5 text-xs text-left font-medium text-gray-600">จำนวน (หลา หรือเมตร)</th>
                          <th className="border border-gray-200 px-2 py-1.5 text-xs text-left font-medium text-gray-600 w-20">%</th>
                          <th className="border border-gray-200 px-2 py-1.5 text-xs text-center font-medium text-gray-600 w-16">เพิ่ม/ลบ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deadlines.map((row, i) => (
                          <tr key={i} className="even:bg-gray-50">
                            <td className="border border-gray-200 px-2 py-1 text-center text-xs text-gray-500">{i + 1}</td>
                            <td className="border border-gray-200 px-1 py-0.5">
                              <input type="date" value={row.dt} onChange={e => updateDeadline(i, 'dt', e.target.value)}
                                className="w-full border-0 text-sm focus:outline-none bg-transparent" />
                            </td>
                            <td className="border border-gray-200 px-1 py-0.5">
                              <div className="flex items-center gap-1">
                                <input type="number" value={row.qty} onChange={e => updateDeadline(i, 'qty', e.target.value)}
                                  placeholder="จำนวน" className="flex-1 min-w-0 border-0 text-sm focus:outline-none bg-transparent" />
                                <select value={row.unit} onChange={e => updateDeadline(i, 'unit', e.target.value)}
                                  className="border-0 text-xs focus:outline-none bg-transparent text-gray-500 shrink-0">
                                  <option>หลา</option>
                                  <option>เมตร</option>
                                </select>
                              </div>
                            </td>
                            <td className="border border-gray-200 px-1 py-0.5">
                              <input type="number" value={row.pct} onChange={e => updateDeadline(i, 'pct', e.target.value)}
                                placeholder="%" className="w-full border-0 text-sm focus:outline-none bg-transparent" />
                            </td>
                            <td className="border border-gray-200 px-1 py-0.5 text-center">
                              <div className="flex justify-center items-center gap-1">
                                <button type="button"
                                  onClick={() => setDeadlines(prev => [...prev, { dt: '', qty: '', unit: 'หลา', pct: '' }])}
                                  className="w-5 h-5 flex items-center justify-center rounded bg-blue-100 text-blue-600 hover:bg-blue-200 text-sm font-bold leading-none">+</button>
                                {deadlines.length > 1 && (
                                  <button type="button" onClick={() => setDeadlines(prev => prev.filter((_, idx) => idx !== i))}
                                    className="w-5 h-5 flex items-center justify-center rounded bg-red-100 text-red-500 hover:bg-red-200 text-sm font-bold leading-none">−</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Notes ───────────────────────────────────────────────── */}
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
                  <div>
                    <Label text="เงื่อนไขการชำระเงิน" />
                    <textarea value={payment} onChange={e => setPayment(e.target.value)} rows={2}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                  </div>

                  {/* ── Buttons (centered) ───────────────────────────────────── */}
                  <div className="flex justify-center gap-3 pt-4 border-t border-gray-100">
                    <button type="submit" disabled={saving}
                      className="px-7 py-2 bg-blue-600 text-white text-sm rounded font-medium hover:bg-blue-700 disabled:opacity-60">
                      {saving ? 'กำลังสร้าง...' : '💾 ใบสั่งขาย'}
                    </button>
                    <button type="button" disabled={saving} onClick={handleOpenStructure}
                      className="px-7 py-2 bg-teal-700 text-white text-sm rounded font-medium hover:bg-teal-800 disabled:opacity-60">
                      🏭 ใบโครงสร้าง
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Other tabs (placeholder) ───────────────────────────────────── */}
          {activeTab === 'customer' && (
            <div className="border border-gray-300 bg-white p-4 shadow-sm rounded text-sm text-gray-500">
              ข้อมูลลูกค้าจะแสดงหลังจากสร้างใบสั่งขาย
            </div>
          )}
          {activeTab === 'supplier' && (
            <div className="border border-gray-300 bg-white p-4 shadow-sm rounded text-sm text-gray-500">
              ยังไม่มีข้อมูลซัพพลายเออร์สำหรับใบสั่งขายนี้
            </div>
          )}
          {activeTab === 'verify' && (
            <div className="border border-gray-300 bg-white p-4 shadow-sm rounded text-sm text-gray-500">
              กรุณาบันทึกใบสั่งขายก่อนตรวจสอบ
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
