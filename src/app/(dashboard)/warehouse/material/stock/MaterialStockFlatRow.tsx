import type { MaterialStockCompanyRow } from "@/types/material";
import { StatusBadge, WeightValue, type WeightUnit } from "./MaterialStockGroupRow";

interface Props {
  row: MaterialStockCompanyRow;
  rowNumber: number;
  striped: boolean;
  weightUnit: WeightUnit;
}

export default function MaterialStockFlatRow({ row, rowNumber, striped, weightUnit }: Props) {
  return (
    <tr className={`transition-colors ${striped ? "bg-gray-50" : "bg-white"} ${row.remainingSpool <= 0 ? "opacity-50" : ""}`}>
      <td className="px-3 py-2 text-center text-gray-400">{rowNumber}</td>
      <td className="px-3 py-2 text-gray-800 font-medium max-w-[200px] truncate" title={row.yarnType}>
        {row.yarnType}
      </td>
      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={row.supplierName}>
        {row.supplierName || "-"}
      </td>
      <td className="px-3 py-2 text-right text-gray-700">{row.totalSpool.toLocaleString()}</td>
      <td className="px-3 py-2 text-right text-orange-600">{row.usedSpool.toLocaleString()}</td>
      <td className="px-3 py-2 text-right font-semibold text-gray-900">{row.remainingSpool.toLocaleString()}</td>
      <td className="px-3 py-2 text-right text-gray-700">
        <WeightValue kg={Number(row.totalWeightKg)} lb={row.totalWeightLb} unit={weightUnit} />
      </td>
      <td className="px-3 py-2 text-right text-orange-600">
        <WeightValue kg={Number(row.usedWeightKg)} lb={row.usedWeightLb} unit={weightUnit} />
      </td>
      <td className="px-3 py-2 text-right font-semibold text-gray-900">
        <WeightValue kg={Number(row.remainingWeightKgEstimated)} lb={row.remainingWeightLbEstimated} unit={weightUnit} />
      </td>
      <td className="px-3 py-2 text-center">
        <StatusBadge remaining={row.remainingSpool} total={row.totalSpool} />
      </td>
    </tr>
  );
}
