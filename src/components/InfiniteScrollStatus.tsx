"use client";

// แถบท้ายตาราง/รายการ สำหรับ infinite scroll — แทนที่แถบปุ่มเปลี่ยนหน้าเดิม
// วาง sentinel (div ที่ผูก ref ไว้) ตอนยังมีข้อมูลเหลือให้โหลด, IntersectionObserver
// (ผ่าน useLoadMoreSentinel / useInfiniteScroll) จะสั่งโหลดหน้าถัดไปเมื่อ div นี้เข้าจอ
export function InfiniteScrollStatus({
  sentinelRef,
  hasMore,
  loadingMore,
  total,
  loadedCount,
  itemLabel = "รายการ",
}: {
  sentinelRef: (node: HTMLElement | null) => void;
  hasMore: boolean;
  loadingMore: boolean;
  total: number;
  loadedCount: number;
  itemLabel?: string;
}) {
  if (total === 0) return null;

  return (
    <div className="flex items-center justify-center px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 rounded-b-lg">
      {hasMore ? (
        <div ref={sentinelRef} className="flex items-center gap-2 py-1">
          {loadingMore && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          <span>
            {loadingMore
              ? "กำลังโหลดเพิ่ม..."
              : `แสดง ${loadedCount.toLocaleString()} จาก ${total.toLocaleString()} ${itemLabel} — เลื่อนลงเพื่อโหลดเพิ่ม`}
          </span>
        </div>
      ) : (
        <span>
          แสดงครบทั้งหมด {total.toLocaleString()} {itemLabel}
        </span>
      )}
    </div>
  );
}
