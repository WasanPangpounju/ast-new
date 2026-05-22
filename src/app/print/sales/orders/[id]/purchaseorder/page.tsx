'use client'
import { useState, useEffect, use } from 'react'

interface OrderData {
  id: number
  vat: string
  purchaseOrder: string
  customerName: string | null
  payment: string | null
  fabricId: string | null
  fabricPattern: string | null
  fabricStructure: string | null
  orderSumYard: number | null
  orderSumM: number | null
  priceYard: number | null
  priceM: number | null
  discountP: number | null
  surcharge: string | null
  note: string | null
  po: string | null
  createDate: string
  fabricAst: { fabricW: string | null } | null
  fabricAstStructure: {
    yarnHRatio1: string | null
    yarnWRatio1: string | null
    yarnHCount1: string | null
    yarnWCount1: string | null
    yarnHType: string | null
    yarnHType2: string | null
    subNameH1: string | null
    subNameH2: string | null
    yarnWRatio3: string | null
    yarnWRatio4: string | null
  } | null
  orderDeadlines: { id: number; dt: string | null; label: string | null; qty: number | null; unit: string | null }[]
}

interface CustomerData {
  name: string
  address: string | null
  tax: string | null
  tel: string | null
}

const COMPANY = {
  nameTH: 'บริษัท เอเซียเท็กซ์ไทล์ จำกัด',
  nameEN: 'ASIA TEXTILE CO., LTD.',
  address: '789 หมู่ที่ 2 ซอยบางเมฆขาว ถนนสุขุมวิท ตำบลท้ายบ้าน อำเภอเมืองสมุทรปราการ จังหวัดสมุทรปราการ 10280',
  tel: '02-3892281-3',
  fax: '02-3892280',
  email: 's_asiatextile@gmail.com',
  tax: '0115531002270',
}

function fmt2(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmt3(n: number) {
  return n.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtDate(d: string) {
  try {
    const dt = new Date(d)
    return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear() + 543}`
  } catch { return '-' }
}

export default function PurchaseOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [order, setOrder] = useState<OrderData | null>(null)
  const [customer, setCustomer] = useState<CustomerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/sales/orders/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('ไม่พบข้อมูล')
        return r.json()
      })
      .then(d => {
        setOrder(d.order)
        setCustomer(d.customer ?? null)
      })
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

  const typetag = order.fabricAstStructure?.yarnWRatio3 ?? ''
  const isM = typetag === 'm'
  const surchargeRaw = order.surcharge ?? order.fabricAstStructure?.yarnWRatio4 ?? null
  const surcharge = surchargeRaw ? parseFloat(surchargeRaw) : null
  const isSurchargeValid = surcharge !== null && !isNaN(surcharge) && surcharge > 0

  const qty = isM ? (order.orderSumM ?? 0) : (order.orderSumYard ?? 0)
  const unitPrice = isM ? (order.priceM ?? 0) : (order.priceYard ?? 0)
  let baseTotal = qty * unitPrice
  if (isSurchargeValid) baseTotal += surcharge!

  const discountPct = order.discountP ?? 0
  const discountAmt = baseTotal * (discountPct / 100)
  const afterDiscount = baseTotal - discountAmt
  const vatAmt = order.vat === 'SO' ? afterDiscount * 0.07 : 0
  const grandTotal = afterDiscount + vatAmt

  const hRatio1 = order.fabricAstStructure?.yarnHRatio1
  const wRatio1 = order.fabricAstStructure?.yarnWRatio1
  const hCount1 = order.fabricAstStructure?.yarnHCount1
  const wCount1 = order.fabricAstStructure?.yarnWCount1
  const showRatioRow = (hRatio1 && hRatio1 !== 'no data') || (wRatio1 && wRatio1 !== 'no data')

  const yarnDesc = (() => {
    const parts: string[] = []
    if (order.fabricAstStructure?.yarnHType) parts.push(order.fabricAstStructure.yarnHType)
    if (order.fabricAstStructure?.yarnHType2) parts.push(order.fabricAstStructure.yarnHType2)
    return parts.join(' + ')
  })()

  const fabricW = order.fabricAst?.fabricW ?? ''

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: A4; margin: 10mm 15mm; }
        }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; }
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
        <span className="text-sm text-gray-500 ml-2">ใบสั่งขาย — {order.purchaseOrder}</span>
      </div>

      {/* Document */}
      <div className="max-w-[210mm] mx-auto p-8 bg-white">
        {/* Header */}
        {order.vat !== 'SOB' ? (
          <div className="flex gap-4 mb-2">
            <div className="flex-shrink-0">
              <div className="w-20 h-20 bg-blue-700 flex items-center justify-center text-white font-bold text-xl rounded">
                AST
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-blue-900">{COMPANY.nameTH}</h1>
              <p className="text-base font-semibold text-gray-700">{COMPANY.nameEN}</p>
              <p className="text-xs text-gray-600 mt-1">{COMPANY.address}</p>
              <p className="text-xs text-gray-600">โทร : {COMPANY.tel} &nbsp;|&nbsp; แฟกซ์ {COMPANY.fax} &nbsp;|&nbsp; Email : {COMPANY.email}</p>
              <p className="text-xs text-gray-600">เลขประจำตัวผู้เสียภาษี : {COMPANY.tax}</p>
            </div>
          </div>
        ) : (
          <div className="mb-2">
            <h1 className="text-2xl font-bold">AST</h1>
          </div>
        )}

        <div className="text-center my-4 border-b-2">
          <h2 className="text-xl font-bold  border-gray-800 pb-1 inline-block px-8">ใบสั่งขาย</h2>
        </div>

        {/* Info section */}
        <div className="grid grid-cols-2 gap-x-8 mb-6 text-sm">
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">ชื่อลูกค้า</span>
              <span>{order.customerName ?? '-'}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">ที่อยู่</span>
              <span className="leading-relaxed">{customer?.address ?? '-'}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">เลขประจำตัวผู้เสียภาษี</span>
              <span className="font-mono">{customer?.tax ?? '-'}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">เลขที่ใบสั่งขาย</span>
              <span className="font-mono font-bold">{order.purchaseOrder}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">วันที่</span>
              <span>{fmtDate(order.createDate)}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">เงื่อนไขการชำระเงิน</span>
              <span>{order.payment ?? '-'}</span>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full border-collapse text-sm mb-4" style={{ borderTop: '2px solid #333', borderBottom: '2px solid #333' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              <th className="py-2 px-2 text-center font-bold w-10">ลำดับ</th>
              <th className="py-2 px-2 text-center font-bold">รายการสินค้า</th>
              <th className="py-2 px-2 text-center font-bold w-24">{isM ? 'จำนวนเมตร' : 'จำนวนหลา'}</th>
              <th className="py-2 px-2 text-center font-bold w-24">หน่วยละ</th>
              <th className="py-2 px-2 text-center font-bold w-28">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-3 px-2 text-center align-top">1</td>
              <td className="py-3 px-4">
                {/* Structure display - fraction format */}
                <div className="mb-2">
                  {showRatioRow && (
                    <div className="flex items-center gap-2 text-center mb-1">
                      <div className="flex-1 text-center">{(hRatio1 && hRatio1 !== 'no data') ? hRatio1 : ''}</div>
                      <div className="w-4"></div>
                      <div className="flex-1 text-center">{(wRatio1 && wRatio1 !== 'no data') ? wRatio1 : ''}</div>
                    </div>
                  )}
                  {/* Count row with dividing line */}
                  <div className="flex items-center gap-2 text-center" style={{ borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                    <div className="flex-1 text-center font-medium">{hCount1 ?? ''}</div>
                    <div className="w-4 text-center font-bold">x</div>
                    <div className="flex-1 text-center font-medium">{wCount1 ?? ''}</div>
                  </div>
                  {/* Yarn type row below line */}
                  {yarnDesc && (
                    <div className="text-center mt-1 text-xs text-gray-700">{yarnDesc}</div>
                  )}
                </div>
                {/* Pattern and fabric info */}
                {order.fabricPattern && (
                  <div className="text-sm">{order.fabricPattern.replace(/\([^)]+\)/g, '')}</div>
                )}
                {fabricW && <div className="text-sm">{fabricW}&ldquo;</div>}
                <div className="mt-1"><strong>รหัสผ้า</strong> {order.fabricId ?? '-'}</div>
              </td>
              <td className="py-3 px-2 text-center align-top">
                {qty > 0 ? fmt2(qty) : '-'}
              </td>
              <td className="py-3 px-2 text-center align-top">
                {unitPrice > 0 ? fmt3(unitPrice) : '-'}
              </td>
              <td className="py-3 px-2 text-right align-top">
                {qty > 0 && unitPrice > 0 ? fmt2(qty * unitPrice) : '-'}
              </td>
            </tr>
            {isSurchargeValid && (
              <tr style={{ borderTop: '1px solid #ddd' }}>
                <td className="py-2 px-2 text-center">2</td>
                <td className="py-2 px-4">Surcharge</td>
                <td></td>
                <td></td>
                <td className="py-2 px-2 text-right">{fmt2(surcharge!)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Summary */}
        <div className="flex gap-8 mb-6 text-sm">
          {/* Notes left */}
          <div className="flex-1">
            <div className="flex gap-2">
              <span className="font-bold flex-shrink-0">หมายเหตุ</span>
              <div>
                {order.note && order.note !== 'no data' && <div>{order.note}</div>}
                {order.vat === 'SOX' && <div className="font-bold">ราคานี้รวม VAT แล้ว</div>}
                {order.po && order.po !== 'no data' && <div>{order.po}</div>}
              </div>
            </div>
          </div>

          {/* Totals right */}
          <div className="w-72 space-y-1">
            <div className="flex justify-between">
              <span>รวมเป็นเงิน</span>
              <div className="flex gap-2"><strong>{fmt2(baseTotal)}</strong><span>บาท</span></div>
            </div>
            <div className="flex justify-between">
              <span>หักส่วนลด {discountPct} %</span>
              <div className="flex gap-2"><strong>{fmt2(discountAmt)}</strong><span>บาท</span></div>
            </div>
            <div className="flex justify-between">
              <span>จำนวนเงินหลังหักส่วนลด</span>
              <div className="flex gap-2"><strong>{fmt2(afterDiscount)}</strong><span>บาท</span></div>
            </div>
            <div className="flex justify-between">
              <span>จำนวนภาษีมูลค่าเพิ่ม</span>
              <div className="flex gap-2">
                <strong>{order.vat === 'SO' ? fmt2(vatAmt) : '0.00'}</strong>
                <span>บาท</span>
              </div>
            </div>
            <div className="flex justify-between font-bold border-t border-gray-400 pt-1">
              <span>จำนวนเงินรวมทั้งสิ้น</span>
              <div className="flex gap-2"><strong>{fmt2(grandTotal)}</strong><span>บาท</span></div>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 mt-16">
          <div className="text-center">
            <div className="border-b border-gray-500 mb-2 pb-12"></div>
            <p className="font-bold text-sm">ผู้สั่งสินค้า</p>
          </div>
          <div className="text-center">
            <div className="border-b border-gray-500 mb-2 pb-12"></div>
            <p className="font-bold text-sm">ผู้ขายสินค้า</p>
          </div>
        </div>
      </div>
    </>
  )
}
