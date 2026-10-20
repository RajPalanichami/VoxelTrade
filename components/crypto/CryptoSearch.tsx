"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";

export function CryptoSearch({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (symbol: string, id?: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Array<{ id: string; symbol: string; name: string; rank: number | null }>>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(value), [value]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setHits([]);
        return;
      }
      try {
        const res = await api.cryptoSearch(q);
        setHits(res.data || []);
        setOpen(document.activeElement === box.current?.querySelector("input"));
      } catch {
        setHits([]);
      }
    }, 180);
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
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) {
            onSelect(q.trim().toUpperCase());
            setOpen(false);
          }
        }}
        placeholder="Search Bitcoin, BTC, Ethereum, ZEC…"
        aria-label="Search cryptocurrency"
        className="w-full bg-panel2 border border-line rounded-md pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-accent/70"
      />
      {open && hits.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-panel2 border border-line rounded-md overflow-hidden shadow-panel max-h-72 overflow-y-auto">
          {hits.slice(0, 12).map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 flex items-center justify-between"
              onClick={() => {
                onSelect(hit.symbol, hit.id);
                setQ(hit.symbol);
                setOpen(false);
              }}
            >
              <span>
                <span className="text-white font-semibold">{hit.symbol}</span>
                <span className="text-slate-400 ml-2">{hit.name}</span>
              </span>
              {hit.rank != null ? <span className="text-[11px] text-slate-500">#{hit.rank}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
