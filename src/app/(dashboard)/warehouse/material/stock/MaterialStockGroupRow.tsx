import type { MaterialStockGroup } from "@/types/material";

export type WeightUnit = "kg" | "lb";

export function numFmt(n: number | null | undefined, dec = 2) {
  if (n == null) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function WeightValue({ kg, lb, unit }: { kg: number; lb: number; unit: WeightUnit }) {
  return <>{numFmt(unit === "kg" ? kg : lb)} {unit}</>;
}

export function StatusBadge({ remaining, total }: { remaining: number; total: number }) {
  if (total === 0) return null;
  const pct = remaining / total;
  if (pct <= 0) return <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">หมด</span>;
  if (pct < 0.2) return <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-600 rounded-full">ใกล้หมด</span>;
  return <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">มีสต็อก</span>;
}

interface Props {
  group: MaterialStockGroup;
  rowNumber: number;
  striped: boolean;
  expanded: boolean;
  onToggle: () => void;
  weightUnit: WeightUnit;
}

export default function MaterialStockGroupRow({ group, rowNumber, striped, expanded, onToggle, weightUnit }: Props) {
  return (
    <>
      <tr className={`transition-colors ${striped ? "bg-gray-50" : "bg-white"} ${group.remainingSpool <= 0 ? "opacity-50" : ""}`}>
        <td className="px-3 py-2 text-center text-gray-400">{rowNumber}</td>
        <td className="px-3 py-2 text-gray-800 font-medium max-w-[200px]">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1.5 text-left hover:text-blue-600"
          >
            <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>›</span>
            <span className="truncate" title={group.yarnType}>{group.yarnType},</span>
            <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded-full">
              {group.supplierCount} บริษัท
            </span>
          </button>
        </td>
        <td className="px-3 py-2 text-gray-400">-</td>
        <td className="px-3 py-2 text-right font-semibold text-gray-900">{group.totalSpool.toLocaleString()}</td>
        <td className="px-3 py-2 text-right font-semibold text-orange-600">{group.usedSpool.toLocaleString()}</td>
        <td className="px-3 py-2 text-right font-semibold text-gray-900">{group.remainingSpool.toLocaleString()}</td>
        <td className="px-3 py-2 text-right font-semibold text-gray-700">{numFmt(Number(group.totalWeightKg))}</td>
        <td className="px-3 py-2 text-right font-semibold text-orange-600">{numFmt(Number(group.usedWeightKg))}</td>
        <td className="px-3 py-2 text-right font-semibold text-gray-900">
          <WeightValue kg={Number(group.remainingWeightKg)} lb={group.remainingWeightLb} unit={weightUnit} />
        </td>
        <td className="px-3 py-2 text-center">
          <StatusBadge remaining={group.remainingSpool} total={group.totalSpool} />
        </td>
      </tr>
      {expanded && group.companies.map((c) => (
        <tr key={`${group.yarnType}-${c.supplierName}`}
          className={`transition-colors ${striped ? "bg-gray-50" : "bg-white"} ${c.remainingSpool <= 0 ? "opacity-50" : ""}`}>
          <td className="px-3 py-2" />
          <td className="px-3 py-2 text-gray-400 pl-8">└</td>
          <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={c.supplierName}>
            {c.supplierName || "-"}
          </td>
          <td className="px-3 py-2 text-right text-gray-700">{c.totalSpool.toLocaleString()}</td>
          <td className="px-3 py-2 text-right text-orange-500">{c.usedSpool.toLocaleString()}</td>
          <td className="px-3 py-2 text-right text-gray-800">{c.remainingSpool.toLocaleString()}</td>
          <td className="px-3 py-2 text-right text-gray-600">{numFmt(Number(c.totalWeightKg))}</td>
          <td className="px-3 py-2 text-right text-orange-500">{numFmt(Number(c.usedWeightKg))}</td>
          <td className="px-3 py-2 text-right text-gray-800">
            <WeightValue kg={Number(c.remainingWeightKg)} lb={c.remainingWeightLb} unit={weightUnit} />
          </td>
          <td className="px-3 py-2 text-center">
            <StatusBadge remaining={c.remainingSpool} total={c.totalSpool} />
          </td>
        </tr>
      ))}
    </>
  );
}
