import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SCAN_PROMPT = `คุณเป็น OCR ผู้เชี่ยวชาญการอ่านใบบันทึกการทอผ้าภาษาไทย

อ่านตารางจากรูปใบบันทึกการทอผ้า แล้วส่งกลับเป็น JSON เท่านั้น
ห้ามมี backtick หรือข้อความอื่นนอกจาก JSON

โครงสร้างใบ:
- หัวกระดาษ: "ผ้า TR" หรือ "ผ้าหนา COTTON" และวันที่
- ตาราง: คอลัมน์ซ้ายสุด = ชื่อลูกค้า, คอลัมน์ถัดไป = รหัสผ้า, คอลัมน์ 1-15 = ค่าความกว้างแต่ละพับ
- ใบหนึ่งอาจมีทั้ง TR (ส่วนบน) และ COTTON (ส่วนล่างใต้แถบสีเหลือง)

format ที่ต้องการ:
{
  "date": "วันที่ที่เห็นในใบ เช่น 2-5-69",
  "fabrics": [
    {
      "section": "TR",
      "customer": "ชื่อลูกค้าจากคอลัมน์แรก",
      "code": "รหัสผ้าจากคอลัมน์ที่สอง",
      "rolls": [122, 135, 125]
    }
  ]
}

กฎสำคัญ:
1. section: แถวที่อยู่เหนือแถบ "ผ้าหนา COTTON" = "TR", ใต้แถบ = "COTTON"
2. rolls = อ่านตัวเลขจากช่องพับ 1-15 ทุกช่องที่มีตัวเลข
3. ลูกค้าเดียวกัน 2 แถวตัวเลข ให้รวม rolls เป็น array เดียว
4. ชื่อลูกค้าและรหัสผ้า: อ่านตามที่เห็นในรูปให้ตรงที่สุด อย่าแปลหรือเดา
5. ถ้าช่องว่าง ให้ใส่ "" (string ว่าง)
6. ส่งเฉพาะ JSON เท่านั้น`

type RawFabric = {
  section: string
  customer: string
  code: string
  rolls: unknown[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const images = formData.getAll('images') as File[]

  if (!images.length) {
    return NextResponse.json({ error: 'ไม่พบรูปภาพ' }, { status: 400 })
  }

  try {
    const results = await Promise.all(
      images.map(async (file) => {
        const bytes = await file.arrayBuffer()
        const base64 = Buffer.from(bytes).toString('base64')
        const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'

        const message = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: SCAN_PROMPT },
            ],
          }],
        })

        const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
        const clean = text.replace(/```json|```/g, '').trim()
        return JSON.parse(clean) as { date: string; fabrics: RawFabric[] }
      })
    )

    const merged = new Map<string, { section: string; customer: string; code: string; rolls: number[] }>()
    for (const result of results) {
      for (const fabric of (result.fabrics ?? [])) {
        const key = `${fabric.section}||${fabric.customer}||${fabric.code}`
        const rolls = (fabric.rolls ?? []).filter((r): r is number => typeof r === 'number' && r > 0)
        if (merged.has(key)) {
          merged.get(key)!.rolls.push(...rolls)
        } else {
          merged.set(key, {
            section: fabric.section ?? 'TR',
            customer: fabric.customer ?? '',
            code: fabric.code ?? '',
            rolls,
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      date: results[0]?.date ?? '',
      fabrics: Array.from(merged.values()),
    })
  } catch (err: unknown) {
    console.error('[scan-fabric-sheets]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'สแกนรูปไม่สำเร็จ' },
      { status: 500 }
    )
  }
}
