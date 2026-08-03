"use client";
import { useState, useRef, useEffect } from "react";
import dayjs, { Dayjs } from "dayjs";

const BE_OFFSET = 543;
const CURRENT_BE_YEAR = new Date().getFullYear() + BE_OFFSET;
const MIN_BE_YEAR = CURRENT_BE_YEAR - 10;
const MAX_BE_YEAR = CURRENT_BE_YEAR + 10;

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const inp = "w-full border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors";
const errB = "border-red-400 focus:ring-red-400";

function isoToBeText(iso: string): string {
  if (!iso) return "";
  const d = dayjs(iso);
  if (!d.isValid()) return "";
  return `${d.format("DD/MM")}/${d.year() + BE_OFFSET}`;
}

// Parses "DD/MM/YYYY" (Buddhist year) into an ISO "YYYY-MM-DD" (CE) string.
// Returns null for malformed input, out-of-range years, or dates that don't exist.
function parseBeText(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const beYear = parseInt(m[3], 10);
  if (month < 1 || month > 12) return null;
  if (beYear < MIN_BE_YEAR || beYear > MAX_BE_YEAR) return null;
  const ceYear = beYear - BE_OFFSET;
  const d = new Date(ceYear, month - 1, day);
  if (d.getFullYear() !== ceYear || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ceYear}-${pad(month)}-${pad(day)}`;
}

interface Props {
  value: string; // ISO "YYYY-MM-DD" (CE); may be ""
  onChange: (iso: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
}

export default function ThaiDatePicker({ value, onChange, id, className, placeholder }: Props) {
  const [text, setText] = useState(() => isoToBeText(value));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [viewMonth, setViewMonth] = useState<Dayjs>(() => (value ? dayjs(value) : dayjs()));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(isoToBeText(value));
    setError(false);
  }, [value]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function handleTextChange(v: string) {
    setText(v);
    const iso = parseBeText(v);
    if (iso) {
      setError(false);
      onChange(iso);
    }
  }

  function handleBlur() {
    const iso = parseBeText(text);
    if (iso) {
      setText(isoToBeText(iso));
      setError(false);
    } else if (text.trim() === "") {
      // cleared with no replacement — revert to the last valid value instead of
      // leaving the input blank while the underlying value stays unchanged
      setText(isoToBeText(value));
      setError(false);
    } else {
      setError(true);
    }
  }

  function openCalendar() {
    setViewMonth(value ? dayjs(value) : dayjs());
    setOpen((s) => !s);
  }

  function selectDay(d: Dayjs) {
    const iso = d.format("YYYY-MM-DD");
    onChange(iso);
    setText(isoToBeText(iso));
    setError(false);
    setOpen(false);
  }

  const startOfMonth = viewMonth.startOf("month");
  const daysInMonth = viewMonth.daysInMonth();
  const startWeekday = startOfMonth.day();
  const cells: (Dayjs | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(startOfMonth.date(d));

  const yearOptions: number[] = [];
  for (let y = MIN_BE_YEAR; y <= MAX_BE_YEAR; y++) yearOptions.push(y);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={handleBlur}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "วว/ดด/ปปปป"}
          autoComplete="off"
          className={`${className ?? inp} ${error ? errB : ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={openCalendar}
          aria-label="เปิดปฏิทิน"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-0.5">รูปแบบวันที่ไม่ถูกต้อง (วว/ดด/ปปปป พ.ศ.)</p>}

      {open && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64">
          <div className="flex items-center gap-1 mb-2">
            <button type="button" onClick={() => setViewMonth((m) => m.subtract(1, "month"))}
              className="px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 rounded">‹</button>
            <select
              value={viewMonth.month()}
              onChange={(e) => setViewMonth((m) => m.month(parseInt(e.target.value, 10)))}
              className="flex-1 text-sm border-0 bg-transparent focus:outline-none text-center font-medium">
              {THAI_MONTHS.map((name, i) => <option key={name} value={i}>{name}</option>)}
            </select>
            <select
              value={viewMonth.year()}
              onChange={(e) => setViewMonth((m) => m.year(parseInt(e.target.value, 10)))}
              className="text-sm border-0 bg-transparent focus:outline-none font-medium">
              {yearOptions.map((by) => <option key={by} value={by - BE_OFFSET}>{by}</option>)}
            </select>
            <button type="button" onClick={() => setViewMonth((m) => m.add(1, "month"))}
              className="px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 rounded">›</button>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-gray-400 mb-1">
            {THAI_WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
            {cells.map((d, i) => (
              <div key={i} className="flex items-center justify-center">
                {d && (
                  <button
                    type="button"
                    onClick={() => selectDay(d)}
                    className={`rounded-full w-8 h-8 transition-colors ${
                      d.format("YYYY-MM-DD") === value
                        ? "bg-blue-600 text-white hover:bg-blue-600"
                        : "text-gray-700 hover:bg-blue-50"
                    }`}
                  >
                    {d.date()}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-1 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => selectDay(dayjs())}
              className="text-xs text-blue-600 hover:underline">
              วันนี้
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
