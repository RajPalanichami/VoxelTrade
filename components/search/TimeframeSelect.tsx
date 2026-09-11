"use client";

import { TIMEFRAMES, Timeframe } from "@/lib/types";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function TimeframeSelect({ value, onChange }: { value: Timeframe; onChange: (t: Timeframe) => void }) {
  const [open, setOpen] = useState(false);
  const current = TIMEFRAMES.find((t) => t.id === value);
  return (
    <div className="relative">
      <div className="text-[10px] tracking-[0.2em] text-slate-500 mb-1">TIMEFRAME</div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 bg-panel2 border border-accent/50 rounded-md px-3 py-2 min-w-[160px]"
      >
        <span className="text-white font-semibold">{current?.label}</span>
        <ChevronDown size={14} className="ml-auto text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-panel2 border border-line rounded-md overflow-hidden">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm ${
                t.id === value ? "bg-accent/20 text-white" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
