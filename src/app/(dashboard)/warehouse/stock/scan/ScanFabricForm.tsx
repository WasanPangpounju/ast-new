'use client'
import { useState, useRef, useCallback } from 'react'

type LookupStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'multiple'

type FabricOption = {
  fabricCode: string | null
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  customer: string
}

type ReviewFabric = {
  id: string
  section: string
  customer: string
  code: string
  rollsText: string
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  lookupStatus: LookupStatus
  lookupOptions: FabricOption[]
}

type ScannedFabric = {
  section: string
  customer: string
  code: string
  rolls: number[]
}

function parseRolls(text: string): number[] {
  return text.split(/[,\s]+/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0)
}

function newRow(): ReviewFabric {
  return {
    id: crypto.randomUUID(),
    section: 'TR',
    customer: '',
    code: '',
    rollsText: '',
    fabricStruct: '',
    fabricPattern: '',
    fabricW: '',
    lookupStatus: 'idle',
    lookupOptions: [],
  }
}

interface Props { emp: string }

export default function ScanFabricForm({ emp }: Props) {
  const [step, setStep] = useState<'upload' | 'review'>('upload')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [createDate, setCreateDate] = useState(new Date().toISOString().slice(0, 10))
  const [fabrics, setFabrics] = useState<ReviewFabric[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [showImages, setShowImages] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!arr.length) return
    setImageFiles(prev => [...prev, ...arr])
    arr.forEach(f => setImagePreviews(prev => [...prev, URL.createObjectURL(f)]))
  }, [])

  function removeImage(i: number) {
    URL.revokeObjectURL(imagePreviews[i])
    setImageFiles(prev => prev.filter((_, idx) => idx !== i))
    setImagePreviews(prev => prev.filter((_, idx) => idx !== i))
  }

  function clearAll() {
    imagePreviews.forEach(url => URL.revokeObjectURL(url))
    setImageFiles([])
    setImagePreviews([])
  }

  async function handleScan() {
    if (!imageFiles.length) return
    setScanning(true)
    try {
      const fd = new FormData()
      imageFiles.forEach(f => fd.append('images', f))
      const res = await fetch('/api/ai/scan-fabric-sheets', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'สแกนไม่สำเร็จ')
      setFabrics(
        (data.fabrics ?? []).map((f: ScannedFabric) => ({
          ...newRow(),
          id: crypto.randomUUID(),
          section: f.section ?? 'TR',
          customer: f.customer ?? '',
          code: f.code ?? '',
          rollsText: (f.rolls ?? []).join(', '),
        }))
      )
      setStep('review')
    } catch (err: unknown) {
      alert('เกิดข้อผิดพลาด: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setScanning(false)
    }
  }

  const updateFabric = (id: string, updates: Partial<ReviewFabric>) =>
    setFabrics(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))

  function applyOption(id: string, opt: FabricOption) {
    updateFabric(id, {
      fabricStruct: opt.fabricStruct ?? '',
      fabricPattern: opt.fabricPattern ?? '',
      fabricW: opt.fabricW ?? '',
      lookupStatus: 'found',
      lookupOptions: [],
    })
  }

  async function lookupFabric(id: string, code: string) {
    if (!code.trim()) return
    updateFabric(id, { lookupStatus: 'loading', lookupOptions: [] })
    try {
      const res = await fetch(`/api/warehouse/stock/fabric-lookup?q=${encodeURIComponent(code.trim())}`)
      const data = await res.json()
      const results: FabricOption[] = data.results ?? []

      if (results.length === 0) {
        updateFabric(id, { lookupStatus: 'not_found' })
      } else if (results.length === 1) {
        applyOption(id, results[0])
      } else {
        // Check for exact fabricCode match first
        const exact = results.find(r => r.fabricCode?.toLowerCase() === code.trim().toLowerCase())
        if (exact) {
          applyOption(id, exact)
        } else {
          updateFabric(id, { lookupStatus: 'multiple', lookupOptions: results })
        }
      }
    } catch {
      updateFabric(id, { lookupStatus: 'not_found' })
    }
  }

  async function handleSubmitAll() {
    const toSubmit = fabrics.filter(f => f.fabricStruct.trim() && parseRolls(f.rollsText).length > 0)
    const skipped = fabrics.length - toSubmit.length
    if (!toSubmit.length) {
      alert('ไม่มีรายการที่พร้อมบันทึก (ต้องมีโครงสร้างผ้าและค่าพับอย่างน้อย 1 รายการ)')
      return
    }
    if (skipped > 0 && !window.confirm(`มี ${skipped} รายการที่ข้อมูลไม่ครบ จะข้ามและบันทึกเฉพาะ ${toSubmit.length} รายการที่ครบ?`)) return

    setSubmitting(true)
    let totalCount = 0
    const errors: string[] = []

    for (const fabric of toSubmit) {
      try {
        const res = await fetch('/api/warehouse/stock/entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fabricStruct: fabric.fabricStruct,
            fabricPattern: fabric.fabricPattern,
            fabricW: fabric.fabricW,
            fabricCode: fabric.code,
            customer: fabric.customer || 'AST',
            emp,
            createDate,
            yards: parseRolls(fabric.rollsText).map(String),
          }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'บันทึกไม่สำเร็จ')
        totalCount += d.count
      } catch (err: unknown) {
        const label = fabric.code || fabric.customer || `รายการที่ ${fabrics.indexOf(fabric) + 1}`
        errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    setSubmitting(false)

    if (errors.length) {
      alert(`บันทึกสำเร็จ ${totalCount} พับ\nผิดพลาด ${errors.length} รายการ:\n${errors.join('\n')}`)
    } else {
      alert(`บันทึกสำเร็จทั้งหมด ${totalCount} พับ จาก ${toSubmit.length} รายการ`)
      clearAll()
      setFabrics([])
      setStep('upload')
    }
  }

  // ── Upload step ──────────────────────────────────────────────────────────────

  if (step === 'upload') {
    return (
      <div className="p-4 max-w-3xl">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900">สแกนรูปคีย์ผ้าเข้าสต็อก</h1>
          <p className="text-xs text-gray-500">อัปโหลดรูปใบบันทึกการทอผ้าเพื่ออ่านข้อมูลด้วย AI</p>
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4
            ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        >
          <div className="text-4xl mb-2">📷</div>
          <p className="text-sm text-gray-600 font-medium">คลิกหรือลากรูปมาวางที่นี่</p>
          <p className="text-xs text-gray-400 mt-1">รองรับ JPEG, PNG, WebP — อัปโหลดได้หลายรูปพร้อมกัน</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        {imagePreviews.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
            {imagePreviews.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt="" className="w-full h-28 object-cover rounded border border-gray-200" />
                <button
                  onClick={e => { e.stopPropagation(); removeImage(i) }}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs items-center justify-center hidden group-hover:flex">
                  ×
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-0.5 rounded-b">
                  รูปที่ {i + 1}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleScan}
            disabled={!imageFiles.length || scanning}
            className="px-6 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50">
            {scanning ? 'กำลังสแกน...' : `สแกน AI (${imageFiles.length} รูป)`}
          </button>
          {imageFiles.length > 0 && !scanning && (
            <button onClick={clearAll}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">
              ล้างรูป
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Review step ──────────────────────────────────────────────────────────────

  const readyCount = fabrics.filter(f => f.fabricStruct.trim() && parseRolls(f.rollsText).length > 0).length

  return (
    <div className="p-4 max-w-full">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">ตรวจสอบข้อมูลจากรูปสแกน</h1>
          <p className="text-xs text-gray-500">ตรวจสอบและแก้ไขข้อมูลก่อนบันทึก</p>
        </div>
        <button onClick={() => setStep('upload')}
          className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
          ← กลับอัปโหลดรูป
        </button>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">วันที่บันทึก</label>
            <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 flex items-end gap-3 flex-wrap">
            <span className="text-sm text-gray-500">พบ {fabrics.length} รายการ</span>
            {imagePreviews.length > 0 && (
              <button onClick={() => setShowImages(v => !v)} className="text-xs text-blue-600 underline">
                {showImages ? 'ซ่อนรูปต้นฉบับ' : `แสดงรูปต้นฉบับ (${imagePreviews.length} รูป)`}
              </button>
            )}
          </div>
        </div>
        {showImages && imagePreviews.length > 0 && (
          <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
            {imagePreviews.map((url, i) => (
              <img key={i} src={url} alt={`รูปที่ ${i + 1}`}
                className="w-full h-20 object-cover rounded border border-gray-200 cursor-pointer hover:opacity-80"
                onClick={() => window.open(url, '_blank')} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 mb-4">
        {fabrics.map((fabric, i) => {
          const rolls = parseRolls(fabric.rollsText)
          const totalFold = rolls.length
          const totalYard = rolls.reduce((a, b) => a + b, 0)

          return (
            <div key={fabric.id} className="bg-white border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm text-gray-700">รายการที่ {i + 1}</span>
                <div className="flex items-center gap-2">
                  {totalFold > 0 && (
                    <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">
                      {totalFold} พับ / {totalYard.toLocaleString(undefined, { maximumFractionDigits: 2 })} หลา
                    </span>
                  )}
                  <button onClick={() => setFabrics(prev => prev.filter(f => f.id !== fabric.id))}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1">
                    ลบ
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ประเภท</label>
                  <select value={fabric.section}
                    onChange={e => updateFabric(fabric.id, { section: e.target.value })}
                    className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="TR">TR</option>
                    <option value="COTTON">COTTON</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ลูกค้า</label>
                  <input value={fabric.customer}
                    onChange={e => updateFabric(fabric.id, { customer: e.target.value })}
                    placeholder="ชื่อลูกค้า"
                    className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">รหัสผ้า</label>
                  <div className="flex gap-1">
                    <input value={fabric.code}
                      onChange={e => updateFabric(fabric.id, { code: e.target.value, lookupStatus: 'idle', lookupOptions: [] })}
                      placeholder="เช่น TR16/7864 2/2"
                      className="flex-1 border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => lookupFabric(fabric.id, fabric.code)}
                      disabled={!fabric.code.trim() || fabric.lookupStatus === 'loading'}
                      className="px-3 py-1.5 text-sm border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-40 whitespace-nowrap">
                      {fabric.lookupStatus === 'loading' ? '...' : 'ค้นหา'}
                    </button>
                  </div>

                  {/* Status messages */}
                  {fabric.lookupStatus === 'found' && (
                    <p className="text-xs text-green-600 mt-0.5">พบข้อมูลในระบบ</p>
                  )}
                  {fabric.lookupStatus === 'not_found' && (
                    <p className="text-xs text-orange-500 mt-0.5">ไม่พบรหัสนี้ — กรุณากรอกข้อมูลผ้าด้านล่างเอง</p>
                  )}
                  {fabric.lookupStatus === 'multiple' && (
                    <p className="text-xs text-blue-600 mt-0.5">พบ {fabric.lookupOptions.length} รายการ — เลือกรายการที่ถูกต้อง</p>
                  )}

                  {/* Multiple results picker */}
                  {fabric.lookupStatus === 'multiple' && fabric.lookupOptions.length > 0 && (
                    <div className="mt-1 border border-blue-200 bg-white shadow-sm max-h-48 overflow-y-auto">
                      {fabric.lookupOptions.map((opt, oi) => (
                        <button key={oi} type="button"
                          onMouseDown={() => applyOption(fabric.id, opt)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-gray-100 last:border-0">
                          <div className="font-medium text-gray-800">{opt.fabricStruct}</div>
                          <div className="text-gray-500 flex gap-3 mt-0.5">
                            <span>{opt.fabricPattern || '-'}</span>
                            <span>หน้า: {opt.fabricW || '-'}</span>
                            {opt.fabricCode && <span className="text-blue-600 font-mono">{opt.fabricCode}</span>}
                            <span className="text-gray-400">{opt.customer}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    โครงสร้างผ้า <span className="text-red-500">*</span>
                  </label>
                  <input value={fabric.fabricStruct}
                    onChange={e => updateFabric(fabric.id, { fabricStruct: e.target.value })}
                    placeholder="โครงสร้างผ้า"
                    className={`w-full border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${!fabric.fabricStruct.trim() ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ลายผ้า</label>
                  <input value={fabric.fabricPattern}
                    onChange={e => updateFabric(fabric.id, { fabricPattern: e.target.value })}
                    placeholder="ลายผ้า"
                    className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">หน้ากว้าง (นิ้ว)</label>
                  <input value={fabric.fabricW}
                    onChange={e => updateFabric(fabric.id, { fabricW: e.target.value })}
                    placeholder="หน้ากว้าง"
                    className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  ค่าพับ (คั่นด้วยจุลภาคหรือช่องว่าง)
                </label>
                <textarea value={fabric.rollsText}
                  onChange={e => updateFabric(fabric.id, { rollsText: e.target.value })}
                  rows={2}
                  placeholder="เช่น 122, 135, 125, 130"
                  className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setFabrics(prev => [...prev, newRow()])}
          className="px-4 py-2 text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">
          + เพิ่มรายการ
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            พร้อมบันทึก {readyCount} / {fabrics.length} รายการ
          </span>
          <button onClick={handleSubmitAll} disabled={submitting || !fabrics.length}
            className="px-6 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50">
            {submitting ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}
          </button>
        </div>
      </div>
    </div>
  )
}
