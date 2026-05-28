'use client'
import { useState, useEffect, use, type ReactNode } from 'react'

interface OrderData {
  id: number
  vat: string
  purchaseOrder: string
  customerName: string | null
  fabricId: string | null
  fabricPattern: string | null
  fabricStructure: string | null
  orderSumYard: number | null
  orderSumM: number | null
  fabricSPY: number | null
  machineNumber: string | null
  note: string | null
  productionNote: string | null
  po: string | null
  createDate: string
  fabricAst: {
    fabricW: string | null
    yarnHCount: string | null
    phewNumber: string | null
    phewW: string | null
    stackType: string | null
  } | null
  fabricAstStructure: {
    yarnHType: string | null
    yarnHType2: string | null
    subNameH1: string | null
    subNameH2: string | null
    yarnWType: string | null
    yarnWType2: string | null
    yarnWType3: string | null
    yarnWType4: string | null
    subNameW1: string | null
    subNameW2: string | null
    subNameW3: string | null
    subNameW4: string | null
    yarnHRatio1: string | null
    yarnWRatio1: string | null
    yarnHCount1: string | null
    yarnHCount2: string | null
    yarnWCount1: string | null
    yarnWCount2: string | null
    yarnWRatio2: string | null
    yarnWRatio3: string | null
  } | null
  orderDeadlines: {
    id: number
    dt: string | null
    label: string | null
    qty: number | null
    unit: string | null
    pct: number | null
  }[]
}

function fmtDate(d: string | null) {
  if (!d) return '-'
  try {
    const dt = new Date(d)
    return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`
  } catch { return '-' }
}

function Row({ label, value, labelClass = '' }: { label: string; value: ReactNode; labelClass?: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className={`font-bold w-36 flex-shrink-0 text-sm ${labelClass}`}>{label} :</span>
      <span className="text-sm flex-1">{value}</span>
    </div>
  )
}

export default function StructurePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/sales/orders/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('ไม่พบข้อมูล')
        return r.json()
      })
      .then(d => setOrder(d.order))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !order) return (
    <div className="flex items-center justify-center min-h-screen text-gray-500">{error || 'ไม่พบข้อมูล'}</div>
  )

  const s = order.fabricAstStructure
  const fa = order.fabricAst
  const isM = s?.yarnWRatio3 === 'm'

  const hRatio1 = s?.yarnHRatio1 && s.yarnHRatio1 !== 'no data' ? s.yarnHRatio1 : null
  const wRatio1 = s?.yarnWRatio1 && s.yarnWRatio1 !== 'no data' ? s.yarnWRatio1 : null
  const showRatioRow = hRatio1 || wRatio1

  const hCount1 = s?.yarnHCount1 ?? ''
  const wCount1 = s?.yarnWCount1 ?? ''

  const warpYarnLine = (() => {
    const parts: string[] = []
    if (s?.yarnHType) parts.push(s.yarnHType)
    if (s?.subNameH1) parts.push(s.subNameH1.replace('บริษัท', '').trim())
    if (s?.yarnHType2) {
      parts.push('+ ' + s.yarnHType2)
      if (s?.subNameH2) parts.push(s.subNameH2.replace('บริษัท', '').replace('จำกัด', '').trim())
    }
    return parts.join(' ')
  })()

  const weftYarnLine = (() => {
    const parts: string[] = []
    if (s?.yarnWType) {
      parts.push(s.yarnWType)
      if (s?.subNameW1) parts.push(s.subNameW1.replace('บริษัท', '').trim())
    }
    if (s?.yarnWType2) {
      parts.push('+ ' + s.yarnWType2)
      if (s?.subNameW2) parts.push(s.subNameW2.replace('บริษัท', '').replace('จำกัด', '').trim())
    }
    if (s?.yarnWType3) {
      parts.push('+ ' + s.yarnWType3)
      if (s?.subNameW3) parts.push(s.subNameW3.replace('บริษัท', '').replace('จำกัด', '').trim())
    }
    if (s?.yarnWType4) {
      parts.push('+ ' + s.yarnWType4)
      if (s?.subNameW4) parts.push(s.subNameW4.replace('บริษัท', '').replace('จำกัด', '').trim())
    }
    return parts.join(' ')
  })()

  const orderQty = (() => {
    const spy = order.fabricSPY ?? 0
    if (isM) {
      const qty = order.orderSumM ?? 0
      const total = spy * (qty / 100) + qty
      return { value: total > 0 ? Math.round(total).toLocaleString() : (qty > 0 ? qty.toLocaleString() : '-'), unit: 'เมตร', raw: qty }
    } else {
      const qty = order.orderSumYard ?? 0
      const total = spy * (qty / 100) + qty
      return { value: total > 0 ? Math.round(total).toLocaleString() : (qty > 0 ? qty.toLocaleString() : '-'), unit: 'หลา', raw: qty }
    }
  })()

  const orderBase = isM
    ? (order.orderSumM ?? 0)
    : (order.orderSumYard ?? 0)

  const patternDisplay = order.fabricPattern?.replace(/\([^)]+\)/g, '') ?? ''
  const note = order.productionNote ?? order.note ?? ''
  const machineType = fa?.stackType ?? ''

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: 10in 6.5in landscape; margin: 5mm 10mm; }
        }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; font-size: 15px; }
      `}</style>

      {/* Print button bar */}
      <div className="no-print bg-gray-100 border-b border-gray-300 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium"
        >
          พิมพ์ / บันทึก PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 border border-gray-300 text-sm rounded hover:bg-gray-50 text-gray-700"
        >
          ปิด
        </button>
        <span className="text-sm text-gray-500 ml-2">ใบโครงสร้าง — {order.purchaseOrder}</span>
      </div>

      {/* Document */}
      <div className="max-w-5xl mx-auto px-8 pt-6 pb-4 bg-white" style={{ minHeight: '90vh' }}>
        {/* Header row */}
        <div className="flex items-baseline gap-6 mb-4 text-base">
          <span className="font-bold">
            ชื่อลูกค้า: {order.customerName?.replace('(สำนักงานใหญ่)', '').trim() ?? '-'}
          </span>
          <span className="font-bold">
            วันที่: {fmtDate(order.createDate)}
          </span>
          <span className="font-bold">
            No.: {order.purchaseOrder}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-8">
          {/* Left column: fabric structure */}
          <div>
            {/* Structure fraction display */}
            <div className="mb-4">
              {showRatioRow && (
                <div className="flex items-center gap-2 text-center mb-1">
                  <div className="flex-1 text-center text-base">{hRatio1 ?? ''}</div>
                  <div className="w-6"></div>
                  <div className="flex-1 text-center text-base">{wRatio1 ?? ''}</div>
                </div>
              )}
              <div
                className="flex items-center gap-2 text-center"
                style={{ borderBottom: '1.5px solid #222', paddingBottom: '3px', marginBottom: '4px' }}
              >
                <div className="flex-1 text-center font-semibold text-base">{hCount1}</div>
                <div className="w-6 text-center font-bold text-lg">x</div>
                <div className="flex-1 text-center font-semibold text-base">{wCount1}</div>
              </div>
              {s?.yarnHCount2 && s?.yarnWCount2 && (
                <div className="flex items-center gap-2 text-center mt-1">
                  <div className="flex-1 text-center text-sm">{s.yarnHCount2}</div>
                  <div className="w-6 text-center">x</div>
                  <div className="flex-1 text-center text-sm">{s.yarnWCount2}</div>
                </div>
              )}
            </div>

            <Row label="หน้ากว้าง" value={fa?.fabricW ? `${fa.fabricW}"` : '-'} />
            <Row label="ลายผ้า" value={patternDisplay || '-'} />
            <Row label="จำนวนด้ายยืน" value={fa?.yarnHCount ?? '-'} />
            <Row label="รหัสผ้า" value={order.fabricId ?? '-'} />
            <Row label="ชนิดด้ายยืน" value={warpYarnLine || '-'} />
            <Row label="ชนิดด้ายพุ่ง" value={weftYarnLine || '-'} />
          </div>

          {/* Right column: specs */}
          <div>
            <Row label="จำนวนด้ายพุ่ง" value={s?.yarnWCount1 ?? '-'} />
            <Row label="หน้าผ้ากว้าง" value={fa?.fabricW ? `${fa.fabricW} นิ้ว` : '-'} />
            <Row label="ฟันหวีเบอร์" value={fa?.phewNumber ?? '-'} />
            <Row label="หน้าหวีกว้าง" value={fa?.phewW ? `${fa.phewW} นิ้ว` : '-'} />
            <Row label="พ่นสีลงผ้า" value={order.vat} />
            <Row
              label="ออร์เดอร์สืบ"
              value={orderQty.raw > 0 ? `${orderQty.value} ${orderQty.unit}` : '-'}
            />
            {order.orderDeadlines.length > 0 && (
              <div className="mt-1">
                <span className="font-bold text-sm">กำหนดส่ง :</span>
                {order.orderDeadlines.map((d, i) => (
                  <div key={d.id} className="text-sm ml-4">
                    {i + 1}. {fmtDate(d.dt)} {d.qty ? `${d.qty.toLocaleString()} ${d.unit ?? 'หลา'}` : ''}{d.pct ? ` (${d.pct}%)` : ''}
                  </div>
                ))}
              </div>
            )}
            <Row label="ชนิดเครื่องทอ" value={machineType || '-'} />
            <Row label="เบอร์เครื่อง" value={order.machineNumber ?? '-'} />
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4 flex gap-2 text-sm">
          <span className="font-bold flex-shrink-0">หมายเหตุ :</span>
          <div>
            {note && note !== 'no data' && <span>{note}</span>}
            {order.vat === 'SOX' && <span className="font-bold"> ราคานี้รวม VAT แล้ว</span>}
            {order.po && order.po !== 'no data' && <span> {order.po}</span>}
            {orderBase > 0 && (
              <span className="ml-2">ออร์เดอร์ : {orderBase.toLocaleString()} {isM ? 'เมตร' : 'หลา'}</span>
            )}
          </div>
        </div>

        {/* Signature line */}
        <div className="grid grid-cols-2 gap-16 mt-10">
          <div>
            <div className="border-b border-gray-500 pb-8"></div>
            <p className="text-sm mt-1 text-center">ผู้สั่งงาน</p>
          </div>
          <div>
            <div className="border-b border-gray-500 pb-8"></div>
            <p className="text-sm mt-1 text-center">ผู้ตรวจสอบ</p>
          </div>
        </div>
      </div>
    </>
  )
}
