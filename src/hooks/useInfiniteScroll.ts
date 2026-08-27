"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLoadMoreSentinel } from "./useLoadMoreSentinel";

interface PageResult<T> {
  items: T[];
  total: number;
}

/**
 * Infinite-scroll list loader สำหรับหน้าที่ fetch ด้วย fetch() ธรรมดา (ไม่ใช่ React Query)
 *
 * - โหลดหน้า 1 อัตโนมัติตอน mount และทุกครั้งที่ identity ของ fetchPage เปลี่ยน
 *   (ฝั่งเรียกต้องห่อ fetchPage ด้วย useCallback ผูก deps กับตัวกรอง/คำค้นหา —
 *   deps เปลี่ยนเมื่อไร ระบบจะรีเซ็ตกลับหน้า 1 ให้เอง เหมือนเดิมตอนกดค้นหา)
 * - โหลดหน้าถัดไปต่อท้ายอัตโนมัติเมื่อผู้ใช้เลื่อนถึง sentinel ท้ายรายการ (ผ่าน useLoadMoreSentinel)
 * - reload() ไว้เรียกเองหลังแก้ไข/ลบ/บันทึกข้อมูล (แทนที่การเรียก fetch ฟังก์ชันเดิมตรงๆ)
 *   — รีเซ็ตกลับไปโหลดหน้า 1 ใหม่ทั้งหมด (ผู้ใช้จะเลื่อนกลับขึ้นบนสุดของรายการ)
 */
export function useInfiniteScroll<T>(fetchPage: (page: number) => Promise<PageResult<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPageRef = useRef(fetchPage);
  useEffect(() => { fetchPageRef.current = fetchPage; }, [fetchPage]);

  // ใช้ ref เก็บ page/จำนวนที่โหลดแล้ว/total ปัจจุบัน เพื่อให้ loadMore เป็น callback
  // identity คงที่ (ไม่ต้อง re-subscribe sentinel ทุกครั้งที่ state เปลี่ยน) โดยยังอ่านค่าล่าสุดได้เสมอ
  const pageRef = useRef(0);
  const loadedCountRef = useRef(0);
  const totalRef = useRef(0);
  const inFlightRef = useRef(false);
  const reqIdRef = useRef(0);

  const reload = useCallback(() => {
    const id = ++reqIdRef.current;
    inFlightRef.current = true;
    setInitialLoading(true);
    setLoadingMore(false);
    setError(null);
    fetchPageRef
      .current(1)
      .then((res) => {
        if (id !== reqIdRef.current) return;
        setItems(res.items);
        setTotal(res.total);
        pageRef.current = 1;
        loadedCountRef.current = res.items.length;
        totalRef.current = res.total;
      })
      .catch((err) => {
        if (id !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (id !== reqIdRef.current) return;
        setInitialLoading(false);
        inFlightRef.current = false;
      });
  }, []);

  // โหลดหน้าแรกใหม่ทุกครั้งที่ fetchPage เปลี่ยน identity (เช่น ค้นหา/กรองเปลี่ยน)
  useEffect(() => {
    reload();
  }, [fetchPage, reload]);

  const loadMore = useCallback(() => {
    if (inFlightRef.current) return;
    if (loadedCountRef.current >= totalRef.current) return;
    const id = reqIdRef.current;
    const nextPage = pageRef.current + 1;
    inFlightRef.current = true;
    setLoadingMore(true);
    fetchPageRef
      .current(nextPage)
      .then((res) => {
        if (id !== reqIdRef.current) return;
        setItems((prev) => [...prev, ...res.items]);
        setTotal(res.total);
        pageRef.current = nextPage;
        loadedCountRef.current += res.items.length;
        totalRef.current = res.total;
      })
      .catch((err) => {
        if (id !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (id !== reqIdRef.current) return;
        setLoadingMore(false);
        inFlightRef.current = false;
      });
  }, []);

  const sentinelRef = useLoadMoreSentinel(loadMore);

  return {
    items,
    total,
    initialLoading,
    loadingMore,
    error,
    hasMore: items.length < total,
    sentinelRef,
    reload,
  };
}
