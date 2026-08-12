"use client";
import { useRef, useState } from "react";

// Debounced autocomplete fetcher สำหรับ endpoint suggestion ที่คืน { data: string[] }
// เช่น /api/warehouse/material/yarn-types, /suppliers, /lots, /employees, /departments
export function useFieldSuggestions(endpoint: string, extraParams?: Record<string, string>) {
  const [options, setOptions] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchSuggestions(text: string) {
    if (timer.current) clearTimeout(timer.current);
    if (!text.trim()) { setOptions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ q: text, ...extraParams });
        const res = await fetch(`${endpoint}?${p}`);
        const json = await res.json();
        setOptions(json.data ?? []);
      } catch { setOptions([]); }
    }, 300);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setOptions([]);
  }

  return { options, fetchSuggestions, clear };
}
