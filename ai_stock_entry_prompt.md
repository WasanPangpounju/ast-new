# Claude Code Prompt — AI อ่านรูปถ่ายแล้วกรอกฟอร์มอัตโนมัติ
# (คีย์ผ้าเข้าสต็อก + เปิดบิลผ้า)

> วิธีใช้: เปิด Claude Code แล้ว paste prompt ทั้งหมดนี้

---

## UX DESIGN (อย่าเปลี่ยน)

- ปุ่ม "อ่านจากรูปถ่าย" อยู่บนหน้าเดิม ไม่สร้างหน้าใหม่
- คลิกปุ่ม → modal เปิดขึ้น → upload รูป → AI อ่าน → modal ปิด → ฟอร์มเดิมถูกกรอกอัตโนมัติ
- field ที่ AI กรอก: แสดง border สีฟ้า + badge "AI กรอก"
- field ที่ AI ไม่มั่นใจ (เช่น ชื่อลูกค้า): แสดง border สีส้ม + badge "ตรวจสอบ"
- พนักงานแก้ไขได้ทุก field แล้วกดปุ่มบันทึกเดิมตามปกติ
- ปุ่มบันทึกเดิมไม่เปลี่ยน ทำงานเหมือนเดิมทุกอย่าง

---

## STEP 0 — READ EXISTING CODE ก่อนเขียนอะไรทั้งหมด

รัน commands เหล่านี้แล้วแสดง output ทั้งหมด:

```bash
# 1. Schema
grep -A 50 "model StockFabric" prisma/schema.prisma
grep -A 30 "model Supplier" prisma/schema.prisma 2>/dev/null || echo "NO Supplier model"
grep -A 30 "model Customer" prisma/schema.prisma 2>/dev/null || echo "NO Customer model"

# 2. หน้าคีย์ผ้าเข้าสต็อก
find src -type f -name "*.tsx" | xargs grep -l "StockFabric\|stock.*entry\|stockfabric" 2>/dev/null | head -10
cat src/app/\(dashboard\)/warehouse/stock/create/StockCreateForm.tsx 2>/dev/null || \
cat src/app/\(dashboard\)/warehouse/stock/page.tsx 2>/dev/null | head -80

# 3. หน้าเปิดบิลผ้า
find src -type f -name "*.tsx" | xargs grep -l "bill\|บิล\|Bill" 2>/dev/null | head -10
cat src/app/\(dashboard\)/warehouse/bill/create/page.tsx 2>/dev/null | head -80

# 4. API routes ที่มีอยู่
find src/app/api -name "route.ts" | sort

# 5. AI key
grep -i "anthropic\|openai\|claude\|vision" .env 2>/dev/null || echo "ยังไม่มี AI key ใน .env"

# 6. dependencies ที่มีอยู่
cat package.json | grep -E "anthropic|openai|axios"
```

แสดง output ทั้งหมดก่อนเขียน code ใดๆ

---

## STEP 1 — INSTALL DEPENDENCY

```bash
npm install @anthropic-ai/sdk
```

---

## STEP 2 — เพิ่ม ANTHROPIC_API_KEY ใน .env

Append ต่อท้าย .env (ห้าม overwrite):

```
# AI Vision — อ่านรูปถ่ายใบจดผ้า
ANTHROPIC_API_KEY=your_key_here
```

แจ้งผู้ใช้: "กรุณาแทนที่ your_key_here ด้วย Anthropic API Key จริงจาก console.anthropic.com"

---

## STEP 3 — สร้าง AI Vision API route

สร้างไฟล์: `src/app/api/ai/read-fabric-photo/route.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const STOCK_IN_PROMPT = `
You are reading a Thai fabric warehouse intake sheet (ใบรับผ้าเข้าสต็อก).
The sheet is a repeating table — same columns every time.

Return ONLY valid JSON, no markdown fences, no explanation:

{
  "docType": "stock_in",
  "fabricCode": "รหัสผ้า string or null",
  "fabricStruct": "โครงสร้างผ้า string or null",
  "fabricPattern": "ลายผ้า string or null",
  "fabricW": "ความกว้าง string or null",
  "customer": "ชื่อลูกค้า/เจ้าของ — ถ้าไม่มีให้ใส่ AST",
  "createDate": "YYYY-MM-DD",
  "rows": [{ "seq": 1, "yards": 123 }],
  "totalFolds": 50,
  "totalYards": 5882,
  "confidence": {
    "fabricCode": "high|medium|low",
    "customer": "high|medium|low",
    "totalYards": "high|medium|low"
  },
  "notes": "string or null"
}

Rules:
- rows = each bolt/fold with yard count
- totalYards must equal sum of rows[].yards — verify this
- Numbers must be number type not string
- confidence: high=clearly visible, medium=inferred, low=uncertain
`

const BILL_PROMPT = `
You are reading a Thai fabric supplier invoice or delivery note (ใบส่งสินค้า / บิลผ้า).
The sheet is a repeating table — same columns every time.

Return ONLY valid JSON, no markdown fences, no explanation:

{
  "docType": "bill",
  "billRef": "เลขที่บิล string or null",
  "supplier": "ชื่อซัพพลายเออร์ or null",
  "customer": "ผู้สั่ง/Order by string or null",
  "customerId": "รหัสลูกค้า e.g. C651 or null",
  "fabricCode": "รหัสผ้า string or null",
  "fabricStruct": "โครงสร้างผ้า string or null",
  "fabricW": "ความกว้าง string or null",
  "createDate": "YYYY-MM-DD",
  "rows": [{ "seq": 1, "yards": 123 }],
  "totalFolds": 50,
  "totalYards": 5882,
  "pricePerYard": null,
  "confidence": {
    "billRef": "high|medium|low",
    "supplier": "high|medium|low",
    "customer": "high|medium|low",
    "totalYards": "high|medium|low"
  },
  "notes": "string or null"
}

Rules:
- rows = each bolt/fold with yard count
- totalYards must equal sum of rows[].yards
- pricePerYard: extract if shown, else null
- Numbers must be number type not string
`

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    const docType = (formData.get('docType') as string) || 'stock_in'

    if (!file) {
      return NextResponse.json({ error: 'ไม่พบรูปภาพ' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'
    const prompt = docType === 'bill' ? BILL_PROMPT : STOCK_IN_PROMPT

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    if (parsed.rows?.length) {
      const computed = parsed.rows.reduce((s: number, r: { yards: number }) => s + (r.yards || 0), 0)
      parsed._computedTotal = computed
      parsed._totalMatch = Math.abs(computed - (parsed.totalYards || 0)) < 1
    }

    return NextResponse.json({ success: true, data: parsed })
  } catch (err: unknown) {
    console.error('AI read error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI อ่านไม่สำเร็จ' },
      { status: 500 }
    )
  }
}
```

---

## STEP 4 — สร้าง reusable hook

สร้างไฟล์: `src/hooks/useAiPhotoRead.ts`

```typescript
import { useState } from 'react'

export type AiDocType = 'stock_in' | 'bill'

export interface AiReadResult {
  docType: AiDocType
  fabricCode?: string | null
  fabricStruct?: string | null
  fabricPattern?: string | null
  fabricW?: string | null
  customer?: string | null
  createDate?: string | null
  rows?: { seq: number; yards: number }[]
  totalFolds?: number | null
  totalYards?: number | null
  _computedTotal?: number
  _totalMatch?: boolean
  billRef?: string | null
  supplier?: string | null
  customerId?: string | null
  pricePerYard?: number | null
  confidence?: Record<string, 'high' | 'medium' | 'low'>
  notes?: string | null
}

export function useAiPhotoRead() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AiReadResult | null>(null)

  async function readPhoto(file: File, docType: AiDocType): Promise<AiReadResult | null> {
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('docType', docType)
      const res = await fetch('/api/ai/read-fabric-photo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'AI อ่านไม่สำเร็จ')
      setResult(json.data)
      return json.data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
      return null
    } finally {
      setLoading(false)
    }
  }

  function reset() { setResult(null); setError(null) }

  return { readPhoto, loading, error, result, reset }
}
```

---

## STEP 5 — สร้าง AiPhotoModal component

สร้างไฟล์: `src/components/AiPhotoModal.tsx`

```typescript
'use client'
import { useState, useRef, useCallback } from 'react'
import { useAiPhotoRead, AiDocType, AiReadResult } from '@/hooks/useAiPhotoRead'

interface AiPhotoModalProps {
  isOpen: boolean
  onClose: () => void
  docType: AiDocType
  onResult: (data: AiReadResult) => void
}

export default function AiPhotoModal({ isOpen, onClose, docType, onResult }: AiPhotoModalProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { readPhoto, loading, error } = useAiPhotoRead()

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('image/')) handleFile(f)
  }, [handleFile])

  async function handleRead() {
    if (!file) return
    const data = await readPhoto(file, docType)
    if (data) {
      onResult(data)
      onClose()
      setPreview(null)
      setFile(null)
    }
  }

  function handleClose() {
    setPreview(null)
    setFile(null)
    onClose()
  }

  if (!isOpen) return null

  const docLabel = docType === 'stock_in' ? 'ใบจดผ้าเข้าสต็อก' : 'บิล/ใบส่งสินค้า'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: '12px',
          border: '0.5px solid var(--color-border-tertiary)',
          padding: '1.5rem',
          width: '100%', maxWidth: '480px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 500, fontSize: '15px' }}>อ่านจากรูปถ่าย</p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>{docLabel}</p>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }} aria-label="ปิด">×</button>
        </div>

        {!preview ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#185FA5' : 'var(--color-border-secondary)'}`,
              borderRadius: '8px', padding: '2rem', textAlign: 'center', cursor: 'pointer',
              background: dragging ? '#E6F1FB' : 'transparent',
              marginBottom: '1rem',
            }}
          >
            <p style={{ margin: '0 0 4px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>ลากรูปมาวาง หรือคลิกเลือกไฟล์</p>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-tertiary)' }}>JPG, PNG — รูปถ่ายจากมือถือ</p>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <img src={preview} alt="รูปที่เลือก" style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', borderRadius: '8px', border: '0.5px solid var(--color-border-tertiary)' }} />
            <button onClick={() => { setPreview(null); setFile(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
              เลือกรูปใหม่
            </button>
          </div>
        )}

        {error && (
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--color-text-danger)', padding: '8px 12px', background: 'var(--color-background-danger)', borderRadius: '6px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={handleClose}
            style={{ padding: '7px 16px', fontSize: '13px', borderRadius: '8px', border: '0.5px solid var(--color-border-tertiary)', background: 'transparent', cursor: 'pointer' }}>
            ยกเลิก
          </button>
          <button onClick={handleRead} disabled={!file || loading}
            style={{
              padding: '7px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '8px', border: 'none',
              cursor: file && !loading ? 'pointer' : 'not-allowed',
              background: file && !loading ? '#E6F1FB' : 'var(--color-background-secondary)',
              color: file && !loading ? '#0C447C' : 'var(--color-text-tertiary)',
            }}>
            {loading ? 'AI กำลังอ่าน...' : 'ให้ AI อ่านข้อมูล'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

## STEP 6 — เพิ่ม AI ใน หน้าคีย์ผ้าเข้าสต็อก

อ่านไฟล์จริงก่อน:

```bash
cat src/app/\(dashboard\)/warehouse/stock/create/StockCreateForm.tsx
```

แก้ไขไฟล์นั้น (ห้ามสร้างใหม่) เพิ่ม 4 อย่าง:

**A) Import เพิ่ม:**
```typescript
import { useState } from 'react'
import AiPhotoModal from '@/components/AiPhotoModal'
import { AiReadResult } from '@/hooks/useAiPhotoRead'
```

**B) State เพิ่มใน component:**
```typescript
const [aiModalOpen, setAiModalOpen] = useState(false)
const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())
const [aiLowConfidence, setAiLowConfidence] = useState<Set<string>>(new Set())
```

**C) Handler + helper (ดู field names จริงจาก useForm/Zod schema ก่อน แล้ว map ให้ถูก):**
```typescript
function handleAiResult(data: AiReadResult) {
  const filled = new Set<string>()
  const lowConf = new Set<string>()

  // แก้ชื่อ field ให้ตรงกับ form จริง
  if (data.fabricCode != null)    { setValue('fabricCode', data.fabricCode);       filled.add('fabricCode') }
  if (data.fabricStruct != null)  { setValue('fabricStruct', data.fabricStruct);   filled.add('fabricStruct') }
  if (data.fabricPattern != null) { setValue('fabricPattern', data.fabricPattern); filled.add('fabricPattern') }
  if (data.fabricW != null)       { setValue('fabricW', data.fabricW);             filled.add('fabricW') }
  if (data.customer != null)      { setValue('customer', data.customer);           filled.add('customer') }
  if (data.createDate != null)    { setValue('createDate', data.createDate);       filled.add('createDate') }

  if (data.confidence) {
    Object.entries(data.confidence).forEach(([key, val]) => {
      if (val === 'low' || val === 'medium') lowConf.add(key)
    })
  }
  setAiFilledFields(filled)
  setAiLowConfidence(lowConf)
}

function getInputStyle(fieldName: string): React.CSSProperties {
  if (aiLowConfidence.has(fieldName)) return { borderColor: '#BA7517', background: '#FAEEDA' }
  if (aiFilledFields.has(fieldName))  return { borderColor: '#185FA5', background: '#E6F1FB' }
  return {}
}
```

**D) เพิ่มที่ header ฟอร์ม (ก่อน `<form>`):**
```tsx
<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', gap: '8px', alignItems: 'center' }}>
  {aiFilledFields.size > 0 && (
    <>
      <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', background: '#E6F1FB', color: '#0C447C' }}>
        AI กรอก {aiFilledFields.size} field
      </span>
      {aiLowConfidence.size > 0 && (
        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '6px', background: '#FAEEDA', color: '#633806' }}>
          ตรวจสอบ {aiLowConfidence.size} field (สีส้ม)
        </span>
      )}
    </>
  )}
  <button type="button" onClick={() => setAiModalOpen(true)}
    style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 500, borderRadius: '8px', border: '0.5px solid #185FA5', background: '#E6F1FB', color: '#0C447C', cursor: 'pointer' }}>
    📷 อ่านจากรูปถ่าย
  </button>
</div>

<AiPhotoModal
  isOpen={aiModalOpen}
  onClose={() => setAiModalOpen(false)}
  docType="stock_in"
  onResult={handleAiResult}
/>
```

**E) ใส่ style บน inputs ที่ AI fill ได้:**
```tsx
<input {...register('fabricCode')}    style={getInputStyle('fabricCode')} />
<input {...register('fabricStruct')}  style={getInputStyle('fabricStruct')} />
<input {...register('customer')}      style={getInputStyle('customer')} />
<input {...register('createDate')}    style={getInputStyle('createDate')} />
```

---

## STEP 7 — เพิ่ม AI ใน หน้าเปิดบิลผ้า

```bash
# อ่านไฟล์จริงก่อน
cat src/app/\(dashboard\)/warehouse/bill/create/page.tsx
```

ทำเหมือน STEP 6 ทุกอย่าง เปลี่ยนเฉพาะ:
- `docType="bill"` ใน `<AiPhotoModal>`
- field mapping เพิ่ม: `billRef`, `supplier`, `customerId`, `pricePerYard`
- map ชื่อ field ให้ตรงกับ form จริงของหน้าบิล

---

## STEP 8 — BUILD และ TEST

```bash
npm run build 2>&1 | tail -40
```

แก้ TypeScript errors ทั้งหมดก่อน จากนั้น:

```bash
npm run dev
```

ทดสอบ:
1. หน้าคีย์ผ้าเข้าสต็อก → เห็นปุ่ม "📷 อ่านจากรูปถ่าย" มุมขวาบน
2. คลิก → modal เปิด → เลือกรูป → กด "ให้ AI อ่าน"
3. modal ปิด → ฟอร์มถูกกรอก + fields สีฟ้า/ส้ม
4. แก้ไขได้ → กดบันทึกปกติ

---

## กฎที่ต้องทำตามเสมอ

1. อ่านไฟล์ก่อนแก้ทุกครั้ง — ห้าม guess field names
2. ห้ามสร้างหน้าใหม่ — เพิ่มลงหน้าเดิมเท่านั้น
3. ห้ามแก้ปุ่มบันทึกเดิม
4. ห้าม run prisma migrate
5. แสดง output ทุก step
6. ถ้า field ใน AI result ไม่มีใน form — ข้ามไป อย่า error
