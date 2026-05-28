"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MaterialStockRow } from "@/types/material";

interface StockResponse {
  data: MaterialStockRow[];
}

function numFmt(n: number | null | undefined, dec = 2) {
  if (n == null) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function StatusBadge({ remaining, total }: { remaining: number; total: number }) {
  if (total === 0) return null;
  const pct = remaining / total;
  if (pct <= 0) return <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">หมด</span>;
  if (pct < 0.2) return <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-600 rounded-full">ใกล้หมด</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">มีสต็อก</span>;
}

export default function MaterialStockList() {
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");

  const { data, isFetching, isError } = useQuery<StockResponse>({
    queryKey: ["material-stock", appliedQ],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (appliedQ) p.set("q", appliedQ);
      const res = await fetch(`/api/warehouse/material/stock?${p}`);
      if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      return res.json();
    },
  });

  const rows = data?.data ?? [];

  function handleSearch() {
    setAppliedQ(q);
  }
  function handleClear() {
    setQ("");
    setAppliedQ("");
  }

  const totalSpool = rows.reduce((s, r) => s + r.remainingSpool, 0);
  const totalWeight = rows.reduce((s, r) => s + Number(r.remainingWeightKg), 0);

  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-3xl font-semibold text-gray-900">สต็อกวัตถุดิบ</h1>
        <p className="text-sm text-gray-500">{rows.length.toLocaleString()} ชนิด</p>
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
          <p className="text-xl font-bold text-gray-900">{rows.length.toLocaleString()}</p>
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
              {isFetching && rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังโหลด...
                  </div>
                </td></tr>
              ) : isError ? (
                <tr><td colSpan={10} className="text-center py-12 text-red-400">โหลดข้อมูลไม่สำเร็จ</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
              ) : rows.map((row, i) => (
                <tr key={`${row.yarnType}-${row.supplierName}`}
                  className={`transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${row.remainingSpool <= 0 ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 text-center text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-800 font-medium max-w-[160px] truncate" title={row.yarnType}>
                    {row.yarnType}
                  </td>
                  <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={row.supplierName}>
                    {row.supplierName || "-"}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{row.totalSpool.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-orange-600">{row.usedSpool.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{row.remainingSpool.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{numFmt(Number(row.totalWeightKg))}</td>
                  <td className="px-3 py-2 text-right text-orange-600">{numFmt(Number(row.usedWeightKg))}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{numFmt(Number(row.remainingWeightKg))}</td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge remaining={row.remainingSpool} total={row.totalSpool} />
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
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

        {isFetching && rows.length > 0 && (
          <div className="px-4 py-2 bg-blue-50 text-xs text-blue-500">กำลังโหลด...</div>
        )}
      </div>
    </div>
  );
}
