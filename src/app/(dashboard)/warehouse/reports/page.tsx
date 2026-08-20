"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ---- Types ----
interface ExportOutRow {
  vatType: string;
  vatNo: string;
  customerName: string;
  fabricStruct: string;
  fabricPattern: string;
  fabricW: string;
  fold: number;
  sumYard: number;
  createDate: string;
}

interface MovementDetail {
  fabricStruct: string;
  fabricPattern: string;
  fabricW: string;
  inYard: number;
  inFold: number;
  outYard: number;
  outFold: number;
  balanceYard: number;
  balanceFold: number;
}

interface MovementSummary {
  stockIn: number;
  stockOut: number;
  balance: number;
  details: MovementDetail[];
}

interface SummaryDetail {
  fabricStruct: string;
  fabricPattern: string;
  fabricW: string;
  inYard: number;
  inFold: number;
  outYard: number;
  outFold: number;
  balanceYard: number;
  balanceFold: number;
  balanceAnomaly?: boolean;
}

interface StockSummary {
  totalIn: number;
  totalOut: number;
  balance: number;
  balanceAnomaly?: boolean;
  asOfDate: string;
  details: SummaryDetail[];
}

// ---- Helpers ----
const MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
const CURRENT_YEAR = 2026;
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

function toThaiDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

function fmtNum(n: number | null | undefined) {
  if (n == null) return "-";
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

// ---- Excel helpers ----
function exportExcelTab1(
  data: ExportOutRow[],
  filters: { vatType: "all" | "A" | "B" | "C"; month: number; year: number },
) {
  const totalFold = data.reduce((s, r) => s + Number(r.fold ?? 0), 0);
  const totalYard = data.reduce((s, r) => s + Number(r.sumYard ?? 0), 0);
  const ws = XLSX.utils.aoa_to_sheet([
    ["รายการสินค้าส่งออกจากคลัง"],
    [
      `เดือน ${filters.month}/${filters.year}  ประเภทบิล: ${filters.vatType === "all" ? "ทั้งหมด" : filters.vatType}`,
    ],
    [],
    [
      "ลำดับ",
      "วันที่",
      "บิล",
      "ลูกค้า",
      "โครงสร้างผ้า",
      "ลายผ้า",
      "หน้ากว้าง",
      "พับ",
      "หลา",
    ],
    ...data.map((r, i) => [
      i + 1,
      toThaiDate(r.createDate),
      `${r.vatType}${r.vatNo}`,
      r.customerName ?? "",
      r.fabricStruct ?? "",
      r.fabricPattern ?? "",
      r.fabricW ?? "",
      Number(r.fold ?? 0),
      Number(r.sumYard ?? 0),
    ]),
    ["", "รวม", "", "", "", "", "", totalFold, totalYard],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ส่งออก");
  XLSX.writeFile(wb, `รายงานส่งออก_${filters.month}_${filters.year}.xlsx`);
}

function exportExcelTab2(
  data: MovementDetail[],
  summary: { stockIn: number; stockOut: number; balance: number },
  filters: {
    vatType: "all" | "A" | "B" | "C";
    fromMonth: number;
    fromYear: number;
    toMonth: number;
    toYear: number;
  },
) {
  const ws = XLSX.utils.aoa_to_sheet([
    ["รายงานสินค้าเข้า/ออก คลัง"],
    [
      `${filters.fromMonth}/${filters.fromYear} ถึง ${filters.toMonth}/${filters.toYear}  ประเภทบิล: ${filters.vatType === "all" ? "ทั้งหมด" : filters.vatType}`,
    ],
    [],
    [
      "โครงสร้างผ้า",
      "ลายผ้า",
      "หน้ากว้าง",
      "รับเข้า (หลา)",
      "ส่งออก (หลา)",
      "คงเหลือ (หลา)",
    ],
    ...data.map((r) => [
      r.fabricStruct,
      r.fabricPattern,
      r.fabricW,
      r.inYard,
      r.outYard,
      r.balanceYard,
    ]),
    ["รวม", "", "", summary.stockIn, summary.stockOut, summary.balance],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "เข้า-ออก");
  XLSX.writeFile(
    wb,
    `รายงานเข้าออก_${filters.fromMonth}${filters.fromYear}-${filters.toMonth}${filters.toYear}.xlsx`,
  );
}

// ---- Tab 1 ----
function Tab1() {
  const [vatType, setVatType] = useState<"all" | "A" | "B" | "C">("all");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [data, setData] = useState<ExportOutRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch1 = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({
      vatType,
      month: String(month),
      year: String(year),
    });
    fetch(`/api/warehouse/reports/export-out?${p}`)
      .then((r) => r.json())
      .then((d) => setData(d.rows ?? []))
      .finally(() => setLoading(false));
  }, [vatType, month, year]);

  useEffect(() => {
    fetch1();
  }, [fetch1]);

  const totalFold = data.reduce((s, r) => s + Number(r.fold ?? 0), 0);
  const totalYard = data.reduce((s, r) => s + Number(r.sumYard ?? 0), 0);

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภทบิล</label>
          <select
            value={vatType}
            onChange={(e) =>
              setVatType(e.target.value as "all" | "A" | "B" | "C")
            }
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="all">ทั้งหมด</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">เดือน</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ปี</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y + 543}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => exportExcelTab1(data, { vatType, month, year })}
            disabled={data.length === 0}
            className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-1.5 rounded text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-filetype-xlsx" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M14 4.5V11h-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zM7.86 14.841a1.13 1.13 0 0 0 .401.823q.195.162.479.252.284.091.665.091.507 0 .858-.158.355-.158.54-.44a1.17 1.17 0 0 0 .187-.656q0-.336-.135-.56a1 1 0 0 0-.375-.357 2 2 0 0 0-.565-.21l-.621-.144a1 1 0 0 1-.405-.176.37.37 0 0 1-.143-.299q0-.234.184-.384.188-.152.513-.152.214 0 .37.068a.6.6 0 0 1 .245.181.56.56 0 0 1 .12.258h.75a1.1 1.1 0 0 0-.199-.566 1.2 1.2 0 0 0-.5-.41 1.8 1.8 0 0 0-.78-.152q-.44 0-.777.15-.336.149-.527.421-.19.273-.19.639 0 .302.123.524t.351.367q.229.143.54.213l.618.144q.31.073.462.193a.39.39 0 0 1 .153.326.5.5 0 0 1-.085.29.56.56 0 0 1-.255.193q-.168.07-.413.07-.176 0-.32-.04a.8.8 0 0 1-.249-.115.58.58 0 0 1-.255-.384zm-3.726-2.909h.893l-1.274 2.007 1.254 1.992h-.908l-.85-1.415h-.035l-.853 1.415H1.5l1.24-2.016-1.228-1.983h.931l.832 1.438h.036zm1.923 3.325h1.697v.674H5.266v-3.999h.791zm7.636-3.325h.893l-1.274 2.007 1.254 1.992h-.908l-.85-1.415h-.035l-.853 1.415h-.861l1.24-2.016-1.228-1.983h.931l.832 1.438h.036z"/>
            </svg>{" "}
            ส่งออก Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th
                colSpan={9}
                className="px-3 py-1.5 text-left text-xs text-gray-500 font-normal border-b border-gray-200"
              >
                {loading
                  ? "กำลังโหลด..."
                  : `พบ ${data.length.toLocaleString("th-TH")} รายการ`}
              </th>
            </tr>
            <tr>
              {[
                "ลำดับ",
                "วันที่",
                "บิล",
                "ลูกค้า",
                "โครงสร้างผ้า",
                "ลายผ้า",
                "หน้ากว้าง",
                "พับ",
                "หลา",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">
                  กำลังโหลด...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">
                  ไม่พบข้อมูลในช่วงเวลาที่เลือก กรุณาเลือกเดือน/ปีอื่น
                </td>
              </tr>
            ) : (
              data.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {toThaiDate(r.createDate)}
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {r.vatType}
                    {r.vatNo}
                  </td>
                  <td className="px-3 py-1.5">{r.customerName ?? "-"}</td>
                  <td className="px-3 py-1.5">{r.fabricStruct ?? "-"}</td>
                  <td className="px-3 py-1.5">{r.fabricPattern ?? "-"}</td>
                  <td className="px-3 py-1.5">{r.fabricW ?? "-"}</td>
                  <td className="px-3 py-1.5 text-right">
                    {fmtNum(Number(r.fold))}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {fmtNum(Number(r.sumYard))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot className="bg-blue-50 font-semibold border-t-2 border-blue-200">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right text-blue-800">
                  รวม
                </td>
                <td className="px-3 py-2 text-right text-blue-800">
                  {fmtNum(totalFold)}
                </td>
                <td className="px-3 py-2 text-right text-blue-800">
                  {fmtNum(totalYard)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---- Tab 2 ----
function Tab2() {
  const [vatType, setVatType] = useState<"all" | "A" | "B" | "C">("all");
  const [fromMonth, setFromMonth] = useState(1);
  const [fromYear, setFromYear] = useState(CURRENT_YEAR);
  const [toMonth, setToMonth] = useState(new Date().getMonth() + 1);
  const [toYear, setToYear] = useState(CURRENT_YEAR);
  const [result, setResult] = useState<MovementSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch2 = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({
      vatType,
      fromMonth: String(fromMonth),
      fromYear: String(fromYear),
      toMonth: String(toMonth),
      toYear: String(toYear),
    });
    fetch(`/api/warehouse/reports/stock-movement?${p}`)
      .then((r) => r.json())
      .then((d) => setResult(d))
      .finally(() => setLoading(false));
  }, [vatType, fromMonth, fromYear, toMonth, toYear]);

  useEffect(() => {
    fetch2();
  }, [fetch2]);

  const details = result?.details ?? [];

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภทบิล</label>
          <select
            value={vatType}
            onChange={(e) =>
              setVatType(e.target.value as "all" | "A" | "B" | "C")
            }
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="all">ทั้งหมด</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">จากเดือน</label>
          <select
            value={fromMonth}
            onChange={(e) => setFromMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ปี</label>
          <select
            value={fromYear}
            onChange={(e) => setFromYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y + 543}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ถึงเดือน</label>
          <select
            value={toMonth}
            onChange={(e) => setToMonth(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ปี</label>
          <select
            value={toYear}
            onChange={(e) => setToYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y + 543}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() =>
              result &&
              exportExcelTab2(details, result, {
                vatType,
                fromMonth,
                fromYear,
                toMonth,
                toYear,
              })
            }
            disabled={!result || details.length === 0}
            className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-1.5 rounded text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-filetype-xlsx" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M14 4.5V11h-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zM7.86 14.841a1.13 1.13 0 0 0 .401.823q.195.162.479.252.284.091.665.091.507 0 .858-.158.355-.158.54-.44a1.17 1.17 0 0 0 .187-.656q0-.336-.135-.56a1 1 0 0 0-.375-.357 2 2 0 0 0-.565-.21l-.621-.144a1 1 0 0 1-.405-.176.37.37 0 0 1-.143-.299q0-.234.184-.384.188-.152.513-.152.214 0 .37.068a.6.6 0 0 1 .245.181.56.56 0 0 1 .12.258h.75a1.1 1.1 0 0 0-.199-.566 1.2 1.2 0 0 0-.5-.41 1.8 1.8 0 0 0-.78-.152q-.44 0-.777.15-.336.149-.527.421-.19.273-.19.639 0 .302.123.524t.351.367q.229.143.54.213l.618.144q.31.073.462.193a.39.39 0 0 1 .153.326.5.5 0 0 1-.085.29.56.56 0 0 1-.255.193q-.168.07-.413.07-.176 0-.32-.04a.8.8 0 0 1-.249-.115.58.58 0 0 1-.255-.384zm-3.726-2.909h.893l-1.274 2.007 1.254 1.992h-.908l-.85-1.415h-.035l-.853 1.415H1.5l1.24-2.016-1.228-1.983h.931l.832 1.438h.036zm1.923 3.325h1.697v.674H5.266v-3.999h.791zm7.636-3.325h.893l-1.274 2.007 1.254 1.992h-.908l-.85-1.415h-.035l-.853 1.415h-.861l1.24-2.016-1.228-1.983h.931l.832 1.438h.036z"/>
            </svg>{" "}
            ส่งออก Excel
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <div className="text-xs text-blue-600 mb-1">ยอดรับเข้า</div>
            <div className="text-xl font-bold text-blue-800">
              {fmtNum(result.stockIn)}
            </div>
            <div className="text-xs text-blue-500">หลา</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-xs text-red-600 mb-1">ยอดส่งออก</div>
            <div className="text-xl font-bold text-red-800">
              {fmtNum(result.stockOut)}
            </div>
            <div className="text-xs text-red-500">หลา</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-xs text-green-600 mb-1">คงเหลือ</div>
            <div className="text-xl font-bold text-green-800">
              {fmtNum(result.balance)}
            </div>
            <div className="text-xs text-green-500">หลา</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {[
                "โครงสร้างผ้า",
                "ลายผ้า",
                "หน้ากว้าง",
                "รับเข้า (หลา)",
                "ส่งออก (หลา)",
                "คงเหลือ (หลา)",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  กำลังโหลด...
                </td>
              </tr>
            ) : details.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  ไม่พบข้อมูล
                </td>
              </tr>
            ) : (
              details.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-1.5">{r.fabricStruct || "-"}</td>
                  <td className="px-3 py-1.5">{r.fabricPattern || "-"}</td>
                  <td className="px-3 py-1.5">{r.fabricW || "-"}</td>
                  <td className="px-3 py-1.5 text-right text-blue-700">
                    {fmtNum(r.inYard)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-red-700">
                    {fmtNum(r.outYard)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-medium ${r.balanceYard < 0 ? "text-red-600" : "text-green-700"}`}
                  >
                    {fmtNum(r.balanceYard)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {result && details.length > 0 && (
            <tfoot className="bg-blue-50 font-semibold border-t-2 border-blue-200">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right text-blue-800">
                  รวม
                </td>
                <td className="px-3 py-2 text-right text-blue-800">
                  {fmtNum(result.stockIn)}
                </td>
                <td className="px-3 py-2 text-right text-blue-800">
                  {fmtNum(result.stockOut)}
                </td>
                <td className="px-3 py-2 text-right text-blue-800">
                  {fmtNum(result.balance)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---- Tab 3 ----
function Tab3() {
  const today = new Date();
  const [vatType, setVatType] = useState<"all" | "A" | "B" | "C">("all");
  const [asOfDate, setAsOfDate] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  );
  const [result, setResult] = useState<StockSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [hideZero, setHideZero] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetch3 = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ vatType, asOfDate });
    fetch(`/api/warehouse/reports/stock-summary?${p}`)
      .then((r) => r.json())
      .then((d) => setResult(d))
      .finally(() => setLoading(false));
  }, [vatType, asOfDate]);

  useEffect(() => {
    fetch3();
  }, [fetch3]);

  const details = result?.details ?? [];
  const visibleDetails = hideZero
    ? details.filter((r) => !(r.balanceAnomaly || Number(r.balanceYard) === 0))
    : details;

  const handlePrint = () => {
    if (!printRef.current || !result) return;
    const thaiDate = toThaiDate(asOfDate);
    const vatLabel = vatType === "all" ? "ทั้งหมด" : vatType;
    const rows = details
      .map(
        (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.fabricStruct || "-"}</td>
        <td>${r.fabricPattern || "-"}</td>
        <td>${r.fabricW || "-"}</td>
        <td style="text-align:right">${Number(r.inYard).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
        <td style="text-align:right">${Number(r.outYard).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
        <td style="text-align:right">${r.balanceAnomaly ? "0 !" : Number(r.balanceYard).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
      </tr>
    `,
      )
      .join("");

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
      <td style="text-align:right">${Number(result.totalIn).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
      <td style="text-align:right">${Number(result.totalOut).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
      <td style="text-align:right">${result.balanceAnomaly ? "0 !" : Number(result.balance).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
    </tr>
  </tfoot>
</table>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  return (
    <div ref={printRef}>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">ประเภทบิล</label>
          <select
            value={vatType}
            onChange={(e) =>
              setVatType(e.target.value as "all" | "A" | "B" | "C")
            }
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="all">ทั้งหมด</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ณ วันที่</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none py-1.5">
            <input
              type="checkbox"
              checked={hideZero}
              onChange={(e) => setHideZero(e.target.checked)}
              className="w-3.5 h-3.5 cursor-pointer"
            />
            ซ่อนรายการที่คงเหลือ = 0
          </label>
        </div>
        <div className="flex items-end">
          <button
            onClick={handlePrint}
            disabled={!result || details.length === 0}
            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-filetype-doc" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2v-1a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zm-7.839 9.166v.522q0 .384-.117.641a.86.86 0 0 1-.322.387.9.9 0 0 1-.469.126.9.9 0 0 1-.471-.126.87.87 0 0 1-.32-.386 1.55 1.55 0 0 1-.117-.642v-.522q0-.386.117-.641a.87.87 0 0 1 .32-.387.87.87 0 0 1 .471-.129q.264 0 .469.13a.86.86 0 0 1 .322.386q.117.255.117.641m.803.519v-.513q0-.565-.205-.972a1.46 1.46 0 0 0-.589-.63q-.381-.22-.917-.22-.533 0-.92.22a1.44 1.44 0 0 0-.589.627q-.204.406-.205.975v.513q0 .563.205.973.205.406.59.627.386.216.92.216.535 0 .916-.216.383-.22.59-.627.204-.41.204-.973M0 11.926v4h1.459q.603 0 .999-.238a1.45 1.45 0 0 0 .595-.689q.196-.45.196-1.084 0-.63-.196-1.075a1.43 1.43 0 0 0-.59-.68q-.395-.234-1.004-.234zm.791.645h.563q.371 0 .609.152a.9.9 0 0 1 .354.454q.118.302.118.753a2.3 2.3 0 0 1-.068.592 1.1 1.1 0 0 1-.196.422.8.8 0 0 1-.334.252 1.3 1.3 0 0 1-.483.082H.79V12.57Zm7.422.483a1.7 1.7 0 0 0-.103.633v.495q0 .369.103.627a.83.83 0 0 0 .298.393.85.85 0 0 0 .478.131.9.9 0 0 0 .401-.088.7.7 0 0 0 .273-.248.8.8 0 0 0 .117-.364h.765v.076a1.27 1.27 0 0 1-.226.674q-.205.29-.55.454a1.8 1.8 0 0 1-.786.164q-.54 0-.914-.216a1.4 1.4 0 0 1-.571-.627q-.194-.408-.194-.976v-.498q0-.568.197-.978.195-.411.571-.633.378-.223.911-.223.328 0 .607.097.28.093.489.272a1.33 1.33 0 0 1 .466.964v.073H9.78a.85.85 0 0 0-.12-.38.7.7 0 0 0-.273-.261.8.8 0 0 0-.398-.097.8.8 0 0 0-.475.138.87.87 0 0 0-.301.398"/>
            </svg>{" "}
            ส่งออก A4
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {result && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <div className="text-xs text-blue-600 mb-1">ยอดรับเข้าสะสม</div>
            <div className="text-xl font-bold text-blue-800">
              {fmtNum(result.totalIn)}
            </div>
            <div className="text-xs text-blue-500">หลา</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-xs text-red-600 mb-1">ยอดส่งออกสะสม</div>
            <div className="text-xl font-bold text-red-800">
              {fmtNum(result.totalOut)}
            </div>
            <div className="text-xs text-red-500">หลา</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-xs text-green-600 mb-1">คงเหลือสะสม</div>
            <div className="text-xl font-bold text-green-800">
              {result.balanceAnomaly ? "0 !" : fmtNum(result.balance)}
            </div>
            <div className="text-xs text-green-500">หลา</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              {[
                "โครงสร้างผ้า",
                "ลายผ้า",
                "หน้ากว้าง",
                "รับเข้าสะสม (หลา)",
                "ส่งออกสะสม (หลา)",
                "คงเหลือ (หลา)",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  กำลังโหลด...
                </td>
              </tr>
            ) : visibleDetails.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  ไม่พบข้อมูล
                </td>
              </tr>
            ) : (
              visibleDetails.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-1.5">{r.fabricStruct || "-"}</td>
                  <td className="px-3 py-1.5">{r.fabricPattern || "-"}</td>
                  <td className="px-3 py-1.5">{r.fabricW || "-"}</td>
                  <td className="px-3 py-1.5 text-right text-blue-700">
                    {fmtNum(r.inYard)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-red-700">
                    {fmtNum(r.outYard)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-medium ${r.balanceAnomaly ? "text-red-600" : r.balanceYard < 0 ? "text-red-600" : "text-green-700"}`}
                  >
                    {r.balanceAnomaly ? "0 !" : fmtNum(r.balanceYard)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {result && details.length > 0 && (
            <tfoot className="bg-blue-50 font-semibold border-t-2 border-blue-200">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right text-blue-800">
                  รวมทั้งหมด
                </td>
                <td className="px-3 py-2 text-right text-blue-800">
                  {fmtNum(result.totalIn)}
                </td>
                <td className="px-3 py-2 text-right text-blue-800">
                  {fmtNum(result.totalOut)}
                </td>
                <td className="px-3 py-2 text-right text-blue-800">
                  {result.balanceAnomaly ? "0 !" : fmtNum(result.balance)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---- Main Page ----
type Tab = "export-out" | "movement" | "summary";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("export-out");

  const tabs: { key: Tab; label: string }[] = [
    { key: "export-out", label: "รายการสินค้าส่งออก" },
    { key: "movement", label: "รายงานสินค้าเข้า/ออก" },
    { key: "summary", label: "สรุปยอดคงคลัง" },
  ];

  return (
    <div className="p-4 max-w-full">
      <h1 className="flex items-center text-3xl font-semibold text-gray-900 mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1z" />
        </svg>
        <span className="px-2">รายงาน</span>
      </h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
              ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "export-out" && <Tab1 />}
      {tab === "movement" && <Tab2 />}
      {tab === "summary" && <Tab3 />}
    </div>
  );
}
