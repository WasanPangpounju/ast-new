"use client";
import { useCallback, useEffect, useRef } from "react";

// สร้าง ref callback สำหรับแปะไว้ที่ท้ายรายการ (sentinel) — เรียก onVisible() เมื่อ sentinel
// เลื่อนเข้ามาในจอ ใช้เป็น primitive กลางสำหรับ infinite scroll ทุกแบบในระบบ ทั้งแบบ fetch ธรรมดา
// (ผ่าน useInfiniteScroll) และแบบ React Query (useInfiniteQuery + fetchNextPage โดยตรง)
//
// hook นี้ไม่รู้เรื่อง loading/hasMore เอง — ฝั่งเรียกต้อง guard เงื่อนไขเหล่านั้นเองใน onVisible
export function useLoadMoreSentinel(onVisible: () => void) {
  const onVisibleRef = useRef(onVisible);
  useEffect(() => { onVisibleRef.current = onVisible; }, [onVisible]);

  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisibleRef.current();
      },
      { rootMargin: "200px" } // เริ่มโหลดก่อนถึงขอบล่างจริงๆ ~200px กันผู้ใช้เห็นค้าง
    );
    observerRef.current.observe(node);
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return sentinelRef;
}
