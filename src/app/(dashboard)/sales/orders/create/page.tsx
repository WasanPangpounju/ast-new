'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface CustomerSuggestion {
  id: number
  name: string
  tax: string | null
}

export default function CreateOrderPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    vat: 'SO',
    customerName: '',
    fabricId: '',
    fabricStructure: '',
    fabricPattern: '',
    fabricW: '',
    priceYard: '',
    priceM: '',
    discountP: '',
    discountYard: '',
    commission: '',
    orderSumM: '',
    deadlineDate: '',
    comment: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const suggestRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (customerSearch.length < 2) { setSuggestions([]); return }
    const timer = setTimeout(() => {
      fetch(`/api/sales/customers?q=${encodeURIComponent(customerSearch)}&page=1`)
        .then(r => r.json())
        .then(d => setSuggestions(d.customers ?? []))
    }, 200)
    return () => clearTimeout(timer)
  }, [customerSearch])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node))
        setShowSuggestions(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function selectCustomer(c: CustomerSuggestion) {
    setForm(f => ({ ...f, customerName: c.name }))
    setCustomerSearch(c.name)
    setShowSuggestions(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/sales/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'เกิดข้อผิดพลาด'); return }
      router.push(`/sales/orders/${d.order.id}`)
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text', required = false) => (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-4">
        <button onClick={() => router.back()} className="text-xs text-gray-500 hover:text-gray-700 mb-2">← กลับ</button>
        <h1 className="text-lg font-semibold text-gray-900">สร้างใบสั่งขายใหม่</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

        {/* ประเภท */}
        <div>
          <label className="block text-xs text-gray-600 mb-1">ประเภทใบสั่งขาย <span className="text-red-500">*</span></label>
          <div className="flex gap-3">
            {['SO', 'SOX', 'SOB'].map(v => (
              <label key={v} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                form.vat === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                <input type="radio" name="vat" value={v} checked={form.vat === v}
                  onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} className="hidden" />
                {v}
              </label>
            ))}
          </div>
        </div>

        {/* Customer autocomplete */}
        <div ref={suggestRef} className="relative">
          <label className="block text-xs text-gray-600 mb-1">ลูกค้า <span className="text-red-500">*</span></label>
          <input
            value={customerSearch}
            onChange={e => { setCustomerSearch(e.target.value); setForm(f => ({ ...f, customerName: e.target.value })); setShowSuggestions(true) }}
            onFocus={() => customerSearch.length >= 2 && setShowSuggestions(true)}
            placeholder="พิมพ์ชื่อลูกค้า..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map(c => (
                <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm">
                  <div className="font-medium text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{c.tax ?? ''}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fabric fields */}
        <div className="grid grid-cols-2 gap-3">
          {field('รหัสผ้า', 'fabricId')}
          {field('หน้ากว้าง', 'fabricW')}
        </div>
        {field('โครงสร้างผ้า', 'fabricStructure')}
        {field('ลายผ้า', 'fabricPattern')}

        {/* Pricing */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">ราคาและส่วนลด</h3>
          <div className="grid grid-cols-2 gap-3">
            {field('ราคา/หลา (บาท)', 'priceYard', 'number')}
            {field('ราคา/เมตร (บาท)', 'priceM', 'number')}
            {field('ส่วนลด %', 'discountP', 'number')}
            {field('ส่วนลด/หลา (บาท)', 'discountYard', 'number')}
            {field('คอมมิชชั่น', 'commission', 'number')}
            {field('ยอดสั่ง (เมตร)', 'orderSumM', 'number')}
          </div>
        </div>

        {/* Deadline + comment */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          {field('วันกำหนดส่ง', 'deadlineDate', 'date')}
          <div>
            <label className="block text-xs text-gray-600 mb-1">หมายเหตุ</label>
            <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => router.back()}
            className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">ยกเลิก</button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">
            {saving ? 'กำลังสร้าง...' : 'สร้างใบสั่งขาย'}
          </button>
        </div>
      </form>
    </div>
  )
}
