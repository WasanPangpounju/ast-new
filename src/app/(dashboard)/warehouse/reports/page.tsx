'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'

// ---- Types ----
interface ExportOutRow {
  vatType: string
  vatNo: string
  customerName: string
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  fold: number
  sumYard: number
  createDate: string
}

interface MovementDetail {
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  inYard: number
  inFold: number
  outYard: number
  outFold: number
  balanceYard: number
  balanceFold: number
}

interface MovementSummary {
  stockIn: number
  stockOut: number
  balance: number
  details: MovementDetail[]
}

interface SummaryDetail {
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  inYard: number
  inFold: number
  outYard: number
  outFold: number
  balanceYard: number
  balanceFold: number
}

interface StockSummary {
  totalIn: number
  totalOut: number
  balance: number
  asOfDate: string
  details: SummaryDetail[]
}

// ---- Helpers ----
const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const CURRENT_YEAR = 2026
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

function toThaiDate(dateStr: string) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const day = d.getDate()
  const month = d.getMonth() + 1
  const year = d.getFullYear() + 543
  return `${day}/${month}/${year}`
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return '-'
  return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

// ---- Excel helpers ----
function exportExcelTab1(data: ExportOutRow[], filters: { vatType: 'all' | 'A' | 'B' | 'C'; month: number; year: number }) {
  const totalFold = data.reduce((s, r) => s + Number(r.fold ?? 0), 0)
  const totalYard = data.reduce((s, r) => s + Number(r.sumYard ?? 0), 0)
  const ws = XLSX.utils.aoa_to_sheet([
    ['รายการสินค้าส่งออกจากคลัง'],
    [`เดือน ${filters.month}/${filters.year}  ประเภทบิล: ${filters.vatType === 'all' ? 'ทั้งหมด' : filters.vatType}`],
    [],
    ['ลำดับ', 'วันที่', 'บิล', 'ลูกค้า', 'โครงสร้างผ้า', 'ลายผ้า', 'หน้ากว้าง', 'พับ', 'หลา'],
    ...data.map((r, i) => [
      i + 1,
      toThaiDate(r.createDate),
      `${r.vatType}${r.vatNo}`,
      r.customerName ?? '',
      r.fabricStruct ?? '',
      r.fabricPattern ?? '',
      r.fabricW ?? '',
      Number(r.fold ?? 0),
      Number(r.sumYard ?? 0),
    ]),
    ['', 'รวม', '', '', '', '', '', totalFold, totalYard],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ส่งออก')
  XLSX.writeFile(wb, `รายงานส่งออก_${filters.month}_${filters.year}.xlsx`)
}

function exportExcelTab2(data: MovementDetail[], summary: { stockIn: number; stockOut: number; balance: number }, filters: { vatType: 'all' | 'A' | 'B' | 'C'; fromMonth: number; fromYear: number; toMonth: number; toYear: number }) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['รายงานสินค้าเข้า/ออก คลัง'],
    [`${filters.fromMonth}/${filters.fromYear} ถึง ${filters.toMonth}/${filters.toYear}  ประเภทบิล: ${filters.vatType === 'all' ? 'ทั้งหมด' : filters.vatType}`],
    [],
    ['โครงสร้างผ้า', 'ลายผ้า', 'หน้ากว้าง', 'รับเข้า (หลา)', 'ส่งออก (หลา)', 'คงเหลือ (หลา)'],
    ...data.map(r => [r.fabricStruct, r.fabricPattern, r.fabricW, r.inYard, r.outYard, r.balanceYard]),
    ['รวม', '', '', summary.stockIn, summary.stockOut, summary.balance],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'เข้า-ออก')
  XLSX.writeFile(wb, `รายงานเข้าออก_${filters.fromMonth}${filters.fromYear}-${filters.toMonth}${filters.toYear}.xlsx`)
}

// ---- Tab 1 ----
function Tab1() {
  const [vatType, setVatType] = useState<'all' | 'A' | 'B' | 'C'>('all')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [data, setData] = useState<ExportOutRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetch1 = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ vatType, month: String(month), year: String(year) })
    fetch(`/api/warehouse/reports/export-out?${p}`)
      .then(r => r.json())
      .then(d => setData(d.rows ?? []))
      .finally(() => setLoading(false))
  }, [vatType, month, year])

  useEffect(() => { fetch1() }, [fetch1])

  const totalFold = data.reduce((s, r) => s + Number(r.fold ?? 0), 0)
  const totalYard = data.reduce((s, r) => s + Number(r.sumYard ?? 0), 0)

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภทบิล</label>
          <select value={vatType} onChange={e => setVatType(e.target.value as 'all' | 'A' | 'B' | 'C')}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="all">ทั้งหมด</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">เดือน</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ปี</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {YEARS.map(y => <option key={y} value={y}>{y + 543}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => exportExcelTab1(data, { vatType, month, year })}
            disabled={data.length === 0}
            className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-1.5 rounded text-sm">
            📥 ส่งออก Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th colSpan={9} className="px-3 py-1.5 text-left text-xs text-gray-500 font-normal border-b border-gray-200">
                {loading ? 'กำลังโหลด...' : `พบ ${data.length.toLocaleString('th-TH')} รายการ`}
              </th>
            </tr>
            <tr>
              {['ลำดับ','วันที่','บิล','ลูกค้า','โครงสร้างผ้า','ลายผ้า','หน้ากว้าง','พับ','หลา'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">กำลังโหลด...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">ไม่พบข้อมูลในช่วงเวลาที่เลือก กรุณาเลือกเดือน/ปีอื่น</td></tr>
            ) : data.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{toThaiDate(r.createDate)}</td>
                <td className="px-3 py-1.5 font-mono">{r.vatType}{r.vatNo}</td>
                <td className="px-3 py-1.5">{r.customerName ?? '-'}</td>
                <td className="px-3 py-1.5">{r.fabricStruct ?? '-'}</td>
                <td className="px-3 py-1.5">{r.fabricPattern ?? '-'}</td>
                <td className="px-3 py-1.5">{r.fabricW ?? '-'}</td>
                <td className="px-3 py-1.5 text-right">{fmtNum(Number(r.fold))}</td>
                <td className="px-3 py-1.5 text-right">{fmtNum(Number(r.sumYard))}</td>
              </tr>
            ))}
          </tbody>
          {data.length > 0 && (
            <tfoot className="bg-blue-50 font-semibold border-t-2 border-blue-200">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right text-blue-800">รวม</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmtNum(totalFold)}</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmtNum(totalYard)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ---- Tab 2 ----
function Tab2() {
  const [vatType, setVatType] = useState<'all' | 'A' | 'B' | 'C'>('all')
  const [fromMonth, setFromMonth] = useState(1)
  const [fromYear, setFromYear] = useState(CURRENT_YEAR)
  const [toMonth, setToMonth] = useState(new Date().getMonth() + 1)
  const [toYear, setToYear] = useState(CURRENT_YEAR)
  const [result, setResult] = useState<MovementSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch2 = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ vatType, fromMonth: String(fromMonth), fromYear: String(fromYear), toMonth: String(toMonth), toYear: String(toYear) })
    fetch(`/api/warehouse/reports/stock-movement?${p}`)
      .then(r => r.json())
      .then(d => setResult(d))
      .finally(() => setLoading(false))
  }, [vatType, fromMonth, fromYear, toMonth, toYear])

  useEffect(() => { fetch2() }, [fetch2])

  const details = result?.details ?? []

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภทบิล</label>
          <select value={vatType} onChange={e => setVatType(e.target.value as 'all' | 'A' | 'B' | 'C')}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="all">ทั้งหมด</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">จากเดือน</label>
          <select value={fromMonth} onChange={e => setFromMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ปี</label>
          <select value={fromYear} onChange={e => setFromYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {YEARS.map(y => <option key={y} value={y}>{y + 543}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ถึงเดือน</label>
          <select value={toMonth} onChange={e => setToMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ปี</label>
          <select value={toYear} onChange={e => setToYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            {YEARS.map(y => <option key={y} value={y}>{y + 543}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => result && exportExcelTab2(details, result, { vatType, fromMonth, fromYear, toMonth, toYear })}
            disabled={!result || details.length === 0}
            className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-1.5 rounded text-sm">
            📥 ส่งออก Excel
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {result && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <div className="text-xs text-blue-600 mb-1">ยอดรับเข้า</div>
            <div className="text-xl font-bold text-blue-800">{fmtNum(result.stockIn)}</div>
            <div className="text-xs text-blue-500">หลา</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-xs text-red-600 mb-1">ยอดส่งออก</div>
            <div className="text-xl font-bold text-red-800">{fmtNum(result.stockOut)}</div>
            <div className="text-xs text-red-500">หลา</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-xs text-green-600 mb-1">คงเหลือ</div>
            <div className="text-xl font-bold text-green-800">{fmtNum(result.balance)}</div>
            <div className="text-xs text-green-500">หลา</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {['โครงสร้างผ้า','ลายผ้า','หน้ากว้าง','รับเข้า (หลา)','ส่งออก (หลา)','คงเหลือ (หลา)'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">กำลังโหลด...</td></tr>
            ) : details.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : details.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-1.5">{r.fabricStruct || '-'}</td>
                <td className="px-3 py-1.5">{r.fabricPattern || '-'}</td>
                <td className="px-3 py-1.5">{r.fabricW || '-'}</td>
                <td className="px-3 py-1.5 text-right text-blue-700">{fmtNum(r.inYard)}</td>
                <td className="px-3 py-1.5 text-right text-red-700">{fmtNum(r.outYard)}</td>
                <td className={`px-3 py-1.5 text-right font-medium ${r.balanceYard < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtNum(r.balanceYard)}</td>
              </tr>
            ))}
          </tbody>
          {result && details.length > 0 && (
            <tfoot className="bg-blue-50 font-semibold border-t-2 border-blue-200">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right text-blue-800">รวม</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmtNum(result.stockIn)}</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmtNum(result.stockOut)}</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmtNum(result.balance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ---- Tab 3 ----
function Tab3() {
  const today = new Date()
  const [vatType, setVatType] = useState<'all' | 'A' | 'B' | 'C'>('all')
  const [asOfDate, setAsOfDate] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
  const [result, setResult] = useState<StockSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const fetch3 = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ vatType, asOfDate })
    fetch(`/api/warehouse/reports/stock-summary?${p}`)
      .then(r => r.json())
      .then(d => setResult(d))
      .finally(() => setLoading(false))
  }, [vatType, asOfDate])

  useEffect(() => { fetch3() }, [fetch3])

  const details = result?.details ?? []

  const handlePrint = () => {
    if (!printRef.current || !result) return
    const thaiDate = toThaiDate(asOfDate)
    const vatLabel = vatType === 'all' ? 'ทั้งหมด' : vatType
    const rows = details.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.fabricStruct || '-'}</td>
        <td>${r.fabricPattern || '-'}</td>
        <td>${r.fabricW || '-'}</td>
        <td style="text-align:right">${Number(r.inYard).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
        <td style="text-align:right">${Number(r.outYard).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
        <td style="text-align:right">${Number(r.balanceYard).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>รายงานสรุปยอดคงคลัง</title>
<style>
  @page { size: A4 portrait; margin: 15mm 12mm; }
  body { font-family: 'Sarabun', 'TH Sarabun New', Arial, sans-serif; font-size: 10pt; color: #000; }
  h2 { text-align: center; margin: 0 0 4px; font-size: 14pt; }
  .sub { text-align: center; font-size: 10pt; margin-bottom: 12px; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 6px; }
  th { background: #e8e8e8; font-weight: bold; text-align: center; }
  tfoot td { font-weight: bold; background: #f0f4ff; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>
<h2>รายงานสรุปยอดคงคลัง</h2>
<div class="sub">ณ วันที่ ${thaiDate} &nbsp;|&nbsp; ประเภทบิล: ${vatLabel}</div>
<table>
  <thead>
    <tr>
      <th>ลำดับ</th><th>โครงสร้างผ้า</th><th>ลายผ้า</th><th>หน้ากว้าง</th>
      <th>รับเข้าสะสม (หลา)</th><th>ส่งออกสะสม (หลา)</th><th>คงเหลือ (หลา)</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="4" style="text-align:right">รวมทั้งหมด</td>
      <td style="text-align:right">${Number(result.totalIn).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
      <td style="text-align:right">${Number(result.totalOut).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
      <td style="text-align:right">${Number(result.balance).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td>
    </tr>
  </tfoot>
</table>
</body>
</html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div ref={printRef}>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภทบิล</label>
          <select value={vatType} onChange={e => setVatType(e.target.value as 'all' | 'A' | 'B' | 'C')}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm">
            <option value="all">ทั้งหมด</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ณ วันที่</label>
          <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
        <div className="flex items-end">
          <button onClick={handlePrint}
            disabled={!result || details.length === 0}
            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded text-sm">
            📥 ส่งออก A4
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {result && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <div className="text-xs text-blue-600 mb-1">ยอดรับเข้าสะสม</div>
            <div className="text-xl font-bold text-blue-800">{fmtNum(result.totalIn)}</div>
            <div className="text-xs text-blue-500">หลา</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-xs text-red-600 mb-1">ยอดส่งออกสะสม</div>
            <div className="text-xl font-bold text-red-800">{fmtNum(result.totalOut)}</div>
            <div className="text-xs text-red-500">หลา</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-xs text-green-600 mb-1">คงเหลือสะสม</div>
            <div className="text-xl font-bold text-green-800">{fmtNum(result.balance)}</div>
            <div className="text-xs text-green-500">หลา</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {['โครงสร้างผ้า','ลายผ้า','หน้ากว้าง','รับเข้าสะสม (หลา)','ส่งออกสะสม (หลา)','คงเหลือ (หลา)'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">กำลังโหลด...</td></tr>
            ) : details.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">ไม่พบข้อมูล</td></tr>
            ) : details.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-1.5">{r.fabricStruct || '-'}</td>
                <td className="px-3 py-1.5">{r.fabricPattern || '-'}</td>
                <td className="px-3 py-1.5">{r.fabricW || '-'}</td>
                <td className="px-3 py-1.5 text-right text-blue-700">{fmtNum(r.inYard)}</td>
                <td className="px-3 py-1.5 text-right text-red-700">{fmtNum(r.outYard)}</td>
                <td className={`px-3 py-1.5 text-right font-medium ${r.balanceYard < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtNum(r.balanceYard)}</td>
              </tr>
            ))}
          </tbody>
          {result && details.length > 0 && (
            <tfoot className="bg-blue-50 font-semibold border-t-2 border-blue-200">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right text-blue-800">รวมทั้งหมด</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmtNum(result.totalIn)}</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmtNum(result.totalOut)}</td>
                <td className="px-3 py-2 text-right text-blue-800">{fmtNum(result.balance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ---- Main Page ----
type Tab = 'export-out' | 'movement' | 'summary'

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('export-out')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'export-out', label: 'รายการสินค้าส่งออก' },
    { key: 'movement', label: 'รายงานสินค้าเข้า/ออก' },
    { key: 'summary', label: 'สรุปยอดคงคลัง' },
  ]

  return (
    <div className="p-4 max-w-full">
      <h1 className="text-lg font-semibold text-gray-900 mb-4">📊 รายงาน</h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'export-out' && <Tab1 />}
      {tab === 'movement' && <Tab2 />}
      {tab === 'summary' && <Tab3 />}
    </div>
  )
}
