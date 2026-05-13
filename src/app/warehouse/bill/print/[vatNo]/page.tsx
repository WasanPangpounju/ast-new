"use client";
import React, { useState, useEffect, use } from "react";

const A4_WIDTH = 794;

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
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth - 32;
      return vw < A4_WIDTH ? vw / A4_WIDTH : 1;
    };
    const update = () => setScale(calc());
    const beforePrint = () => setScale(1);
    const afterPrint = () => setScale(calc());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);

  console.log("vatNo:", vatNo, "vatType:", vatType);
  useEffect(() => {
    console.log("useEffect ran");
    fetch(`/api/warehouse/bill/${vatNo}?vatType=${vatType}`)
      .then((r) => {
        console.log("fetch status:", r.status);
        return r.json();
      })
      .then((d) => {
        console.log("roll[0] keys:", Object.keys(d.rolls?.[0] ?? {}));
        console.log("roll[0] full:", JSON.stringify(d.rolls?.[0], null, 2));
        setRolls(d.rolls ?? []);
      })
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
      return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear() + 543}`;
    } catch {
      return "-";
    }
  };

  const fabricCode = first.altFabricStruct
    ? first.altFabricStruct
    : `${first.fabricStruct ?? ""} ${first.fabricPattern ?? ""} ${first.fabricW ? `${first.fabricW}''` : ""}`.trim() ||
      "-";

  const receiverName = first.altPurchaseOrder
    ? first.altPurchaseOrder
    : (first.receiveName ?? "-");

  return (
    <div className="min-h-screen bg-gray-400 print:bg-white print:p-0">
      <style>{`
        .a4-page { zoom: ${scale}; }
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
          .a4-page { zoom: 1; }
        }
      `}</style>

      <div className="no-print flex gap-3 p-4 sticky top-0 z-10 bg-gray-500/80 backdrop-blur-sm">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1" />
            <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1" />
          </svg>
          พิมพ์ใบส่งสินค้า
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
        >
          ปิด
        </button>
      </div>

      <div className="py-6 print:py-0">
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
            className={`a4-page w-198.5 min-h-280.75 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.3)] mx-auto p-6 print:p-0 print:shadow-none ${pageIdx < pages.length - 1 ? "page-break mb-8 print:mb-0" : "mb-8 print:mb-0"}`}
          >
            {/* Page header line */}
            <div className="flex justify-between items-baseline mb-1 px-1">
              <span className="text-xs">
                แผ่นที่ {pageIdx + 1} จาก ทั้งหมด {totalPages} แผ่น
              </span>
              <h1 className="text-base font-bold">
                ใบส่งสินค้า / Delivery Note
              </h1>
              <span className="text-sm font-bold">
                เลขที่ {vatType} - {vatNo}
              </span>
            </div>

            <div className="border border-gray-700">
              {/* Customer / Receiver */}
              <div className="grid grid-cols-2 border-b border-gray-500">
                <div className="px-3 py-1.5 border-r border-gray-500">
                  <span className="text-xs font-semibold">
                    ผู้สั่ง Order by :{" "}
                  </span>
                  <span className="text-xs font-bold">
                    {first.customerName ?? "-"}
                  </span>
                </div>
                <div className="px-3 py-1.5">
                  <span className="text-xs font-semibold">
                    ผู้รับ Received by :{" "}
                  </span>
                  <span className="text-xs font-bold">{receiverName}</span>
                </div>
              </div>

              {/* Fabric code / Date */}
              <div className="grid grid-cols-2 border-b border-gray-500">
                <div className="px-3 py-1.5 border-r border-gray-500">
                  <span className="text-xs font-semibold">รหัสผ้า Code : </span>
                  <span className="text-xs font-bold">{fabricCode}</span>
                </div>
                <div className="px-3 py-1.5">
                  <span className="text-xs font-semibold">วันที่ Date : </span>
                  <span className="text-xs font-bold">
                    {fmtDate(first.createDate)}
                  </span>
                </div>
              </div>

              {/* Table */}
              <table
                className="w-full border-collapse"
                style={{ fontSize: "10px" }}
              >
                <thead>
                  <tr>
                    {Array.from({ length: COLS }, (_, c) => (
                      <React.Fragment key={c}>
                        <th className="border border-gray-500 px-1 py-0.5 text-center font-medium w-8">
                          ลำดับ
                        </th>
                        <th className="border border-gray-500 px-1 py-0.5 text-center font-medium">
                          หลา
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: ROWS_PER_COL }, (_, r) => (
                    <tr key={r}>
                      {Array.from({ length: COLS }, (_, c) => {
                        const roll = slots[c * ROWS_PER_COL + r];
                        const slotNo =
                          pageIdx * ITEMS_PER_PAGE + c * ROWS_PER_COL + r + 1;
                        return (
                          <React.Fragment key={c}>
                            <td className="border border-gray-300 px-1 py-0 text-center text-gray-500 w-8">
                              {slotNo}
                            </td>
                            <td className="border border-gray-300 px-1 py-0 text-right font-medium">
                              {roll?.sumYard
                                ? Number(roll.sumYard).toLocaleString()
                                : ""}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Column sums row */}
                  <tr className="bg-gray-50">
                    {Array.from({ length: COLS }, (_, c) => (
                      <React.Fragment key={c}>
                        <td className="border border-gray-500 px-1 py-0.5 text-center text-xs font-semibold">
                          รวม
                        </td>
                        <td className="border border-gray-500 px-1 py-0.5 text-right text-xs font-semibold">
                          {colSums[c] > 0 ? colSums[c].toLocaleString() : 0}
                        </td>
                      </React.Fragment>
                    ))}
                  </tr>
                </tbody>
              </table>

              {/* Footer */}
              <div
                className="border-t border-gray-500 flex"
                style={{ minHeight: "100px" }}
              >
                {/* Left: Sample box */}
                <div
                  className="border-r border-gray-500 flex flex-col items-center justify-center px-6 py-3"
                  style={{ minWidth: "120px" }}
                >
                  <p className="text-xs font-medium">ตัวอย่างผ้า</p>
                  <p className="text-xs">Sample</p>
                </div>

                {/* Right: Total + Signature + Remark */}
                <div className="flex-1 flex flex-col justify-between px-4 py-2">
                  {/* Total */}
                  <div className="text-sm flex items-baseline gap-3 mb-2">
                    <span className="font-semibold">รวม</span>
                    <span className="font-bold text-base">{totalFold}</span>
                    <span className="text-gray-600">พับ</span>
                    <span className="text-gray-500 text-xs">Total</span>
                    <span className="text-gray-500 text-xs ml-1">Pieces</span>
                    <span className="font-bold text-base ml-4">
                      {totalYard.toLocaleString()}
                    </span>
                    <span className="text-gray-600">หลา</span>
                    <span className="text-gray-500 text-xs">Yards</span>
                  </div>

                  {/* Signature */}
                  <div className="mb-2">
                    <p className="text-xs font-medium">ลงชื่อประทับตรา</p>
                    <p className="text-xs text-gray-500">
                      Authorize Signature___________________________________
                    </p>
                  </div>

                  {/* Remark */}
                  <div>
                    <p className="text-xs font-semibold">หมายเหตุ</p>
                    <p className="text-xs text-gray-600">
                      ได้รับผ้าตามรายการข้างบนนี้ไว้ถูกต้องและเรียบร้อยแล้ว
                    </p>
                    <p className="text-xs text-gray-600">
                      Received the above goods in good order and condition
                    </p>
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
