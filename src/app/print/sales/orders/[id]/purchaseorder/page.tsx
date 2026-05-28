"use client";
import { useState, useEffect, use } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface OrderData {
  id: number;
  vat: string;
  purchaseOrder: string;
  customerName: string | null;
  payment: string | null;
  fabricId: string | null;
  fabricPattern: string | null;
  fabricStructure: string | null;
  orderSumYard: number | null;
  orderSumM: number | null;
  priceYard: number | null;
  priceM: number | null;
  discountP: number | null;
  surcharge: string | null;
  note: string | null;
  po: string | null;
  createDate: string;
  fabricAst: { fabricW: string | null; yarnHCount: string | null } | null;
  fabricAstStructure: {
    yarnHRatio1: string | null;
    yarnWRatio1: string | null;
    yarnHCount1: string | null;
    yarnHCount2: string | null;
    yarnWCount1: string | null;
    yarnWCount2: string | null;
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
    yarnWRatio3: string | null;
    yarnWRatio4: string | null;
  } | null;
  orderDeadlines: {
    id: number;
    dt: string | null;
    label: string | null;
    qty: number | null;
    unit: string | null;
  }[];
}

interface CustomerData {
  name: string;
  address: string | null;
  tax: string | null;
  tel: string | null;
}

const COMPANY = {
  nameTH: "บริษัท เอเซียเท็กซ์ไทล์ จำกัด",
  nameEN: "ASIA TEXTILE CO., LTD.",
  address:
    "789 หมู่ที่ 2 ซอยบางเมฆขาว ถนนสุขุมวิท ตำบลท้ายบ้าน อำเภอเมืองสมุทรปราการ จังหวัดสมุทรปราการ 10280",
  tel: "02-3892281-3",
  fax: "02-3892280",
  email: "s_asiatextile@gmail.com",
  tax: "0115531002270",
};

function fmt2(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmt3(n: number) {
  return n.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(d: string) {
  try {
    const dt = new Date(d);
    return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear()}`;
  } catch {
    return "-";
  }
}

export default function PurchaseOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/sales/orders/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("ไม่พบข้อมูล");
        return r.json();
      })
      .then((d) => {
        setOrder(d.order);
        setCustomer(d.customer ?? null);
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

  const typetag = order.fabricAstStructure?.yarnWRatio3 ?? "";
  const isM = typetag === "m";
  const surchargeRaw =
    order.surcharge ?? order.fabricAstStructure?.yarnWRatio4 ?? null;
  const surcharge = surchargeRaw ? parseFloat(surchargeRaw) : null;
  const isSurchargeValid =
    surcharge !== null && !isNaN(surcharge) && surcharge > 0;

  const qty = isM ? (order.orderSumM ?? 0) : (order.orderSumYard ?? 0);
  const unitPrice = isM ? (order.priceM ?? 0) : (order.priceYard ?? 0);
  let baseTotal = qty * unitPrice;
  if (isSurchargeValid) baseTotal += surcharge!;

  const discountPct = order.discountP ?? 0;
  const discountAmt = baseTotal * (discountPct / 100);
  const afterDiscount = baseTotal - discountAmt;
  const vatAmt = order.vat === "SO" ? afterDiscount * 0.07 : 0;
  const grandTotal = afterDiscount + vatAmt;

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
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
    pdf.save(`ใบสั่งขาย-${order.purchaseOrder}.pdf`);
  };

  console.log("fabricStructure:", order.fabricStructure);
  console.log("fabricW:", order.fabricAst?.fabricW);
  console.log("fabricPattern:", order.fabricPattern);
  console.log("yarnHCount:", order.fabricAst?.yarnHCount);
  console.log(
    "fabricAstStructure:",
    JSON.stringify(order.fabricAstStructure, null, 2),
  );
  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: A4; margin: 10mm 10mm; }
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
          ใบสั่งขาย — {order.purchaseOrder}
        </span>
      </div>

      {/* Document */}
      <div className="max-w-[210mm] mx-auto p-6 bg-white">
        {/* Header */}

        <div className="flex gap-4 mb-2">
          <div className="flex-shrink-0">
            <div className="w-20 h-20 bg-blue-700 flex items-center justify-center text-white font-bold text-xl rounded">
              AST
            </div>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-blue-900">
              {COMPANY.nameTH}
            </h1>
            <p className="text-base font-semibold text-gray-700">
              {COMPANY.nameEN}
            </p>
            <p className="text-xs text-gray-600 mt-1">{COMPANY.address}</p>
            <p className="text-xs text-gray-600">
              โทร : {COMPANY.tel} &nbsp;|&nbsp; แฟกซ์ {COMPANY.fax}{" "}
              &nbsp;|&nbsp; Email : {COMPANY.email}
            </p>
            <p className="text-xs text-gray-600">
              เลขประจำตัวผู้เสียภาษี : {COMPANY.tax}
            </p>
          </div>
        </div>

        <div className="text-center my-4 border-b-2">
          <h2 className="text-xl font-bold  border-gray-800 pb-1 inline-block px-8">
            ใบสั่งขาย
          </h2>
        </div>

        {/* Info section */}
        <div className="grid grid-cols-2 gap-x-8 mb-6 text-sm">
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">ชื่อลูกค้า</span>
              <span>{order.customerName ?? "-"}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">ที่อยู่</span>
              <span className="leading-relaxed">
                {customer?.address ?? "-"}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">
                เลขประจำตัวผู้เสียภาษี
              </span>
              <span className="font-mono">{customer?.tax ?? "-"}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">
                เลขที่ใบสั่งขาย
              </span>
              <span className="font-mono font-bold">{order.purchaseOrder}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">วันที่</span>
              <span>{fmtDate(order.createDate)}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold w-32 flex-shrink-0">
                เงื่อนไขการชำระเงิน
              </span>
              <span>{order.payment ?? "-"}</span>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table
          className="w-full border-collapse text-sm mb-4"
          style={{
            borderTop: "2px solid #333",
            borderBottom: "2px solid #333",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #333" }}>
              <th className="py-2 px-2 text-center font-bold w-10">ลำดับ</th>
              <th className="py-2 px-2 text-center font-bold">รายการสินค้า</th>
              <th className="py-2 px-2 text-center font-bold w-24">
                {isM ? "จำนวนเมตร" : "จำนวนหลา"}
              </th>
              <th className="py-2 px-2 text-center font-bold w-24">หน่วยละ</th>
              <th className="py-2 px-2 text-center font-bold w-28">
                จำนวนเงิน
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-3 px-2 text-center align-top">1</td>
              <td className="py-3 px-4">
                {(() => {
                  const fa = order.fabricAst;
                  const fas = order.fabricAstStructure;
                  const pattern = order.fabricPattern
                    ?.replace(/\([^)]+\)/g, "")
                    .trim();

                  const raw = order.fabricStructure || "";
                  const slashIdx = raw.search(/\/(?![^(]*\))/);
                  const structRaw =
                    slashIdx >= 0 ? raw.slice(0, slashIdx).trim() : raw.trim();
                  const wRaw =
                    slashIdx >= 0 ? raw.slice(slashIdx + 1).trim() : "";

                  const structParts = structRaw
                    .split("*")
                    .map((s: string) => s.trim())
                    .filter(Boolean);
                  const wParts = wRaw
                    .split("*")
                    .map((s: string) => s.trim())
                    .filter(Boolean);

                  const hRatio =
                    fas?.yarnHRatio1 && fas.yarnHRatio1 !== "no data"
                      ? fas.yarnHRatio1
                      : null;
                  const wRatio =
                    fas?.yarnWRatio1 && fas.yarnWRatio1 !== "no data"
                      ? fas.yarnWRatio1
                      : null;

                  return (
                    <>
                      {/* แถว ratio + struct: "25:1-->2เส้น  OE20  x  (OE20+OE7)  12:1" */}
                      {structParts.length >= 2 && (
                        <div className="grid grid-cols-3 text-center items-center mb-1">
                          <span>
                            {hRatio ? (
                              <div className="text-xs text-gray-500">
                                {hRatio}
                              </div>
                            ) : (
                              ""
                            )}
                            {structParts[0]}
                          </span>
                          <span>x</span>
                          <span>
                            {wRatio ? (
                              <div className="text-xs text-gray-500">
                                {wRatio}
                              </div>
                            ) : (
                              ""
                            )}
                            {structParts[1]}
                          </span>
                        </div>
                      )}
                      {structParts.length === 1 && (
                        <div className="text-center mb-1">{structParts[0]}</div>
                      )}

                      {/* เส้นแบ่ง + แถว W */}
                      {wParts.length >= 2 ? (
                        <div className="grid grid-cols-3 text-center border-t border-gray-400 pt-1 mb-1">
                          <span>{wParts[0]}</span>
                          <span>x</span>
                          <span>{wParts[1]}</span>
                        </div>
                      ) : wParts.length === 1 ? (
                        <div className="text-center border-t border-gray-400 pt-1 mb-1">
                          {wParts[0]}
                        </div>
                      ) : null}

                      {/* pattern: "25:1-->2เส้น กันลม 63" */}
                      {pattern && (
                        <div className="text-center my-5">
                          {hRatio ? `${hRatio} ` : ""}
                          {pattern}
                          {fa?.fabricW ? ` ${fa.fabricW}"` : ""}
                        </div>
                      )}

                      <div className="my-2">
                        <strong>รหัสผ้า</strong> {order.fabricId ?? "-"}
                      </div>
                    </>
                  );
                })()}
              </td>
              <td className="py-3 px-2 text-center align-top">
                {qty > 0 ? fmt2(qty) : "-"}
              </td>
              <td className="py-3 px-2 text-center align-top">
                {unitPrice > 0 ? fmt3(unitPrice) : "-"}
              </td>
              <td className="py-3 px-2 text-right align-top">
                {qty > 0 && unitPrice > 0 ? fmt2(qty * unitPrice) : "-"}
              </td>
            </tr>
            {isSurchargeValid && (
              <tr style={{ borderTop: "1px solid #ddd" }}>
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
                {order.note && order.note !== "no data" && (
                  <div>{order.note}</div>
                )}
                {order.vat === "SOX" && (
                  <div className="font-bold">ราคานี้รวม VAT แล้ว</div>
                )}
                {order.po && order.po !== "no data" && <div>{order.po}</div>}
              </div>
            </div>
          </div>

          {/* Totals right */}
          <div className="w-72 space-y-1">
            <div className="flex justify-between">
              <span>รวมเป็นเงิน</span>
              <div className="flex gap-2">
                <strong>{fmt2(baseTotal)}</strong>
                <span>บาท</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span>หักส่วนลด {discountPct} %</span>
              <div className="flex gap-2">
                <strong>{fmt2(discountAmt)}</strong>
                <span>บาท</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span>จำนวนเงินหลังหักส่วนลด</span>
              <div className="flex gap-2">
                <strong>{fmt2(afterDiscount)}</strong>
                <span>บาท</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span>จำนวนภาษีมูลค่าเพิ่ม</span>
              <div className="flex gap-2">
                <strong>{order.vat === "SO" ? fmt2(vatAmt) : "0.00"}</strong>
                <span>บาท</span>
              </div>
            </div>
            <div className="flex justify-between font-bold border-t border-gray-400 pt-1">
              <span>จำนวนเงินรวมทั้งสิ้น</span>
              <div className="flex gap-2">
                <strong>{fmt2(grandTotal)}</strong>
                <span>บาท</span>
              </div>
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
  );
}
