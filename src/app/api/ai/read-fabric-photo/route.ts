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
