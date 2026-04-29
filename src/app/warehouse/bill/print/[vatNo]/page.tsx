'use client'
import { useState, useEffect, use } from 'react'

interface Roll {
  id: number
  fold: number | null
  sumYard: number | null
  vatType: string
  vatNo: number
  customerName: string | null
  receiveName: string | null
  fabricStruct: string | null
  fabricPattern: string | null
  fabricW: string | null
  createDate: string | null
}

const COLS = 8
const ROWS_PER_COL = 20

export default function BillPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ vatNo: string }>
  searchParams: Promise<{ vatType?: string }>
}) {
  const { vatNo } = use(params)
  const { vatType = 'A' } = use(searchParams)
  const [rolls, setRolls] = useState<Roll[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/warehouse/bill/${vatNo}?vatType=${vatType}`)
      .then(r => r.json())
      .then(d => setRolls(d.rolls ?? []))
      .finally(() => setLoading(false))
  }, [vatNo, vatType])

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">กำลังโหลด...</div>
  if (rolls.length === 0) return <div className="flex items-center justify-center h-screen text-gray-400">ไม่พบข้อมูลบิล</div>

  const first = rolls[0]
  const totalFold = rolls.length
  const totalYard = rolls.reduce((s, r) => s + (Number(r.sumYard) || 0), 0)

  const slots: (Roll | null)[] = Array(COLS * ROWS_PER_COL).fill(null)
  rolls.forEach((r, i) => { if (i < slots.length) slots[i] = r })

  const colSums = Array.from({ length: COLS }, (_, c) =>
    slots.slice(c * ROWS_PER_COL, (c + 1) * ROWS_PER_COL)
      .reduce((s, r) => s + (Number(r?.sumYard) || 0), 0)
  )

  const fmtDate = (d: string | null) => {
    if (!d) return '-'
    try {
      const dt = new Date(d)
      return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear() + 543}`
    } catch { return '-' }
  }

  return (
    <div className="min-h-screen bg-white p-6 print:p-4">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex gap-3 mb-4">
        <button
          onClick={() => window.print()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          🖨 พิมพ์ใบส่งสินค้า
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
        >
          ปิด
        </button>
      </div>

      <div className="border border-gray-400 max-w-5xl mx-auto">
        <div className="border-b border-gray-400 p-3 text-center">
          <h1 className="text-xl font-bold">ใบส่งสินค้า / Delivery Note</h1>
          <p className="text-lg font-semibold mt-1">เลขที่ {vatType} - {vatNo}</p>
        </div>

        <div className="grid grid-cols-2 border-b border-gray-400">
          <div className="p-3 border-r border-gray-400">
            <span className="text-sm font-medium">ผู้สั่ง Order by : </span>
            <span className="text-sm">{first.customerName ?? '-'}</span>
          </div>
          <div className="p-3">
            <span className="text-sm font-medium">ผู้รับ Received by : </span>
            <span className="text-sm">{first.receiveName ?? '-'}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-gray-400">
          <div className="p-3 border-r border-gray-400">
            <span className="text-sm font-medium">รหัสผ้า Code : </span>
            <span className="text-sm">{first.fabricStruct ?? ''} {first.fabricW ?? ''}{first.fabricW ? "''" : ''} {first.fabricPattern ?? ''}</span>
          </div>
          <div className="p-3">
            <span className="text-sm font-medium">วันที่ Date : </span>
            <span className="text-sm">{fmtDate(first.createDate)}</span>
          </div>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              {Array.from({ length: COLS }, (_, c) => (
                <th key={c} colSpan={2} className="border border-gray-400 px-1 py-1 text-center font-medium">
                  ลำดับ&nbsp;&nbsp;&nbsp;หลา
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS_PER_COL }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: COLS }, (_, c) => {
                  const roll = slots[c * ROWS_PER_COL + r]
                  const slotNo = c * ROWS_PER_COL + r + 1
                  return (
                    <td key={c} colSpan={2} className="border border-gray-300 px-1 py-0.5">
                      <div className="flex justify-between min-h-[18px]">
                        <span className="text-gray-400 w-6 text-right">{slotNo}</span>
                        <span className="font-medium ml-1">{roll?.sumYard ? Number(roll.sumYard).toLocaleString() : ''}</span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              {Array.from({ length: COLS }, (_, c) => (
                <td key={c} colSpan={2} className="border border-gray-400 px-1 py-1 text-center text-xs">
                  รวม {colSums[c] > 0 ? colSums[c].toLocaleString() : 0}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <div className="border-t border-gray-400 p-3 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-semibold">รวม Total</span>
            <span className="ml-4 font-bold text-lg">{totalFold} พับ</span>
            <span className="text-gray-500 ml-1 text-sm">Pieces</span>
            <span className="ml-6 font-bold text-lg">{totalYard.toLocaleString()} หลา</span>
            <span className="text-gray-500 ml-1 text-sm">Yards</span>
          </div>
          <div className="text-xs text-gray-500">☐ ตัวอย่างผ้า Sample</div>
        </div>

        <div className="border-t border-gray-400 p-3">
          <p className="text-sm">ลงชื่อประทับตรา Authorize Signature_____________________________________________</p>
        </div>

        <div className="border-t border-gray-400 p-3">
          <p className="text-xs font-medium">หมายเหตุ</p>
          <p className="text-xs text-gray-600">ได้รับผ้าตามรายการข้างบนนี้ไว้ถูกต้องและเรียบร้อยแล้ว</p>
          <p className="text-xs text-gray-600">Received the above goods in good order and condition</p>
        </div>
      </div>
    </div>
  )
}
