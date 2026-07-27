"use client";
import { useState, useRef, useEffect } from "react";

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors";

export default function AutocompleteInput({
  value, onChange, onSelect, options, placeholder, inputClassName, id,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (v: string) => void;
  options: string[];
  placeholder?: string;
  inputClassName?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <input
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value); setShow(true); }}
        onFocus={() => { if (options.length > 0) setShow(true); }}
        placeholder={placeholder}
        className={inputClassName ?? inp}
        autoComplete="off"
      />
      {show && options.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto mt-1">
          {options.map((opt) => (
            <li key={opt}
              onMouseDown={(e) => { e.preventDefault(); onSelect(opt); setShow(false); }}
              className="px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer first:rounded-t-lg last:rounded-b-lg transition-colors">
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
