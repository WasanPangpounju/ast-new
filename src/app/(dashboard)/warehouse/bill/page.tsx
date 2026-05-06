"use client";
import { useState, useEffect, useCallback } from "react";

interface Bill {
  vatType: string;
  vatNo: number;
  customerName: string | null;
  receiveName: string | null;
  fabricStruct: string | null;
  fabricPattern: string | null;
  fabricW: string | null;
  createDate: string;
  foldCount: number;
  totalYard: number;
  altFabricStruct: string | null;
  altPurchaseOrder: string | null;
}

export default function BillListPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");

  const fetchBills = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page) });
    if (applied) p.set("search", applied);
    fetch(`/api/warehouse/bill?${p}`)
      .then((r) => r.json())
      .then((d) => {
        setBills(d.bills ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [page, applied]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const totalPages = Math.ceil(total / 20);

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt.getFullYear() + 543}`;
    } catch {
      return "-";
    }
  };

  const openPrint = (vatType: string, vatNo: number) => {
    window.open(`/warehouse/bill/print/${vatNo}?vatType=${vatType}`, "_blank");
  };

  return (
    <div className="p-4 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            พิมพ์บิลส่งของ
          </h1>
          <p className="text-xs text-gray-500">
            ทั้งหมด {total.toLocaleString()} บิล
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 shadow-sm flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาลูกค้า, เลขที่บิล..."
          onKeyDown={(e) =>
            e.key === "Enter" && (setPage(1), setApplied(search))
          }
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => {
            setPage(1);
            setApplied(search);
          }}
          className="px-6 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          ค้นหา
        </button>
        <button
          onClick={() => {
            setSearch("");
            setApplied("");
            setPage(1);
          }}
          className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          เคลียร์
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  เลขที่บิล
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  วันที่
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  ลูกค้า / ผู้รับ
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">
                  โครงสร้างผ้า
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-16">
                  พับ
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 w-24">
                  หลา
                </th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-20">
                  พิมพ์
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      กำลังโหลด...
                    </div>
                  </td>
                </tr>
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              ) : (
                bills.map((b, i) => (
                  <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2 font-mono font-medium text-blue-700">
                      {b.vatType} - {b.vatNo}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {fmtDate(b.createDate)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-800">
                        {b.customerName ?? "-"}
                      </div>
                      {b.receiveName && (
                        <div className="text-gray-400">{b.receiveName}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">
                      {b.altFabricStruct || b.fabricStruct || "-"}{" "}
                      {b.fabricW ? `${b.fabricW}''` : ""}{" "}
                      {b.fabricPattern ?? ""}
                      {b.altPurchaseOrder && (
                        <span className="ml-1 text-gray-400">
                          ({b.altPurchaseOrder})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-800">
                      {b.foldCount}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {Number(b.totalYard).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => openPrint(b.vatType, b.vatNo)}
                        className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          fill="currentColor"
                          className="bi bi-printer-fill"
                          viewBox="0 0 16 16"
                        >
                          <path d="M5 1a2 2 0 0 0-2 2v1h10V3a2 2 0 0 0-2-2zm6 8H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1" />
                          <path d="M0 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2H2a2 2 0 0 1-2-2zm2.5 1a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1" />
                        </svg>{" "}
                        พิมพ์
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              หน้า {page} จาก {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white"
              >
                ‹
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white"
              >
                ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-white"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
