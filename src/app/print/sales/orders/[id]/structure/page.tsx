"use client";
import { useState, useEffect, use, type ReactNode, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface OrderData {
  id: number;
  vat: string;
  billNo: number | null;
  surcharge: string | null;
  purchaseOrder: string;
  customerName: string | null;
  fabricId: string | null;
  fabricPattern: string | null;
  fabricStructure: string | null;
  orderSumYard: number | null;
  orderSumM: number | null;
  fabricSPY: number | null;
  machineNumber: string | null;
  note: string | null;
  productionNote: string | null;
  po: string | null;
  createDate: string;
  fabricAst: {
    fabricW: string | null;
    yarnHCount: string | null;
    phewNumber: string | null;
    phewW: string | null;
    stackType: string | null;
    vat: string | null;
  } | null;
  fabricAstStructure: {
    yarnHType: string | null;
    yarnHType2: string | null;
    subNameH1: string | null;
    subNameH2: string | null;
    yarnWType: string | null;
    yarnWType2: string | null;
    yarnWType3: string | null;
    yarnWType4: string | null;
    subNameW1: string | null;
    subNameW2: string | null;
    subNameW3: string | null;
    subNameW4: string | null;
    yarnHRatio1: string | null;
    yarnWRatio1: string | null;
    yarnHCount1: string | null;
    yarnHCount2: string | null;
    yarnWCount1: string | null;
    yarnWCount2: string | null;
    yarnWRatio2: string | null;
    yarnWRatio3: string | null;
  } | null;
  orderDeadlines: {
    id: number;
    dt: string | null;
    label: string | null;
    qty: number | null;
    unit: string | null;
    pct: number | null;
  }[];
}

function fmtDate(d: string | null) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear()}`;
  } catch {
    return "-";
  }
}

function Field({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-2 py-[0.2rem] ${className}`}>
      <span className="font-bold text-base whitespace-nowrap w-40 shrink-0">
        {label} :
      </span>
      <span className="text-base flex-1 border-b border-dashed border-gray-400 pb-1.5 min-w-0">
        {value}
      </span>
    </div>
  );
}

export default function StructurePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/sales/orders/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("ไม่พบข้อมูล");
        return r.json();
      })
      .then((d) => {
        console.log("[structure] fabricAst:", d.order?.fabricAst);
        console.log(
          "[structure] fabricAstStructure:",
          d.order?.fabricAstStructure,
        );
        setOrder(d.order);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (error || !order)
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        {error || "ไม่พบข้อมูล"}
      </div>
    );

  const s = order.fabricAstStructure;
  const fa = order.fabricAst;
  const isM = s?.yarnWRatio3 === "m";

  const nd = (val: string | null | undefined): string | null =>
    !val || val.trim() === "no data" ? null : val.trim();

  const hRatio1 = nd(s?.yarnHRatio1);
  const wRatio1 = nd(s?.yarnWRatio1);

  const cleanName = (v: string | null | undefined) =>
    v?.replace("บริษัท", "").replace("จำกัด", "").trim();

  const warpYarnLine = (() => {
    const parts: string[] = [];
    const add = (v: string | null | undefined) => {
      const c = nd(v);
      if (c) parts.push(c);
    };
    add(s?.yarnHType);
    add(cleanName(s?.subNameH1));
    if (nd(s?.yarnHType2)) parts.push("+ " + nd(s?.yarnHType2));
    add(cleanName(s?.subNameH2));
    return parts.join(" ");
  })();

  const weftYarnLine = (() => {
    const parts: string[] = [];
    const add = (v: string | null | undefined) => {
      const c = nd(v);
      if (c) parts.push(c);
    };
    if (nd(s?.yarnWType)) parts.push(nd(s?.yarnWType)!);
    add(cleanName(s?.subNameW1));
    if (nd(s?.yarnWType2)) parts.push("+ " + nd(s?.yarnWType2));
    add(cleanName(s?.subNameW2));
    if (nd(s?.yarnWType3)) parts.push("+ " + nd(s?.yarnWType3));
    add(cleanName(s?.subNameW3));
    if (nd(s?.yarnWType4)) parts.push("+ " + nd(s?.yarnWType4));
    add(cleanName(s?.subNameW4));
    return parts.join(" ");
  })();

  const orderQty = (() => {
    const spy = order.fabricSPY ?? 0;
    if (isM) {
      const qty = order.orderSumM ?? 0;
      const total = spy * (qty / 100) + qty;
      return {
        value:
          total > 0
            ? Math.round(total).toLocaleString()
            : qty > 0
              ? qty.toLocaleString()
              : "-",
        unit: "เมตร",
        raw: qty,
      };
    } else {
      const qty = order.orderSumYard ?? 0;
      const total = spy * (qty / 100) + qty;
      return {
        value:
          total > 0
            ? Math.round(total).toLocaleString()
            : qty > 0
              ? qty.toLocaleString()
              : "-",
        unit: "หลา",
        raw: qty,
      };
    }
  })();

  const orderBase = isM ? (order.orderSumM ?? 0) : (order.orderSumYard ?? 0);

  const note = nd(order.productionNote) ?? nd(order.note) ?? "";

  const yarnCount = (() => {
    const raw = nd(order.fabricStructure);
    if (!raw) return null;
    // Find first single slash (not //) by masking // as null bytes (preserves positions)
    const singleSlashIdx = (s: string) =>
      s.replace(/\/\//g, "\0\0").indexOf("/");
    const si = singleSlashIdx(raw);
    if (si < 0) {
      return {
        structParts: raw
          .split("*")
          .map((p) => p.trim())
          .filter(Boolean),
        wParts: [] as string[],
      };
    }
    const part1 = raw.slice(0, si).trim();
    const rest = raw.slice(si + 1).trim();
    let structParts: string[];
    let countsStr: string;
    if (part1.includes("*")) {
      structParts = part1
        .split("*")
        .map((p) => p.trim())
        .filter(Boolean);
      const wi = singleSlashIdx(rest);
      countsStr = wi >= 0 ? rest.slice(0, wi).trim() : rest.trim();
    } else {
      const si2 = singleSlashIdx(rest);
      if (si2 < 0) {
        structParts = [part1].filter(Boolean);
        countsStr = rest.trim();
      } else {
        structParts = [part1, rest.slice(0, si2).trim()].filter(Boolean);
        const rest2 = rest.slice(si2 + 1).trim();
        const wi2 = singleSlashIdx(rest2);
        countsStr = wi2 >= 0 ? rest2.slice(0, wi2).trim() : rest2.trim();
      }
    }
    const wParts = countsStr
      .split("*")
      .map((p) => p.trim())
      .filter((p) => p && /^\d/.test(p));
    return { structParts, wParts };
  })();

  const handleDownloadPDF = async () => {
    try {
      const el = document.getElementById("print-body");
      if (!el) return;

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: Math.max(document.documentElement.scrollWidth, 1280),
        onclone: (_clonedDoc, clonedEl) => {
          const doc = clonedEl.ownerDocument!;
          const style = doc.createElement("style");
          style.textContent = `
          #print-body, #print-body * {
            color: #000 !important;
            background-color: transparent !important;
            -webkit-print-color-adjust: exact;
          }
          #print-body { background-color: #fff !important; }
          .border-dashed { border-style: dashed !important; }
          .border-b { border-bottom-width: 1px !important; }
          .border-t-2 { border-top-width: 2px !important; }
          .border-gray-800 { border-color: #1f2937 !important; }
          .border-gray-400 { border-color: #9ca3af !important; }
          .border-gray-500 { border-color: #6b7280 !important; }
        `;
          doc.head.appendChild(style);
          doc.querySelectorAll("*").forEach((el) => {
            const htmlEl = el as HTMLElement;
            const cs = doc.defaultView?.getComputedStyle(htmlEl);
            if (!cs) return;
            (["color", "background-color", "border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color"] as const).forEach((prop) => {
              const val = cs.getPropertyValue(prop);
              if (val && (val.includes("lab(") || val.includes("oklch(") || val.includes("oklab("))) {
                htmlEl.style.setProperty(prop, "#000000", "important");
              }
            });
          });
        },
      });

      const imgData = canvas.toDataURL("image/png");
      const pdfW = 228.6; // 9 inches
      const pdfH = 139.7; // 5.5 inches
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [pdfW, pdfH],
      });
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      pdf.save(`ใบโครงสร้าง-${order!.purchaseOrder}.pdf`);
    } catch (e) {
      console.error("PDF error:", e);
    }
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          nextjs-portal { display: none !important; }
          html, body {
            margin: 0 !important; padding: 0 !important;
            height: 100% !important;
            overflow: hidden !important;
          }
          .min-h-screen { min-height: 0 !important; height: auto !important; }
          .p-8 { padding: 0 !important; }
          @page { size: 9in 5.5in; margin: 0; }
          #print-body {
            page-break-after: avoid; page-break-inside: avoid;
            break-after: avoid; break-inside: avoid;
            width: 9in !important;
            max-width: 100% !important;
            height: 5.5in !important;
            max-height: 100vh !important;
            margin: 0 !important;
            padding: 8mm 5mm 5mm !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
          #print-body .text-base { font-size: 13pt !important; line-height: 1.35 !important; }
          #print-body .text-sm  { font-size: 9.5pt !important; }
          #print-body .text-lg  { font-size: 14pt !important; }
          #print-body .text-xl  { font-size: 15.5pt !important; }
          #print-body .w-40 { width: 118px !important; }
          #print-body .gap-8  { gap: 1.5rem !important; }
          #print-body .gap-16 { gap: 2rem !important; }
          #print-body .pb-6   { padding-bottom: 0.3rem !important; }
          #print-body .mt-8   { margin-top: 0 !important; }
          #print-body .mt-6   { margin-top: 0 !important; }
          #print-body .mt-5   { margin-top: 0 !important; }
          #print-body .mt-4   { margin-top: 0 !important; }
          #print-body .mt-3   { margin-top: 0 !important; }
          #print-body .mt-2   { margin-top: 0 !important; }
          #print-body .mt-1   { margin-top: 0 !important; }
          #print-body .mb-2   { margin-bottom: 0 !important; }
          #print-body .mb-1   { margin-bottom: 0 !important; }
          #print-body .mt-1\.5 { margin-top: 0 !important; }
          #print-body .print-sig { margin-top: auto !important; padding-top: 0 !important; }
          #print-body .border-dashed { border-style: dashed !important; }
          #print-body .border-b { border-bottom-width: 1px !important; }
          #print-body .border-t-2 { border-top-width: 2px !important; }
          #print-body .border-gray-800 { border-color: #1f2937 !important; }
          #print-body .border-gray-400 { border-color: #9ca3af !important; }
          #print-body .border-gray-500 { border-color: #6b7280 !important; }
          #print-body * { color: #000 !important; background-color: transparent !important; }
          #print-body { background-color: #fff !important; }
        }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; }
      .a4-page {
        font-family: 'Sarabun', 'Tahoma', sans-serif;
        background-color: #fff;
      }
      .a4-page * {
        -webkit-text-size-adjust: none;
        text-size-adjust: none;
        min-width: 0;
        color: #000;
        background-color: transparent;
      }
      .a4-page .bg-white {
        background-color: #fff !important;
      }
      .a4-page .text-sm  { font-size: 0.9rem; }
      .a4-page .text-base { font-size: 1.25rem; }
      .a4-page .text-lg  { font-size: 1.3rem; }
      .a4-page .text-xl  { font-size: 1.45rem; }
      `}</style>

      {/* Print button bar */}
      <div className="no-print flex gap-3 p-4 sticky top-0 z-10 bg-gray-500/80 backdrop-blur-sm">
        <button
          type="button"
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
          พิมพ์
        </button>
        <button
          type="button"
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5" />
            <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z" />
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
        <span className="text-sm text-gray-300 ml-2 self-center">
          ใบโครงสร้าง — {order.purchaseOrder}
        </span>
      </div>

      {/* Document */}
      <div className="bg-gray-400 print:bg-white print:p-0 min-h-screen print:min-h-0 print:h-auto p-8">
        <div
          id="print-body"
          className="a4-page max-w-5xl mx-auto p-6 print:p-3 shadow-xl print:shadow-none flex flex-col min-h-132"
        >
          {/* Header */}
          <div className="flex items-baseline justify-between mb-4 font-bold text-base">
            <span>
              ชื่อลูกค้า:{" "}
              {order.customerName
                ?.replace("(สำนักงานใหญ่)", "")
                .replace("(สำนักงานใหญ่)", "")
                .trim() ?? "-"}
            </span>
            <div className="flex gap-8">
              <span>วันที่: {fmtDate(order.createDate)}</span>
              <span>No.: {order.billNo}</span>
            </div>
          </div>

          {/* Yarn count + fabric info row */}

          {(yarnCount || nd(fa?.fabricW) || nd(order.fabricPattern)) && (
            <div className="grid grid-cols-2 gap-6 mb-2">
              {/* Block 1: yarn count + fabricW */}
              {(yarnCount || nd(fa?.fabricW)) && (
                <div className="flex items-center gap-4 shrink-0">
                  {yarnCount && (
                    <div className="w-full">
                      {yarnCount.structParts.length >= 2 && (
                        <div className="flex justify-center items-center gap-3 mb-2">
                          <div className="text-center whitespace-nowrap pb-1">
                            {hRatio1 && (
                              <div className="text-sm text-gray-500">
                                {hRatio1}
                              </div>
                            )}
                            <span className="font-semibold text-lg">
                              {yarnCount.structParts[0]}
                            </span>
                          </div>
                          <div className="font-bold text-lg px-1">x</div>
                          <div className="text-center whitespace-nowrap">
                            {wRatio1 && (
                              <div className="text-sm text-gray-500">
                                {wRatio1}
                              </div>
                            )}
                            <span className="font-semibold text-lg">
                              {yarnCount.structParts[1]}
                            </span>
                          </div>
                        </div>
                      )}
                      {yarnCount.structParts.length === 1 && (
                        <div className="text-center font-semibold text-lg mb-2 whitespace-nowrap">
                          {yarnCount.structParts[0]}
                        </div>
                      )}
                      {yarnCount.wParts.length >= 2 ? (
                        <div className="flex justify-center items-center gap-3 border-t-2 border-gray-800 pt-2 font-bold text-xl">
                          <span className="whitespace-nowrap">
                            {yarnCount.wParts[0]}
                          </span>
                          <span className="px-1">x</span>
                          <span className="whitespace-nowrap">
                            {yarnCount.wParts[1]}
                          </span>
                        </div>
                      ) : yarnCount.wParts.length === 1 ? (
                        <div className="text-center border-t-2 border-gray-800 pt-1 font-bold text-xl whitespace-nowrap">
                          {yarnCount.wParts[0]}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {nd(fa?.fabricW) && (
                    <span className="font-semibold text-base pb-0.5">
                      {nd(fa?.fabricW)} &quot;
                    </span>
                  )}
                </div>
              )}
              {/* Block 2: ลายผ้า */}
              {nd(order.fabricPattern) && (
                <div>
                  <Field label="ลายผ้า" value={nd(order.fabricPattern)!} />
                </div>
              )}
            </div>
          )}

          {/* Fields */}
          <div className="flex gap-8 mt-3 text-base">
            {/* Left column */}
            <div className="flex-1 flex flex-col min-w-0">
              <Field label="จำนวนด้ายยืน" value={nd(fa?.yarnHCount) ?? ""} />
              <Field label="ชนิดด้ายยืน" value={warpYarnLine} />
              <Field label="ชนิดด้ายพุ่ง" value={weftYarnLine} />
              <Field label="จำนวนด้ายพุ่ง" value={nd(s?.yarnWCount1) ?? ""} />
              <Field label="ฟันหวีเบอร์" value={nd(fa?.phewNumber) ?? ""} />
              <Field label="พ่นสีลงผ้า" value={nd(fa?.stackType) ?? ""} />
              <Field
                label="ออร์เดอร์สืบ"
                value={
                  orderQty.raw > 0 ? `${orderQty.value} ${orderQty.unit}` : ""
                }
              />
              <Field label="ชนิดเครื่องทอ" value={null} className="mt-1.5" />
            </div>
            {/* Right column */}
            <div className="flex-1 flex flex-col min-w-0">
              <Field label="รหัสผ้า" value={nd(order.fabricId) ?? ""} />
              <Field
                label="หน้าผ้ากว้าง"
                value={nd(fa?.fabricW) ? `${nd(fa?.fabricW)} นิ้ว` : ""}
                className="mt-8"
              />
              <Field
                label="หน้าหวีกว้าง"
                value={nd(fa?.phewW) ? `${nd(fa?.phewW)} นิ้ว` : ""}
              />
              <Field
                label="กำหนดส่ง"
                value={
                  order.orderDeadlines.length > 0
                    ? order.orderDeadlines
                        .map(
                          (d, i) =>
                            `${i + 1}. ${fmtDate(d.dt)}${d.qty ? ` ${d.qty.toLocaleString()} ${d.unit ?? "หลา"}` : ""}${d.pct ? ` (${d.pct}%)` : ""}`,
                        )
                        .join("  ")
                    : ""
                }
                className="mt-5"
              />
              <Field
                label="เบอร์เครื่อง"
                value={nd(order.machineNumber) ?? ""}
              />
            </div>
          </div>

          {/* Notes */}
          {(note && note !== "no data") ||
          order.vat === "SOX" ||
          (order.po && order.po !== "no data") ||
          orderBase > 0 ? (
            <div className="mt-2 text-base">
              <span className="font-bold">หมายเหตุ :</span>
              <div className="ml-1 inline">
                {note && note !== "no data" && <span> {note}</span>}
                {order.vat === "SOX" && (
                  <span className="font-bold"> ราคานี้รวม VAT แล้ว</span>
                )}
                {order.po && order.po !== "no data" && <span> {order.po}</span>}
              </div>
              {orderBase > 0 && (
                <div className="mt-0.5 font-bold">
                  ออร์เดอร์ : {orderBase.toLocaleString()}{" "}
                  {isM ? "เมตร" : "หลา"}
                </div>
              )}
            </div>
          ) : null}

          {/* Signatures */}
          <div className="print-sig grid grid-cols-2 gap-8 mt-auto pt-16">
            <div>
              <div className="border-b border-gray-500 pb-6"></div>
              <p className="text-base mt-1 text-center">ผู้สั่งงาน</p>
            </div>
            <div>
              <div className="border-b border-gray-500 pb-6"></div>
              <p className="text-base mt-1 text-center">ผู้ตรวจสอบ</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
