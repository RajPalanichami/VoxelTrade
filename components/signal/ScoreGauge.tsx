"use client";

import { signalLabel, toneClass } from "@/lib/format";

export function ScoreGauge({
  score,
  signal,
  confidence,
  bull,
  neu,
  bear,
}: {
  score: number;
  signal: string;
  confidence: string;
  bull: number;
  neu: number;
  bear: number;
}) {
  const color =
    score >= 75 ? "#4ade80" : score >= 65 ? "#fbbf24" : score >= 50 ? "#fb923c" : "#f87171";
  const r = 58;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="panel p-5 flex flex-col items-center">
      <div className="text-[10px] tracking-[0.22em] text-slate-500 mb-2">OVERALL SIGNAL</div>
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={r} stroke="rgb(var(--gauge-track))" strokeWidth="10" fill="none" />
          <circle
            cx="80"
            cy="80"
            r={r}
            stroke={color}
            strokeWidth="10"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 80 80)"
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-3xl font-bold tick" style={{ color }}>
              {score}
              <span className="text-sm text-slate-500"> / 100</span>
            </div>
          </div>
        </div>
      </div>
      <div className={`mt-1 text-lg font-bold tracking-wide ${toneClass(signal)}`}>{signalLabel(signal)}</div>
      <div className="text-[11px] text-slate-400 mt-1">
        Confidence: <span className={toneClass(confidence)}>{confidence}</span>
      </div>
      <div className="flex gap-4 mt-4 text-xs">
        <span className="text-bull">{bull} Bullish</span>
        <span className="text-warn">{neu} Neutral</span>
        <span className="text-bear">{bear} Bearish</span>
      </div>
    </div>
  );
}
