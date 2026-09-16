"use client";

import { PATTERN_TIMEFRAMES, PatternTimeframe } from "@/lib/types";

export function PatternTimeframeSelect({
  value,
  onChange,
}: {
  value: PatternTimeframe;
  onChange: (t: PatternTimeframe) => void;
}) {
  const current = PATTERN_TIMEFRAMES.find((t) => t.id === value);
  return (
    <label className="block max-w-xs" data-testid="pattern-timeframe">
      <div className="text-[10px] tracking-[0.2em] text-slate-500 mb-1">TIMEFRAME</div>
      <select
        value={value}
        aria-label={`Timeframe ${current?.label || value}`}
        onChange={(e) => onChange(e.target.value as PatternTimeframe)}
        className="w-full bg-panel2 border border-accent/50 rounded-md px-3 py-2 text-white font-semibold focus:outline-none focus:border-accent/70"
      >
        {PATTERN_TIMEFRAMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
