"use client";

import { Quote } from "@/lib/types";
import { compact, money, pct, usd } from "@/lib/format";
import { TimeframeSelect } from "@/components/search/TimeframeSelect";
import { Timeframe } from "@/lib/types";

export function TickerHeader({
  quote,
  timeframe,
  onTimeframe,
}: {
  quote: Quote;
  timeframe: Timeframe;
  onTimeframe: (t: Timeframe) => void;
}) {
  const up = (quote.change || 0) >= 0;
  const lo = quote.week52_low;
  const hi = quote.week52_high;
  const pos = lo && hi && hi !== lo ? ((quote.price - lo) / (hi - lo)) * 100 : 50;

  const stats = [
    ["OPEN", usd(quote.open)],
    ["HIGH", usd(quote.high)],
    ["LOW", usd(quote.low)],
    ["PREV CLOSE", usd(quote.previous_close)],
    ["VOLUME", compact(quote.volume)],
    ["VOL RATIO", quote.volume_ratio ? `${quote.volume_ratio.toFixed(2)}x` : "—"],
    ["MKT CAP", compact(quote.market_cap)],
    ["P/E", quote.pe ? money(quote.pe, 2) : "—"],
    ["BETA", quote.beta ? money(quote.beta, 2) : "—"],
  ];

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start gap-6">
        <div>
          <div className="text-2xl font-bold tracking-tight">
            {quote.symbol} <span className="text-slate-400 text-base font-normal">{quote.name}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {quote.exchange} · {quote.sector || "—"} · {quote.industry || "—"}
          </div>
        </div>
        <div>
          <div className="text-3xl font-semibold tick">{usd(quote.price)}</div>
          <div className={`text-sm tick ${up ? "text-bull" : "text-bear"}`}>
            {up ? "+" : ""}
            {money(quote.change)} ({pct(quote.change_percent)})
          </div>
        </div>
        <TimeframeSelect value={timeframe} onChange={onTimeframe} />
        <div className="flex-1 min-w-[200px]">
          <div className="text-[10px] tracking-widest text-slate-500 mb-1">52-WEEK RANGE</div>
          <div className="h-1.5 bg-slate-800 rounded-full relative">
            <div className="absolute -top-1 h-3.5 w-1.5 bg-white rounded" style={{ left: `${Math.max(0, Math.min(100, pos))}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 mt-1 tick">
            <span>{usd(lo)}</span>
            <span>{usd(hi)}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-9 gap-2 mt-4">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-white/[0.03] rounded px-2 py-1.5">
            <div className="text-[9px] tracking-widest text-slate-500">{k}</div>
            <div className="text-sm tick text-slate-200">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
