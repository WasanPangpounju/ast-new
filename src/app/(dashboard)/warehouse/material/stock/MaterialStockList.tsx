"use client";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { MaterialStockGroup } from "@/types/material";
import MaterialStockGroupRow, { numFmt } from "./MaterialStockGroupRow";

interface StockResponse {
  data: MaterialStockGroup[];
  total: number;
  page: number;
  totalPages: number;
  totalRemainingSpool: number;
  totalRemainingWeightKg: number;
}

const LIMIT = 20;

export default function MaterialStockList() {
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const [expandedOverride, setExpandedOverride] = useState<Record<string, boolean>>({});
  const [lastAppliedQ, setLastAppliedQ] = useState(appliedQ);
  // A new search context should re-derive which groups auto-expand, not keep stale toggles
  if (appliedQ !== lastAppliedQ) {
    setLastAppliedQ(appliedQ);
    setExpandedOverride({});
  }

  const { data, isFetching, isError } = useQuery<StockResponse>({
    queryKey: ["material-stock", appliedQ, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (appliedQ) p.set("q", appliedQ);
      const res = await fetch(`/api/warehouse/material/stock?${p}`);
      if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      return res.json();
    },
    placeholderData: keepPreviousData,
  });

  const groups = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const totalSpool = data?.totalRemainingSpool ?? 0;
  const totalWeight = Number(data?.totalRemainingWeightKg ?? 0);
  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to = Math.min(page * LIMIT, total);

  function isExpanded(group: MaterialStockGroup) {
    return expandedOverride[group.yarnType] ?? group.autoExpand;
  }
  function toggle(group: MaterialStockGroup) {
    setExpandedOverride((prev) => ({ ...prev, [group.yarnType]: !isExpanded(group) }));
  }

  function handleSearch() {
    setAppliedQ(q);
    setPage(1);
  }
  function handleClear() {
    setQ("");
    setAppliedQ("");
    setPage(1);
  }

  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">สต็อกวัตถุดิบ</h1>
        <p className="text-sm text-gray-500">{total.toLocaleString()} ชนิด</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <p className="text-xs text-gray-500 mb-0.5">Spool คงเหลือรวม</p>
          <p className="text-xl font-bold text-gray-900">{totalSpool.toLocaleString()}</p>
          <p className="text-xs text-gray-400">หลอด</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <p className="text-xs text-gray-500 mb-0.5">น้ำหนักคงเหลือรวม</p>
          <p className="text-xl font-bold text-gray-900">{numFmt(totalWeight)}</p>
          <p className="text-xs text-gray-400">กิโลกรัม</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <p className="text-xs text-gray-500 mb-0.5">จำนวนชนิดวัตถุดิบ</p>
          <p className="text-xl font-bold text-gray-900">{total.toLocaleString()}</p>
          <p className="text-xs text-gray-400">ชนิด</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white border border-gray-200 p-4 mb-4 shadow-sm rounded-lg">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="ค้นหาชนิดด้าย หรือชื่อบริษัท..."
            className="flex-1 border border-gray-300 px-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="button" onClick={handleSearch}
            className="px-5 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium">
            ค้นหา
          </button>
          <button type="button" onClick={handleClear}
            className="px-4 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg">
            เคลียร์
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow-sm border border-gray-200 overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-10">#</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ชนิดด้าย</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-600">ชื่อบริษัท</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">Spool ทั้งหมด</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">เบิกไปแล้ว</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">Spool คงเหลือ</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">น้ำหนักรวม (kg)</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">ใช้ไปแล้ว (kg)</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-600 whitespace-nowrap">คงเหลือ (kg)</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-20">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && groups.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : isError ? (
                <tr><td colSpan={10} className="text-center py-12 text-red-400">โหลดข้อมูลไม่สำเร็จ</td></tr>
              ) : groups.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : groups.map((group, i) => (
                <MaterialStockGroupRow
                  key={group.yarnType}
                  group={group}
                  rowNumber={(page - 1) * LIMIT + i + 1}
                  striped={i % 2 !== 0}
                  expanded={isExpanded(group)}
                  onToggle={() => toggle(group)}
                />
              ))}
            </tbody>
            {groups.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs text-gray-600">รวม Spool คงเหลือ</td>
                  <td className="px-3 py-2 text-right text-sm text-gray-900">{totalSpool.toLocaleString()}</td>
                  <td colSpan={2} className="px-3 py-2 text-right text-xs text-gray-600">รวมน้ำหนักคงเหลือ</td>
                  <td className="px-3 py-2 text-right text-sm text-gray-900">{numFmt(totalWeight)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {isFetching && groups.length > 0 && (
          <div className="px-4 py-2 bg-blue-50 text-xs text-blue-500">กำลังโหลด...</div>
        )}

        {/* Pagination */}
        {totalPages >= 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              {total === 0
                ? "ไม่มีข้อมูล"
                : `แสดง ${from.toLocaleString()}–${to.toLocaleString()} จาก ${total.toLocaleString()} ชนิด`}
            </p>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">«</button>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">‹</button>
              <span className="px-3 py-1 text-xs border border-gray-300 bg-white">{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">›</button>
              <button type="button" onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 disabled:opacity-40 hover:bg-white">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
