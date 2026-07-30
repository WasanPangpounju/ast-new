"use client";

export interface ConfirmField {
  label: string;
  value: string;
}

export interface ConfirmRow {
  key: string | number;
  fields: ConfirmField[];
}

interface ConfirmSubmitModalProps {
  open: boolean;
  title: string;
  description?: string;
  rows: ConfirmRow[];
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  tone?: "blue" | "green";
}

const TONE_BTN: Record<"blue" | "green", string> = {
  blue: "bg-blue-600 hover:bg-blue-700",
  green: "bg-green-600 hover:bg-green-700",
};

export default function ConfirmSubmitModal({
  open,
  title,
  description,
  rows,
  submitting,
  onConfirm,
  onCancel,
  confirmLabel = "ยืนยันบันทึก",
  tone = "green",
}: ConfirmSubmitModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-gray-200 shrink-0">
          <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
          <p className="text-xs text-gray-400 mt-1">
            {description ?? "กรุณาตรวจสอบข้อมูลก่อนบันทึกจริง"}
          </p>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {rows.map((row, i) => (
            <div key={row.key} className="border border-gray-200 rounded-xl p-4">
              {rows.length > 1 && (
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-3">
                  รายการที่ {i + 1}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {row.fields.map((f) => (
                  <div key={f.label} className="flex justify-between sm:justify-start sm:gap-2 text-sm">
                    <span className="text-gray-500 shrink-0">{f.label}</span>
                    <span className="font-medium text-gray-900 text-right sm:text-left break-words">
                      {f.value || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-60"
          >
            ย้อนกลับแก้ไข
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={`px-4 py-1.5 text-sm text-white rounded-lg font-medium disabled:opacity-60 ${TONE_BTN[tone]}`}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                กำลังบันทึก...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
