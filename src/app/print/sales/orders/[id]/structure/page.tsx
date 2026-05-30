"use client";
import { useState, useEffect, use, type ReactNode } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface OrderData {
  id: number;
  vat: string;
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
    <div className={`flex items-baseline gap-2 py-0.5 ${className}`}>
      <span className="font-bold text-sm whitespace-nowrap w-32 shrink-0">
        {label} :
      </span>
      <span className="text-sm flex-1 border-b border-dashed border-gray-400 pb-0.5 min-w-0">
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
      .then((d) => setOrder(d.order))
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
  const showRatioRow = hRatio1 || wRatio1;
  const hCount1 = nd(s?.yarnHCount1) ?? "";
  const wCount1 = nd(s?.yarnWCount1) ?? "";

  const warpYarnLine = (() => {
    const parts: string[] = [];
    const add = (v: string | null | undefined) => {
      const c = nd(v);
      if (c) parts.push(c);
    };
    add(s?.yarnHType);
    add(s?.subNameH1?.replace("บริษัท", "").trim());
    if (nd(s?.yarnHType2)) {
      parts.push("+ " + nd(s?.yarnHType2));
      add(s?.subNameH2?.replace("บริษัท", "").replace("จำกัด", "").trim());
    }
    return parts.join(" ");
  })();

  const weftYarnLine = (() => {
    const parts: string[] = [];
    const add = (v: string | null | undefined) => {
      const c = nd(v);
      if (c) parts.push(c);
    };
    if (nd(s?.yarnWType)) {
      parts.push(nd(s?.yarnWType)!);
      add(s?.subNameW1?.replace("บริษัท", "").trim());
    }
    if (nd(s?.yarnWType2)) {
      parts.push("+ " + nd(s?.yarnWType2));
      add(s?.subNameW2?.replace("บริษัท", "").replace("จำกัด", "").trim());
    }
    if (nd(s?.yarnWType3)) {
      parts.push("+ " + nd(s?.yarnWType3));
      add(s?.subNameW3?.replace("บริษัท", "").replace("จำกัด", "").trim());
    }
    if (nd(s?.yarnWType4)) {
      parts.push("+ " + nd(s?.yarnWType4));
      add(s?.subNameW4?.replace("บริษัท", "").replace("จำกัด", "").trim());
    }
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
  const machineType = nd(fa?.stackType) ?? "";

  const yarnCount = (() => {
    const raw = nd(order.fabricStructure);
    if (!raw) return null;
    const slashIdx = raw.search(/(?<!\/)\/(?!\/)(?![^(]*\))/);
    const structRaw =
      slashIdx >= 0 ? raw.slice(0, slashIdx).trim() : raw.trim();
    const wRaw = slashIdx >= 0 ? raw.slice(slashIdx + 1).trim() : "";
    const structParts = structRaw
      .split("*")
      .map((p) => p.trim())
      .filter(Boolean);
    const wRawCounts = wRaw.split(/(?<!\/)\/(?!\/)(?![^(]*\))/)[0].trim();
    const wParts = wRawCounts
      .split("*")
      .map((p) => p.trim())
      .filter(Boolean);
    return { structParts, wParts };
  })();

  const handleDownloadPDF = async () => {
    const el = document.getElementById("print-body");
    if (!el) return;
    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [254, 165.1],
    });
    pdf.addImage(imgData, "PNG", 0, 0, 254, 165.1);
    pdf.save(`ใบโครงสร้าง-${order.purchaseOrder}.pdf`);
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          nextjs-portal { display: none !important; }
          html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
          @page { size: 10in 6.5in landscape; margin: 8mm 12mm; }
          #print-body { page-break-after: avoid; page-break-inside: avoid; break-after: avoid; break-inside: avoid; }
        }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; }
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
      <div className="bg-gray-400 print:bg-white print:p-0 min-h-screen p-8">
        <div
          id="print-body"
          className="max-w-5xl mx-auto p-8 print:p-4 bg-white shadow-xl print:shadow-none"
        >
          {/* Header */}
          <div className="flex items-baseline gap-8 mb-4 font-bold text-sm">
            <span>
              ชื่อลูกค้า:{" "}
              {order.customerName
                ?.replace("(สำนักงานใหญ่)", "")
                .replace("(สำนักงานใหญ่)", "")
                .trim() ?? "-"}
            </span>
            <span>วันที่: {fmtDate(order.createDate)}</span>
            <span>No.: {order.purchaseOrder}</span>
          </div>

          {/* Yarn count + fabric info row */}

          {(yarnCount || nd(fa?.fabricW) || nd(order.fabricPattern)) && (
            <div className="flex items-start gap-10 mb-2">
              {/* Block 1: yarn count + fabricW */}
              {(yarnCount || nd(fa?.fabricW)) && (
                <div className="flex-1 flex items-center gap-6">
                  {yarnCount && (
                    <div className="min-w-80">
                      {yarnCount.structParts.length >= 2 && (
                        <div className="grid grid-cols-3 text-center mb-0.5">
                          <div>
                            {hRatio1 && <div className="text-xs text-gray-500">{hRatio1}</div>}
                            <span className="font-semibold">{yarnCount.structParts[0]}</span>
                          </div>
                          <div className="font-bold">x</div>
                          <div>
                            {wRatio1 && <div className="text-xs text-gray-500">{wRatio1}</div>}
                            <span className="font-semibold">{yarnCount.structParts[1]}</span>
                          </div>
                        </div>
                      )}
                      {yarnCount.structParts.length === 1 && (
                        <div className="text-center font-semibold mb-0.5">{yarnCount.structParts[0]}</div>
                      )}
                      {yarnCount.wParts.length >= 2 ? (
                        <div className="grid grid-cols-3 text-center border-t-2 border-gray-800 pt-1 font-bold text-base">
                          <span>{yarnCount.wParts[0]}</span>
                          <span>x</span>
                          <span>{yarnCount.wParts[1]}</span>
                        </div>
                      ) : yarnCount.wParts.length === 1 ? (
                        <div className="text-center border-t-2 border-gray-800 pt-1 font-bold text-base">{yarnCount.wParts[0]}</div>
                      ) : null}
                    </div>
                  )}
                  {nd(fa?.fabricW) && (
                    <span className="font-semibold text-sm pb-0.5">{nd(fa?.fabricW)} &quot;</span>
                  )}
                </div>
              )}
              {/* Block 2: ลายผ้า */}
              {nd(order.fabricPattern) && (
                <div className="flex-1">
                  <Field label="ลายผ้า" value={nd(order.fabricPattern)!} />
                </div>
              )}
            </div>
          )}

          {/* Fields */}
          <div className="flex gap-8 mt-3 text-sm">
            {/* Left column */}
            <div className="flex-1 flex flex-col">
              {nd(fa?.yarnHCount) && (
                <Field label="จำนวนด้ายยืน" value={nd(fa?.yarnHCount)!} />
              )}
              {warpYarnLine && (
                <Field label="ชนิดด้ายยืน" value={warpYarnLine} />
              )}
              {weftYarnLine && (
                <Field label="ชนิดด้ายพุ่ง" value={weftYarnLine} />
              )}
              {nd(fa?.phewW) && (
                <Field label="หน้าหวีกว้าง" value={`${nd(fa?.phewW)} นิ้ว`} />
              )}
              {machineType && (
                <Field label="ชนิดเครื่องทอ" value={machineType} />
              )}
            </div>
            {/* Right column */}
            <div className="flex-1 flex flex-col">
              {nd(order.fabricId) && (
                <Field label="รหัสผ้า" value={nd(order.fabricId)!} />
              )}
              {nd(s?.yarnWCount1) && (
                <Field label="จำนวนด้ายพุ่ง" value={nd(s?.yarnWCount1)!} />
              )}
              {nd(fa?.phewNumber) && (
                <Field label="ฟันหวีเบอร์" value={nd(fa?.phewNumber)!} />
              )}
              {nd(order.vat) && (
                <Field label="พ่นสีลงผ้า" value={nd(order.vat)!} />
              )}
              {orderQty.raw > 0 && (
                <Field
                  label="ออร์เดอร์สืบ"
                  value={`${orderQty.value} ${orderQty.unit}`}
                />
              )}
              {order.orderDeadlines.length > 0 && (
                <Field
                  label="กำหนดส่ง"
                  value={order.orderDeadlines
                    .map(
                      (d, i) =>
                        `${i + 1}. ${fmtDate(d.dt)}${d.qty ? ` ${d.qty.toLocaleString()} ${d.unit ?? "หลา"}` : ""}${d.pct ? ` (${d.pct}%)` : ""}`,
                    )
                    .join("  ")}
                />
              )}
              {nd(order.machineNumber) && (
                <Field label="เบอร์เครื่อง" value={nd(order.machineNumber)!} />
              )}
            </div>
          </div>

          {/* Notes */}
          {(note && note !== "no data") ||
          order.vat === "SOX" ||
          (order.po && order.po !== "no data") ||
          orderBase > 0 ? (
            <div className="mt-3 text-sm">
              <span className="font-bold">หมายเหตุ</span>
              <div className="ml-1 inline">
                {note && note !== "no data" && <span> {note}</span>}
                {order.vat === "SOX" && (
                  <span className="font-bold"> ราคานี้รวม VAT แล้ว</span>
                )}
                {order.po && order.po !== "no data" && <span> {order.po}</span>}
              </div>
              {orderBase > 0 && (
                <div className="mt-0.5">
                  ออร์เดอร์ : {orderBase.toLocaleString()}{" "}
                  {isM ? "เมตร" : "หลา"}
                </div>
              )}
            </div>
          ) : null}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-16 mt-8">
            <div>
              <div className="border-b border-gray-500 pb-6"></div>
              <p className="text-sm mt-1 text-center">ผู้สั่งงาน</p>
            </div>
            <div>
              <div className="border-b border-gray-500 pb-6"></div>
              <p className="text-sm mt-1 text-center">ผู้ตรวจสอบ</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
