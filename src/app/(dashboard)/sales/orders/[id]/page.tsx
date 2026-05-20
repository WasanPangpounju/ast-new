"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";

interface OrderDetail {
  id: number;
  purchaseOrder: string;
  vat: string;
  customerName: string | null;
  fabricId: string | null;
  fabricPattern: string | null;
  fabricStructure: string | null;
  priceYard: number | null;
  priceM: number | null;
  discountP: number | null;
  discountYard: number | null;
  commission: number | null;
  orderSumYard: number | null;
  orderSumM: number | null;
  status: string | null;
  deadline: string | null;
  createDate: string;
  fabricAst: {
    fabricW: string | null;
    yarnHCount: string | null;
    phewNumber: string | null;
    payment: string | null;
  } | null;
  fabricAstStructure: {
    yarnHType: string | null;
    yarnWType: string | null;
    yarnHCount1: string | null;
    yarnWCount1: string | null;
    yarnWRatio2: string | null;
  } | null;
  orderDeadlines: { id: number; dt: string | null; label: string | null }[];
}

interface FabricOut {
  id: number;
  fold: number;
  sumYard: number;
  vatType: string;
  vatNo: number;
  fabricStruct: string | null;
  customerName: string | null;
  createDate: string;
}

interface CustomerInfo {
  id: number;
  name: string;
  tax: string | null;
  address: string | null;
  tel: string | null;
  email: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  อนุมัติให้ผลิต: "bg-green-100 text-green-700",
  รอดำเนินการ: "bg-yellow-100 text-yellow-700",
  เสร็จสิ้น: "bg-blue-100 text-blue-700",
  ยกเลิก: "bg-red-100 text-red-700",
  "no data": "bg-gray-100 text-gray-500",
};

const STATUSES = [
  "รอดำเนินการ",
  "อนุมัติให้ผลิต",
  "เสร็จสิ้น",
  "ยกเลิก",
  "no data",
];

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [fabricOuts, setFabricOuts] = useState<FabricOut[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    fetch(`/api/sales/orders/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setOrder(d.order);
        setFabricOuts(d.fabricOuts ?? []);
        setCustomer(d.customer ?? null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleStatusChange(newStatus: string) {
    if (!order) return;
    setChangingStatus(true);
    try {
      await fetch(`/api/sales/orders/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setOrder((o) => (o ? { ...o, status: newStatus } : o));
    } finally {
      setChangingStatus(false);
    }
  }

  const fmtDate = (d: string | null) => {
    if (!d) return "-";
    try {
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear() + 543}`;
    } catch {
      return "-";
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!order)
    return <div className="p-4 text-center text-gray-500">ไม่พบใบสั่งขาย</div>;

  const s = order.status ?? "no data";
  const totalDeliveredYard = fabricOuts.reduce(
    (sum, f) => sum + (f.sumYard ?? 0),
    0,
  );
  const totalDeliveredFold = fabricOuts.length;
  const remaining = (order.orderSumYard ?? 0) - totalDeliveredYard;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => router.push("/sales/orders/review")}
              className="text-xs text-gray-500 hover:text-gray-700 mb-2 flex items-center gap-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                className="bi bi-arrow-left"
                viewBox="0 0 16 16"
              >
                <path
                  fillRule="evenodd"
                  d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"
                />
              </svg>{" "}
              กลับ
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-mono font-bold text-gray-900">
                {order.purchaseOrder}
              </h1>
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${
                  order.vat === "SOX"
                    ? "bg-purple-100 text-purple-700"
                    : order.vat === "SOB"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-blue-100 text-blue-700"
                }`}
              >
                {order.vat}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[s] ?? "bg-gray-100 text-gray-500"}`}
              >
                {s}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {order.customerName ?? "-"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              วันที่: {fmtDate(order.createDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={order.status ?? "no data"}
              disabled={changingStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <button
              onClick={() => router.push(`/sales/orders/${id}/edit`)}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              แก้ไข
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            ข้อมูลลูกค้า
          </h2>
          {customer ? (
            <div className="space-y-1.5 text-sm">
              <div>
                <span className="text-gray-500 text-xs">ชื่อ:</span>{" "}
                <span className="font-medium">{customer.name}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs">
                  เลขที่ผู้เสียภาษี:
                </span>{" "}
                <span className="font-mono">{customer.tax ?? "-"}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs">ที่อยู่:</span>{" "}
                <span className="text-xs text-gray-700">
                  {customer.address ?? "-"}
                </span>
              </div>
              <div>
                <span className="text-gray-500 text-xs">โทร:</span>{" "}
                <span>{customer.tel ?? "-"}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">{order.customerName ?? "-"}</p>
          )}
        </div>

        {/* Fabric info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            ข้อมูลผ้า
          </h2>
          <div className="space-y-1.5 text-sm">
            <div>
              <span className="text-gray-500 text-xs">รหัสผ้า:</span>{" "}
              <span className="font-medium">{order.fabricId ?? "-"}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs">โครงสร้าง:</span>{" "}
              <span className="text-xs">{order.fabricStructure ?? "-"}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs">ลาย:</span>{" "}
              <span>{order.fabricPattern ?? "-"}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs">หน้ากว้าง:</span>{" "}
              <span>{order.fabricAst?.fabricW ?? "-"}</span>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            ราคา
          </h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">ราคา/หลา:</span>
              <span className="font-medium">
                {order.priceYard?.toLocaleString() ?? "-"} บาท
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">ราคา/เมตร:</span>
              <span>{order.priceM?.toLocaleString() ?? "-"} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">ส่วนลด %:</span>
              <span>{order.discountP ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">ส่วนลด/หลา:</span>
              <span>{order.discountYard?.toLocaleString() ?? "-"} บาท</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">คอมมิชชั่น:</span>
              <span>{order.commission?.toLocaleString() ?? "-"} บาท</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1.5">
              <span className="text-gray-500 text-xs">ยอดสั่ง (เมตร):</span>
              <span className="font-semibold text-blue-700">
                {order.orderSumM?.toLocaleString() ?? "-"} เมตร
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">ยอดสั่ง (หลา):</span>
              <span className="font-semibold">
                {order.orderSumYard?.toLocaleString() ?? "-"} หลา
              </span>
            </div>
          </div>
        </div>

        {/* Delivery summary */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            สรุปการส่ง
          </h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">ส่งแล้ว:</span>
              <span className="font-medium text-green-700">
                {totalDeliveredYard.toLocaleString()} หลา ({totalDeliveredFold}{" "}
                พับ)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-xs">คงค้าง:</span>
              <span
                className={`font-medium ${remaining <= 0 ? "text-blue-600" : "text-orange-600"}`}
              >
                {remaining.toLocaleString()} หลา
              </span>
            </div>
            {order.orderDeadlines.length > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                <div className="text-xs text-gray-500 mb-1">กำหนดส่ง:</div>
                {order.orderDeadlines.map((d) => (
                  <div key={d.id} className="flex justify-between text-xs">
                    <span className="text-gray-600">
                      {d.label ?? "กำหนดส่ง"}
                    </span>
                    <span className="font-mono">{fmtDate(d.dt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fabric outs history */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            ประวัติการส่งผ้า ({fabricOuts.length} รายการ)
          </h2>
        </div>
        {fabricOuts.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            ยังไม่มีการส่งผ้า
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2 font-medium text-gray-600">
                    วันที่
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">
                    บิล
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">
                    โครงสร้างผ้า
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">
                    พับ
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">
                    หลา
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fabricOuts.map((f) => (
                  <tr key={f.id} className="hover:bg-blue-50/20">
                    <td className="px-3 py-2 text-gray-500">
                      {fmtDate(f.createDate)}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-800">
                      {f.vatType}
                      {f.vatNo}
                    </td>
                    <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">
                      {f.fabricStruct ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-800">
                      {f.fold}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {f.sumYard.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-yellow-50 border-t-2 border-gray-200 font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-gray-600">
                    รวม
                  </td>
                  <td className="px-3 py-2 text-right text-gray-800">
                    {totalDeliveredFold} พับ
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900">
                    {totalDeliveredYard.toLocaleString()} หลา
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
