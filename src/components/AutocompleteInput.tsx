"use client";
import { useState, useRef, useEffect } from "react";

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors";

export type AutocompleteOption = string | { value: string; label?: string; type?: string };

function normalize(opt: AutocompleteOption): { value: string; label: string; type?: string } {
  if (typeof opt === "string") return { value: opt, label: opt, type: undefined };
  return { value: opt.value, label: opt.label ?? opt.value, type: opt.type };
}

export default function AutocompleteInput({
  value, onChange, onSelect, options, placeholder, inputClassName, id, typeLabels,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (v: string, type?: string) => void;
  options: AutocompleteOption[];
  placeholder?: string;
  inputClassName?: string;
  id?: string;
  typeLabels?: Record<string, string>;
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
          {options.map((raw) => {
            const opt = normalize(raw);
            return (
              <li key={opt.value}
                onMouseDown={(e) => { e.preventDefault(); onSelect(opt.value, opt.type); setShow(false); }}
                className="px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer first:rounded-t-lg last:rounded-b-lg transition-colors">
                {opt.type ? (
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate">{opt.label}</span>
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded-full">
                      {typeLabels?.[opt.type] ?? opt.type}
                    </span>
                  </span>
                ) : (
                  opt.label
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
