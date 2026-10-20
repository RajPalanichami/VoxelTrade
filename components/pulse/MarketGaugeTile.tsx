"use client";

import { useState } from "react";
import {
  FEAR_GREED_ZONES,
  fearGreedZoneColor,
  formatFearGreedZone,
  getFearGreedClassification,
  type HistoricalGaugeValue,
  type MarketGaugeData,
} from "@/lib/fearGreed";
import { COMPARE_LABELS, TileCompareRows } from "./TileCompareRows";

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((180 - deg) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const start = polar(cx, cy, r, from);
  const end = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

function GaugeSvg({ value }: { value: number }) {
  const cx = 100;
  const cy = 92;
  const r = 70;
  const needle = polar(cx, cy, r - 10, (value / 100) * 180);
  let from = 0;
  return (
    <svg viewBox="0 0 200 120" className="w-full h-auto max-h-[40px]" role="img" aria-label={`Fear and Greed ${value}`}>
      {FEAR_GREED_ZONES.map((z) => {
        const start = from;
        const end = (z.max / 100) * 180;
        from = end;
        return <path key={z.label} d={arcPath(cx, cy, r, start, end)} fill="none" stroke={z.color} strokeWidth="12" strokeLinecap="butt" />;
      })}
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="#e2e8f0" strokeWidth="2" />
      <circle cx={cx} cy={cy} r="4" fill="#e2e8f0" />
    </svg>
  );
}

function gaugeText(point?: HistoricalGaugeValue) {
  return point ? `${Math.round(point.value)} · ${point.classification}` : null;
}

export function MarketGaugeTile({
  data,
  loading,
}: {
  data?: MarketGaugeData | null;
  loading?: boolean;
}) {
  const [learn, setLearn] = useState(false);
  const available = data && data.data_status !== "UNAVAILABLE" && Number.isFinite(data.current.value);
  const value = available ? data.current.value : null;
  const classification = value != null ? getFearGreedClassification(value) : null;

  return (
    <div className="market-tile panel px-2.5 py-2 min-w-0 flex flex-col contain-layout" data-testid="tile-GAUGE">
      <div className="text-[12px] font-semibold text-white leading-tight">Market Gauge</div>
      <div className="text-[9px] text-slate-500 truncate leading-tight">What emotion is driving the market now?</div>
      <button type="button" className="text-[8px] text-accent text-left truncate" onClick={() => setLearn(true)}>
        Learn more about the index
      </button>

      {loading && !available && (
        <div className="mt-0.5 space-y-1" data-testid="gauge-skeleton">
          <div className="h-[22px] rounded bg-white/5 animate-pulse" />
          <div className="h-3 rounded bg-white/5 animate-pulse" />
          <div className="h-6 rounded bg-white/5 animate-pulse" />
        </div>
      )}

      {!loading && !available && (
        <div className="mt-1 text-[9px] text-slate-400 leading-tight" data-testid="gauge-error">
          Data temporarily unavailable
        </div>
      )}

      {available && value != null && classification && (
        <>
          <div className="mt-0.5">
            <GaugeSvg value={value} />
          </div>
          <div className="text-center -mt-0.5">
            <div className="tick text-[15px] text-white leading-none" style={{ color: fearGreedZoneColor(value) }} data-testid="gauge-value">
              {Math.round(value)}
            </div>
            <div className="text-[9px] font-semibold leading-tight break-words" style={{ color: fearGreedZoneColor(value) }} data-testid="gauge-class">
              {classification}
            </div>
          </div>
          <TileCompareRows
            testId="gauge-history"
            rows={[
              { label: COMPARE_LABELS.previousClose, text: gaugeText(data.previousClose) },
              { label: COMPARE_LABELS.oneWeekAgo, text: gaugeText(data.oneWeekAgo) },
              { label: COMPARE_LABELS.oneMonthAgo, text: gaugeText(data.oneMonthAgo) },
              { label: COMPARE_LABELS.oneYearAgo, text: gaugeText(data.oneYearAgo) },
            ]}
          />
          <div className="mt-auto pt-0.5 text-[8px] text-slate-600 truncate">
            {data.source}
            {data.data_status === "STALE" ? " · last synchronized" : ""}
          </div>
        </>
      )}

      {learn && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={() => setLearn(false)} />
          <div className="relative w-full max-w-md panel p-5 space-y-3" data-testid="gauge-learn-more">
            <div className="text-lg font-semibold">Fear & Greed Index</div>
            <p className="text-sm text-slate-400">
              The Market Gauge maps a 0–100 fear-and-greed reading onto five sentiment zones. It describes current market emotion, not a trade signal.
            </p>
            <ul className="text-sm text-slate-300 space-y-1">
              {FEAR_GREED_ZONES.map((zone, index) => (
                <li key={zone.label}>{formatFearGreedZone(zone, index)}</li>
              ))}
            </ul>
            <button type="button" className="w-full bg-accent text-white rounded-md py-2 text-sm" onClick={() => setLearn(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
