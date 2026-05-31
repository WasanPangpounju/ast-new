"use client";
import React, { useState, useEffect, use } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const ROW_H = 36;

interface Roll {
  id: number;
  fold: number | null;
  sumYard: number | null;
  vatType: string;
  vatNo: number;
  customerName: string | null;
  receiveName: string | null;
  fabricStruct: string | null;
  fabricPattern: string | null;
  fabricW: string | null;
  createDate: string | null;
  altFabricStruct: string | null;
  altPurchaseOrder: string | null;
}

const COLS = 8;
const ROWS_PER_COL = 20;

export default function BillPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ vatNo: string }>;
  searchParams: Promise<{ vatType?: string }>;
}) {
  const { vatNo } = use(params);
  const { vatType = "A" } = use(searchParams);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/warehouse/bill/${vatNo}?vatType=${vatType}`)
      .then((r) => r.json())
      .then((d) => setRolls(d.rolls ?? []))
      .catch((err) => console.error("fetch error:", err))
      .finally(() => setLoading(false));
  }, [vatNo, vatType]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        กำลังโหลด...
      </div>
    );
  if (rolls.length === 0)
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        ไม่พบข้อมูลบิล
      </div>
    );

  const first = rolls[0];
  const totalFold = rolls.length;
  const totalYard = rolls.reduce((s, r) => s + (Number(r.sumYard) || 0), 0);

  const ITEMS_PER_PAGE = COLS * ROWS_PER_COL;
  const totalPages = Math.ceil(rolls.length / ITEMS_PER_PAGE);
  const pages = Array.from({ length: totalPages }, (_, pageIdx) =>
    rolls.slice(pageIdx * ITEMS_PER_PAGE, (pageIdx + 1) * ITEMS_PER_PAGE),
  );

  const fmtDate = (d: string | null) => {
    if (!d) return "-";
    try {
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear()}`;
    } catch {
      return "-";
    }
  };

  const trimCompanyName = (name: string | null): string => {
    if (!name) return "-";
    return name
      .replace(/^บริษัท\s*/u, "")
      .replace(/\s*จำกัด.*/u, "")
      .trim() || "-";
  };

  const fabricCode = first.altFabricStruct
    ? first.altFabricStruct
    : `${first.fabricStruct ?? ""} ${first.fabricPattern ?? ""} ${first.fabricW ? `${first.fabricW}''` : ""}`.trim() ||
      "-";

  const ordererName = first.altPurchaseOrder
    ? first.altPurchaseOrder
    : trimCompanyName(first.customerName);

  const receiverName = trimCompanyName(first.receiveName);

  const handleDownloadPDF = async () => {
    const el = document.getElementById("print-body");
    if (!el) return;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageEls = el.querySelectorAll(".a4-page");

    for (let i = 0; i < pageEls.length; i++) {
      const canvas = await html2canvas(pageEls[i] as HTMLElement, {
        scale: 5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
    }

    pdf.save(`ใบส่งสินค้า-${vatType}-${vatNo}.pdf`);
  };

  return (
    <div className="bg-gray-400 print:bg-white print:p-0">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        /* TH Sarabun New = Sarabun บน Google Fonts */

        /* screen — fixed px */
        .bill-row { height: ${ROW_H}px; }
        .bill-table { table-layout: fixed; }
        .bill-th-idx  { width: 4.5%; }
        .bill-th-yard { width: 8%; }

        /* a4-page screen — padding อยู่ใน CSS */
        .a4-page {
          font-family: 'Sarabun', 'TH Sarabun New', sans-serif;
          width: 210mm;
          height: 300mm;
          padding: 10mm 12mm;
          box-sizing: border-box;
        }

        .bill-footer { }

        /* ปิด Safari auto font scaling + สีดำเหมือน print */
        .a4-page * { -webkit-text-size-adjust: none; text-size-adjust: none; color: #000; }

        /* สีเส้นตารางเดียวกันหมด */
        .a4-page th, .a4-page td { border-color: #555 !important; }
        .bill-footer { border-color: #555 !important; }
        .bill-footer .border-r { border-color: #555 !important; }

        @media print {
          @page { size: A4 portrait; margin: 0mm; }
          html, body {
            width: 210mm;
            height: 300mm;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }

          #print-body {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            gap: 0 !important;
          }

          #print-body > div {
            margin: 0 !important;
            padding: 0 !important;
          }

          .a4-page {
            width: 228mm !important;
            height: 300mm !important;
            padding: 10mm 12mm !important;
            margin: 0 !important;
            overflow: hidden !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            page-break-after: always;
          }
          .a4-page:last-child { page-break-after: avoid; }
          .a4-page .bill-row { height: 33px !important; }

          /* Table+Footer wrapper เต็มพื้นที่ที่เหลือ */
          .a4-page > div:last-child {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
          }

          /* เพิ่มขนาดตัวอักษรหนึ่งไซต์ตอนพิมพ์ */
          .a4-page .text-xs   { font-size: 14px !important; }
          .a4-page .text-sm   { font-size: 16px !important; }
          .a4-page .text-base { font-size: 18px !important; }
          .a4-page .text-lg   { font-size: 20px !important; }

          /* หัวเข็ม: ดำทั้งหมด, หนา, เส้นชัด */
          .a4-page * {
            color: #000 !important;
            font-weight: 700 !important;
            -webkit-font-smoothing: none;
            text-shadow: none !important;
            background: transparent !important;
          }
          .bill-footer,
          .bill-footer .border-r {
            border-color: #000 !important;
          }
        }
      `}</style>

      <div className="no-print flex gap-3 p-4 sticky top-0 z-10 bg-gray-500/80 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/>
            <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/>
          </svg>
          พิมพ์
        </button>
        <button
          type="button"
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/>
            <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/>
          </svg>
          ดาวน์โหลด PDF
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
        >
          ปิด
        </button>
      </div>


      <div id="print-body" className="pt-6 pb-0 flex flex-col items-center gap-6">
        {pages.map((pageRolls, pageIdx) => {
          const slots: (Roll | null)[] = Array(COLS * ROWS_PER_COL).fill(null);
          pageRolls.forEach((r, i) => {
            slots[i] = r;
          });

          const colSums = Array.from({ length: COLS }, (_, c) =>
            slots
              .slice(c * ROWS_PER_COL, (c + 1) * ROWS_PER_COL)
              .reduce((s, r) => s + (Number(r?.sumYard) || 0), 0),
          );

          return (
            <div
              key={pageIdx}
              className={pageIdx < pages.length - 1 ? "page-break" : ""}
            >
              <div className="a4-page bg-white shadow-xl print:shadow-none mx-auto flex flex-col mt-1">
                {/* Header */}
                <div className="flex justify-between items-baseline mb-2 shrink-0">
                  <span className="text-sm print-xs">
                    แผ่นที่ {pageIdx + 1} จาก ทั้งหมด {totalPages} แผ่น
                  </span>
                  <h1 className="text-[20px] font-bold print-h1">
                    ใบส่งสินค้า / Delivery Note
                  </h1>
                  <span className="text-[15px] font-bold print-sm">
                    เลขที่ {vatType} - {vatNo}
                  </span>
                </div>

                {/* Info — ไม่มีกรอบ */}
                <div className="flex items-baseline justify-between mb-2 shrink-0 text-[15px] print-sm mt-10">
                  <div>
                    <span className="font-bold">ผู้สั่ง Order by :</span>
                    <span className="font-bold ml-1 whitespace-nowrap">{ordererName}</span>
                  </div>
                  <div className="shrink-0 ml-8 text-right">
                    <span className="font-bold">ผู้รับ Received by</span>
                    <span className="font-bold ml-1 whitespace-nowrap">{trimCompanyName(receiverName)}</span>
                  </div>
                </div>
                <div className="flex justify-between mb-2 shrink-0 text-[15px] print-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-bold">รหัสผ้า Code :</span>
                    <span className="font-bold ml-1 whitespace-nowrap">{fabricCode}</span>
                  </div>
                  <div className="shrink-0 text-right ml-4">
                    <span className="font-bold">วันที่ Date :</span>
                    <span className="font-bold ml-1 whitespace-nowrap">
                      {fmtDate(first.createDate)}
                    </span>
                  </div>
                </div>

                {/* Table + Footer */}
                <div className=" flex flex-col h-full flex-1">                  {/* Table — flex-1 เต็มพื้นที่ */}
                  <div className="overflow-hidden shrink-0">
                    <table className="bill-table w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          {Array.from({ length: COLS }, (_, c) => (
                            <React.Fragment key={c}>
                              <th className="bill-th-idx border border-[#555] text-center text-xs font-medium print-sm">
                                ลำดับ
                              </th>
                              <th className="bill-th-yard border border-[#555]  text-center text-xs font-medium print-sm">
                                หลา
                              </th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: ROWS_PER_COL }, (_, r) => (
                          <tr key={r} className="bill-row">
                            {Array.from({ length: COLS }, (_, c) => {
                              const roll = slots[c * ROWS_PER_COL + r];
                              const slotNo =
                                pageIdx * ITEMS_PER_PAGE +
                                c * ROWS_PER_COL +
                                r +
                                1;
                              return (
                                <React.Fragment key={c}>
                                  <td className="border border-[#999] px-1 text-center text-sm text-gray-500 w-4 print-sm">
                                    {roll ? slotNo : ""}
                                  </td>
                                  <td className="border border-[#999] px-1 text-center text-lg font-bold print-base">
                                    {roll?.sumYard
                                      ? Number(roll.sumYard).toLocaleString()
                                      : ""}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Sum row */}
                        <tr className="h-8">
                          {Array.from({ length: COLS }, (_, c) => (
                            <React.Fragment key={c}>
                              <td className="border border-[#555] px-1 text-center text-sm font-semibold w-6 print-sm">
                                รวม
                              </td>
                              <td className="border border-[#555] px-1 text-right text-sm font-semibold print-sm">
                                {colSums[c] > 0
                                  ? colSums[c].toLocaleString()
                                  : 0}
                              </td>
                            </React.Fragment>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="bill-footer flex-1 border border-gray-400 flex mt-2">
                    {/* Left: Sample */}
                    <div className="border-r border-gray-400 w-48 flex flex-col items-center justify-center py-2">
                      <p className="text-sm font-medium print-sm">
                        ตัวอย่างผ้า
                      </p>
                      <p className="text-sm font-medium print-sm">Sample</p>
                    </div>

                    {/* Right */}
                    <div className="flex-1 flex flex-col justify-between px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div className="text-center leading-tight">
                          <div className="text-sm print-sm font-medium">รวม</div>
                          <div className="text-xs text-gray-500 print-xs">Total</div>
                        </div>
                        <span className="text-[20px] font-bold print-big">{totalFold}</span>
                        <div className="text-center leading-tight">
                          <div className="text-sm print-sm font-medium">พับ</div>
                          <div className="text-xs text-gray-500 print-xs">Pieces</div>
                        </div>
                        <span className="text-[20px] font-bold ml-2 print-big">{totalYard.toLocaleString()}</span>
                        <div className="text-center leading-tight">
                          <div className="text-sm print-sm font-medium">หลา</div>
                          <div className="text-xs text-gray-500 print-xs">Yards</div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium print-xs">
                          ลงชื่อประทับตรา
                        </p>
                        <p className="text-xs text-gray-500 print-xs">
                          Authorize Signature___________________________________
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold print-xs">หมายเหตุ</p>
                        <p className="text-xs text-gray-600 print-xs">
                          ได้รับผ้าตามรายการข้างบนนี้ไว้ถูกต้องและเรียบร้อยแล้ว
                        </p>
                        <p className="text-xs text-gray-600 print-xs">
                          Received the above goods in good order and condition
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
