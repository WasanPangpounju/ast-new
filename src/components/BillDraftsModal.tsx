"use client";

export interface BillDraftFormData {
  mode: "order" | "stock";
  billType: string;
  billNo: string;
  billDate: string;
  remark: string;
  fabricStruct: string;
  fabricPattern: string;
  fabricW: string;
  orderer: string;
  receiver: string;
  isDeposit: boolean;
  altFabricStruct: string;
  altPurchaseOrder: string;
  purchaseOrderParam: string;
  linkedOrders: { id: number; purchaseOrder: string; remainingYard: number }[];
  selectedStock: unknown;
  stockSearch: string;
  yards: string[];
}

export interface BillDraftSummary {
  id: number;
  data: Partial<BillDraftFormData>;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedByUserId: number | null;
  updatedByName: string | null;
}

interface BillDraftsModalProps {
  open: boolean;
  drafts: BillDraftSummary[];
  loading: boolean;
  currentDraftId: number | null;
  onOpenDraft: (draft: BillDraftSummary) => void;
  onDeleteDraft: (id: number) => void;
  onClose: () => void;
}

function foldCount(data: Partial<BillDraftFormData>): number {
  if (!Array.isArray(data.yards)) return 0;
  return data.yards.filter((v) => parseFloat(v) > 0).length;
}

export default function BillDraftsModal({
  open,
  drafts,
  loading,
  currentDraftId,
  onOpenDraft,
  onDeleteDraft,
  onClose,
}: BillDraftsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-gray-200 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">
              ร่างที่บันทึกไว้
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              ร่างเหล่านี้เป็นของส่วนกลาง — ผู้มีสิทธิ์เปิดบิลผ้าทุกคนเห็นและแก้ไขได้
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">
              กำลังโหลด...
            </p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              ยังไม่มีร่างที่บันทึกไว้
            </p>
          ) : (
            <div className="space-y-2">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className={
                    "border rounded-xl p-3 flex items-center justify-between gap-3 " +
                    (d.id === currentDraftId
                      ? "border-amber-400 bg-amber-50"
                      : "border-gray-200")
                  }
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-900 truncate">
                        {d.data.orderer || "(ไม่ระบุลูกค้า)"}
                      </span>
                      {d.id === currentDraftId && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 shrink-0">
                          กำลังแก้ไขอยู่
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        {d.data.billType || "-"}
                        {d.data.billNo ? `-${d.data.billNo}` : ""}
                      </span>
                      <span>{foldCount(d.data)} พับ</span>
                      <span>
                        แก้ไขล่าสุด{" "}
                        {new Date(d.updatedAt).toLocaleString("th-TH", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {d.updatedByName ? ` โดย ${d.updatedByName}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenDraft(d)}
                      className="px-3 py-1.5 text-xs font-medium border border-blue-600 text-blue-700 rounded-lg hover:bg-blue-50"
                    >
                      เปิด
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteDraft(d.id)}
                      className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
