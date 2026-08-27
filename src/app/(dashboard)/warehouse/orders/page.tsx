"use client";
import { useState, useCallback } from "react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { InfiniteScrollStatus } from "@/components/InfiniteScrollStatus";

interface Order {
  id: number;
  purchaseOrder: string;
  customerName: string | null;
  fabricId: string | null;
  fabricPattern: string | null;
  fabricStructure: string | null;
  orderSumYard: number | null;
  createDate: string;
  createdAt: string;
  deliveredYard: number;
  deliveredFold: number;
  remainingYard: number;
  fabricAst: { fabricW: string | null; phewW: string | null } | null;
  fabricAstStructure: {
    yarnWRatio2: string | null;
    yarnHType: string | null;
    yarnWType: string | null;
    yarnHCount1: string | null;
    yarnWCount1: string | null;
  } | null;
}

export default function WarehouseOrdersPage() {
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [fabricId, setFabricId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({
    search: "",
    customer: "",
    fabricId: "",
    dateFrom: "",
    dateTo: "",
  });

  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [orderBills, setOrderBills] = useState<any[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);

  const fetchOrdersPage = useCallback((page: number) => {
    const p = new URLSearchParams({
      page: String(page),
      ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)),
    });
    return fetch(`/api/warehouse/orders?${p}`)
      .then((r) => r.json())
      .then((d) => ({ items: d.orders ?? [], total: d.total ?? 0 }));
  }, [applied]);

  const { items: orders, total, initialLoading, loadingMore, hasMore, sentinelRef } = useInfiniteScroll<Order>(fetchOrdersPage);

  const handleSearch = () => {
    setApplied({ search, customer, fabricId, dateFrom, dateTo });
  };
  const handleClear = () => {
    setSearch("");
    setCustomer("");
    setFabricId("");
    setDateFrom("");
    setDateTo("");
    setApplied({
      search: "",
      customer: "",
      fabricId: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  async function openDetail(order: Order) {
    setDetailOrder(order);
    setOrderBills([]);
    setBillsLoading(true);
    try {
      const res = await fetch(`/api/warehouse/orders/${order.id}/bills`);
      const data = await res.json();
      setOrderBills(data.bills ?? []);
    } catch {}
    setBillsLoading(false);
  }

  function handleSend(order: Order) {
    const params = new URLSearchParams({
      orderId: String(order.id),
      purchaseOrder: order.purchaseOrder ?? "",
      customerName: order.customerName ?? "",
      fabricStruct: order.fabricStructure ?? "",
      fabricPattern: order.fabricPattern ?? "",
      fabricW: order.fabricAst?.fabricW ?? order.fabricAst?.phewW ?? "",
      fabricCode: order.fabricId ?? "",
    });
    window.location.href = `/warehouse/bill/create?${params}`;
  }

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear()}`;
    } catch {
      return "-";
    }
  };

  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">
            ออร์เดอร์ลูกค้า
          </h1>
          <p className="text-sm text-gray-500">
            ทั้งหมด {total.toLocaleString()} รายการ
          </p>
        </div>
      </div>

      {/* Search form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ลูกค้า</label>
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="ค้นหาลูกค้า..."
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              เลขที่ใบสั่งซื้อ
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SO number..."
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">รหัสผ้า</label>
            <input
              value={fabricId}
              onChange={(e) => setFabricId(e.target.value)}
              placeholder="รหัสผ้า..."
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              วันที่เริ่ม
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              วันที่สิ้นสุด
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleClear}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            เคลียร์ข้อมูล
          </button>
          <button
            onClick={handleSearch}
            className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            ค้นหา
          </button>
        </div>
        {(applied.dateFrom || applied.dateTo) && (
          <div className="mt-3 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <span className="font-medium">แสดงข้อมูลวันที่:</span>
            {applied.dateFrom && (
              <span>{formatThaiDate(applied.dateFrom)}</span>
            )}
            {applied.dateFrom && applied.dateTo && <span>—</span>}
            {applied.dateTo && <span>{formatThaiDate(applied.dateTo)}</span>}
            {!applied.dateTo && applied.dateFrom && (
              <span className="text-blue-400">เป็นต้นไป</span>
            )}
            {!applied.dateFrom && applied.dateTo && (
              <span className="text-blue-400 mr-1">ถึง</span>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full">
        <div className="w-full overflow-x-auto">
          <table className="min-w-[900px] text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th
                  rowSpan={2}
                  className="hidden sm:table-cell text-left px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 w-16 md:w-24 align-middle"
                >
                  วันที่
                </th>
                <th
                  rowSpan={2}
                  className="text-left px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 align-middle"
                >
                  SO / ลูกค้า
                </th>
                <th
                  rowSpan={2}
                  className="hidden sm:table-cell text-left px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 align-middle"
                >
                  รหัสผ้า
                </th>
                <th
                  rowSpan={2}
                  className="hidden md:table-cell text-left px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 align-middle"
                >
                  โครงสร้างผ้า
                </th>
                <th
                  rowSpan={2}
                  className="hidden lg:table-cell text-left px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 align-middle"
                >
                  ลายผ้า
                </th>
                <th
                  rowSpan={2}
                  className="hidden lg:table-cell text-right px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 w-20 align-middle"
                >
                  หน้ากว้าง
                </th>
                <th
                  rowSpan={2}
                  className="text-right px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 w-28 align-middle"
                >
                  Order (หลา)
                </th>
                <th
                  colSpan={2}
                  className="hidden md:table-cell text-center px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 border-b border-gray-200"
                >
                  จัดส่งแล้ว
                </th>
                <th
                  rowSpan={2}
                  className="text-right px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 w-16 md:w-24 align-middle"
                >
                  คงค้าง
                </th>
                <th
                  rowSpan={2}
                  className="text-center px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600 w-24 md:w-36 align-middle"
                >
                  การดำเนินการ
                </th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs">
                <th className="hidden md:table-cell text-right px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-500 w-20">
                  หลา
                </th>
                <th className="hidden md:table-cell text-right px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-500 w-20">
                  พับ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialLoading ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-400">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const hasDelivered = order.deliveredYard > 0;
                  const isComplete = order.remainingYard <= 0;
                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-blue-50/30 transition-colors"
                    >
                      <td className="hidden sm:table-cell px-2 py-2 md:px-3 md:py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(order.createDate)}
                      </td>
                      <td className="px-2 py-2 md:px-3 md:py-2.5">
                        <div className="font-mono text-blue-600 font-medium text-xs">
                          {order.purchaseOrder}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 max-w-[220px] truncate">
                          {order.customerName ?? "-"}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-2 py-2 md:px-3 md:py-2.5 text-xs font-medium text-gray-800">
                        {order.fabricId ?? "-"}
                      </td>
                      <td className="hidden md:table-cell px-2 py-2 md:px-3 md:py-2.5 text-xs text-gray-600">
                        {order.fabricStructure ?? "-"}
                      </td>
                      <td className="hidden lg:table-cell px-2 py-2 md:px-3 md:py-2.5 text-xs text-gray-600">
                        {order.fabricPattern ?? "-"}
                      </td>
                      <td className="hidden lg:table-cell px-2 py-2 md:px-3 md:py-2.5 text-center text-gray-700 border-r border-gray-100">
                        {order.fabricAst?.fabricW ??
                          order.fabricAst?.phewW ??
                          "-"}
                      </td>
                      <td className="px-2 py-2 md:px-3 md:py-2.5 text-right text-xs font-medium text-gray-900">
                        {order.orderSumYard
                          ? Number(order.orderSumYard).toLocaleString()
                          : "-"}
                      </td>
                      <td className="hidden md:table-cell px-2 py-2 md:px-3 md:py-2.5 text-right text-xs">
                        {hasDelivered ? (
                          <span className="text-green-700 font-medium">
                            {order.deliveredYard.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-2 py-2 md:px-3 md:py-2.5 text-right text-xs">
                        {order.deliveredFold > 0 ? (
                          <span className="text-green-700 font-medium">
                            {order.deliveredFold.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2 md:px-3 md:py-2.5 text-right text-xs">
                        {order.orderSumYard ? (
                          <span
                            className={
                              isComplete
                                ? "text-blue-600 font-medium"
                                : "text-orange-600 font-medium"
                            }
                          >
                            {order.remainingYard.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2 md:px-3 md:py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openDetail(order)}
                              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                            >
                              รายละเอียด
                            </button>
                            <button
                              onClick={() => handleSend(order)}
                              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                            >
                              ส่ง
                            </button>
                          </div>
                          <a
                            href={`/print/sales/orders/${order.id}/structure`}
                            target="_blank"
                            className="text-xs px-2 py-1 bg-teal-50 text-teal-700 border border-teal-300 rounded hover:bg-teal-100 transition-colors whitespace-nowrap"
                          >
                            ใบโครงสร้าง
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Infinite scroll status */}
        <InfiniteScrollStatus
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          total={total}
          loadedCount={orders.length}
        />
      </div>

      {/* Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailOrder(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 text-sm">
                  บิลส่งของ — {detailOrder.purchaseOrder}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {detailOrder.customerName}
                </p>
              </div>
              <button
                onClick={() => setDetailOrder(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {billsLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
                  กำลังโหลด...
                </div>
              ) : orderBills.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">
                  ยังไม่มีบิลส่งของสำหรับออร์เดอร์นี้
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600">
                        วันที่
                      </th>
                      <th className="text-left px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600">
                        บิล
                      </th>
                      <th className="text-left px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600">
                        โครงสร้างผ้า
                      </th>
                      <th className="text-right px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600">
                        พับ
                      </th>
                      <th className="text-right px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600">
                        หลา
                      </th>
                      <th className="text-center px-2 py-2 md:px-3 md:py-2.5 font-medium text-gray-600">
                        พิมพ์
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orderBills.map((b, i) => (
                      <tr key={i} className="hover:bg-blue-50/30">
                        <td className="px-2 py-2 md:px-3 md:py-2.5 text-gray-500 whitespace-nowrap">
                          {b.createDate
                            ? new Date(b.createDate).toLocaleDateString(
                                "th-TH",
                                {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                },
                              )
                            : "-"}
                        </td>
                        <td className="px-2 py-2 md:px-3 md:py-2.5 font-mono text-gray-800">
                          {b.vatType}
                          {b.vatNo}
                        </td>
                        <td className="px-2 py-2 md:px-3 md:py-2.5 text-gray-700 max-w-[200px] truncate">
                          {b.fabricStruct ?? "-"}
                        </td>
                        <td className="px-2 py-2 md:px-3 md:py-2.5 text-right text-gray-800">
                          {b.foldCount?.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 md:px-3 md:py-2.5 text-right font-medium text-gray-900">
                          {Math.round(Number(b.totalYard)).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 md:px-3 md:py-2.5 text-center">
                          <a
                            href={`/warehouse/bill/print/${b.vatNo}?vatType=${b.vatType}`}
                            target="_blank"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16">
                              <path d="M5 1a2 2 0 0 0-2 2v1h10V3a2 2 0 0 0-2-2zm6 8H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1" />
                              <path d="M0 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2H2a2 2 0 0 1-2-2zm2.5 1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1" />
                            </svg>
                            พิมพ์
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-yellow-50 font-semibold border-t-2 border-gray-200">
                      <td
                        colSpan={3}
                        className="px-2 py-2 md:px-3 md:py-2.5 text-xs text-gray-600"
                      >
                        รวมทั้งหมด
                      </td>
                      <td className="px-2 py-2 md:px-3 md:py-2.5 text-right text-xs text-gray-800">
                        {orderBills
                          .reduce((s, b) => s + (b.foldCount ?? 0), 0)
                          .toLocaleString()}{" "}
                        พับ
                      </td>
                      <td className="px-2 py-2 md:px-3 md:py-2.5 text-right text-xs font-bold text-gray-900">
                        {Math.round(
                          orderBills.reduce(
                            (s, b) => s + Number(b.totalYard ?? 0),
                            0,
                          ),
                        ).toLocaleString()}{" "}
                        หลา
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setDetailOrder(null)}
                className="px-4 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
