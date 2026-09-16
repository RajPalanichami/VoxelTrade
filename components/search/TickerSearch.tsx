"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { SearchHit } from "@/lib/types";

export function TickerSearch({
  value,
  onSelect,
  onInputChange,
  commitOnBlur = false,
  placeholder = "Search ticker: AAPL, MSFT, TSLA...",
  label,
}: {
  value: string;
  onSelect: (s: string) => void;
  onInputChange?: (s: string) => void;
  commitOnBlur?: boolean;
  placeholder?: string;
  label?: string;
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(value), [value]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setHits([]);
        return;
      }
      try {
        const res = await api.search(q);
        setHits(res.data || []);
        setOpen(document.activeElement === box.current?.querySelector("input"));
      } catch {
        setHits([]);
      }
    }, 160);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={box} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
      <input
        value={q}
        onChange={(e) => {
          const next = e.target.value.toUpperCase();
          setQ(next);
          onInputChange?.(next);
        }}
        onBlur={() => {
          if (commitOnBlur && q.trim()) onSelect(q.trim().toUpperCase());
        }}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) {
            onSelect(q.trim().toUpperCase());
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={label || placeholder}
        className="w-full bg-panel2 border border-line rounded-md pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-accent/70"
      />
      {open && hits.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-panel2 border border-line rounded-md overflow-hidden shadow-panel">
          {hits.map((h) => (
            <button
              key={h.symbol}
              onClick={() => {
                onSelect(h.symbol);
                setQ(h.symbol);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-accent/10 flex items-center justify-between"
            >
              <div>
                <span className="text-white font-semibold tick">{h.symbol}</span>
                <span className="text-slate-400 text-sm"> — {h.name}</span>
              </div>
              <span className="text-[10px] text-slate-500 tracking-widest">{h.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
