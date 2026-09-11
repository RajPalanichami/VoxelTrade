"use client";

import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { PriceChart } from "@/components/chart/PriceChart";
import { SRLadder } from "@/components/levels/SRLadder";
import { TimeframeSelect } from "@/components/search/TimeframeSelect";
import { usd } from "@/lib/format";

export default function TechnicalPage() {
  const { symbol, timeframe, setTimeframe, autoRefresh } = useTerminal();
  const { data } = useQuery({
    queryKey: keys.analysis(symbol, timeframe),
    queryFn: () => api.analysis(symbol, timeframe),
    refetchInterval: autoRefresh ? 90_000 : false,
  });
  const b = data?.data;
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Technical Analysis — {symbol}</h1>
        <TimeframeSelect value={timeframe} onChange={setTimeframe} />
      </div>
      {b && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              ["EMA9", b.indicators.ema9, "usd"],
              ["EMA21", b.indicators.ema21, "usd"],
              ["EMA20", b.indicators.ema20, "usd"],
              ["EMA50", b.indicators.ema50, "usd"],
              ["EMA200", b.indicators.ema200, "usd"],
              ["RSI", b.indicators.rsi, "n"],
              ["ATR", b.indicators.atr, "usd"],
              ["VWAP", b.indicators.vwap, "usd"],
            ].map(([k, v, kind]) => (
              <div key={String(k)} className="panel p-3">
                <div className="text-[10px] text-slate-500">{k}</div>
                <div className="tick">
                  {typeof v === "number" ? (kind === "usd" ? usd(v) : v.toFixed(1)) : "—"}
                </div>
              </div>
            ))}
          </div>
          <PriceChart bars={b.bars} indicators={b.indicators} levels={b.levels} plan={b.long_plan} timeframe={timeframe} />
          <SRLadder levels={b.levels} price={b.quote.price} />
        </>
      )}
    </div>
  );
}
