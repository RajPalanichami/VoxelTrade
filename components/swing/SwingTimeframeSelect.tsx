"use client";

import { SWING_TIMEFRAMES, SwingTimeframe } from "@/lib/types";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function SwingTimeframeSelect({
  value,
  onChange,
}: {
  value: SwingTimeframe;
  onChange: (t: SwingTimeframe) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = SWING_TIMEFRAMES.find((t) => t.id === value);
  return (
    <div className="relative" data-testid="swing-timeframe">
      <div className="text-[10px] tracking-[0.2em] text-slate-500 mb-1">TIMEFRAME</div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 bg-panel2 border border-accent/50 rounded-md px-3 py-2 min-w-[160px]"
        aria-label={`Timeframe ${current?.label || value}`}
      >
        <span className="text-white font-semibold">{current?.label}</span>
        <ChevronDown size={14} className="ml-auto text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-panel2 border border-line rounded-md overflow-hidden">
          {SWING_TIMEFRAMES.map((t) => (
            <button
              key={t.id}
              type="button"
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
