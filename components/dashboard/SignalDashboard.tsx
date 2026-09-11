"use client";

import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { ScoreGauge } from "@/components/signal/ScoreGauge";
import { SignalTable } from "@/components/signal/SignalTable";
import { PriceChart } from "@/components/chart/PriceChart";
import { SRLadder } from "@/components/levels/SRLadder";
import { TradingPlanCard } from "@/components/plan/TradingPlanCard";
import { MultiTimeframeMatrix } from "@/components/mtf/MultiTimeframeMatrix";
import { TickerHeader } from "@/components/quote/TickerHeader";
import { TimeframeSelect } from "@/components/search/TimeframeSelect";
import { MarketStrip, NewsTicker } from "@/components/market/MarketStrip";
import { statusDot, usd } from "@/lib/format";
import type { Quote } from "@/lib/types";

export function matchesSelection(
  bundle: { quote?: Quote; signal?: { timeframe?: string } } | undefined,
  symbol: string,
  timeframe: string,
) {
  if (!bundle?.quote || !bundle.signal) return false;
  return bundle.quote.symbol.toUpperCase() === symbol.toUpperCase() && bundle.signal.timeframe === timeframe;
}

export function SignalDashboard() {
  const { symbol, setTimeframe, timeframe, autoRefresh } = useTerminal();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.analysis(symbol, timeframe),
    queryFn: ({ signal }) => api.analysis(symbol, timeframe, signal),
    refetchInterval: autoRefresh ? 60_000 : false,
    placeholderData: (previous) => previous,
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("enough market data") || msg.includes("does not currently support")) return false;
      return count < 1;
    },
  });

  const raw = data?.data;
  const bundle = matchesSelection(raw, symbol, timeframe) ? raw : undefined;
  const pending = isLoading || (isFetching && !bundle);

  return (
    <div className="p-4 space-y-4 pb-16">
      {bundle ? (
        <TickerHeader quote={bundle.quote} timeframe={timeframe} onTimeframe={setTimeframe} />
      ) : (
        <div className="panel p-4 flex flex-wrap items-end gap-4">
          <div>
            <div className="text-2xl font-bold tracking-tight">{symbol.toUpperCase()}</div>
            <div className="text-xs text-slate-500 mt-1">Signal Analyzer</div>
          </div>
          <TimeframeSelect value={timeframe} onChange={setTimeframe} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="tracking-[0.2em] text-slate-500">{bundle?.signal.timeframe_label || timeframe} SIGNAL</span>
        {bundle && (
          <>
            <span className={`h-2 w-2 rounded-full ${statusDot(bundle.freshness.data_status)}`} />
            <span className="text-slate-400">
              {bundle.freshness.data_status} · {bundle.freshness.source} · {bundle.freshness.latency_ms}ms · algo{" "}
              {bundle.signal.algorithm_version}
            </span>
            {isFetching && <span className="text-accent">recalculating…</span>}
          </>
        )}
      </div>

      {pending && <div className="panel p-10 text-center text-slate-400">Fetching market data and calculating 10 signals…</div>}
      {error && !bundle && (
        <div className="panel p-6 text-bear text-sm">
          DATA UNAVAILABLE — {(error as Error).message}. Values are never invented.
        </div>
      )}

      {bundle && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">
            <div className="space-y-4 order-1">
              <ScoreGauge
                score={bundle.signal.score}
                signal={bundle.signal.signal}
                confidence={bundle.signal.confidence}
                bull={bundle.signal.bullish_signals}
                neu={bundle.signal.neutral_signals}
                bear={bundle.signal.bearish_signals}
              />
              <div className="panel p-4 text-sm text-slate-300 leading-relaxed">
                <div className="text-[10px] tracking-[0.2em] text-slate-500 mb-2">WHY THIS SIGNAL</div>
                {bundle.signal.explanation}
                {bundle.signal.alignment && (
                  <div className="mt-3 text-xs text-accent">TIMEFRAME ALIGNMENT {bundle.signal.alignment}</div>
                )}
                {bundle.signal.hard_filters?.length > 0 && (
                  <ul className="mt-3 text-warn text-xs space-y-1">
                    {bundle.signal.hard_filters.map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="space-y-4 order-3 xl:order-2">
              <div className="hidden md:grid grid-cols-5 gap-2">
                {[
                  ["PRICE", usd(bundle.quote.price)],
                  ["RSI", bundle.indicators.rsi?.toFixed(1) ?? "—"],
                  ["MACD", bundle.indicators.macd?.toFixed(3) ?? "—"],
                  ["VWAP", usd(bundle.indicators.vwap)],
                  ["VOL RATIO", bundle.indicators.volume_ratio ? `${bundle.indicators.volume_ratio.toFixed(2)}x` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="panel px-3 py-2">
                    <div className="text-[9px] tracking-widest text-slate-500">{k}</div>
                    <div className="tick text-white">{v}</div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <PriceChart
                  key={`${symbol}-${timeframe}-desktop`}
                  bars={bundle.bars}
                  indicators={bundle.indicators}
                  levels={bundle.levels}
                  plan={bundle.long_plan}
                  timeframe={timeframe}
                />
              </div>
              <SignalTable categories={bundle.signal.categories} score={bundle.signal.score} />
              <div className="md:hidden">
                <PriceChart
                  key={`${symbol}-${timeframe}-mobile`}
                  bars={bundle.bars}
                  indicators={bundle.indicators}
                  levels={bundle.levels}
                  plan={bundle.long_plan}
                  timeframe={timeframe}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SRLadder
              levels={bundle.levels}
              price={bundle.quote.price}
              insight={bundle.signal.categories.find((c) => c.name === "Support/Resistance")?.details}
            />
            <TradingPlanCard plan={bundle.long_plan} title={`${bundle.signal.timeframe_label.toUpperCase()} TRADING PLAN`} />
            <TradingPlanCard plan={bundle.short_plan} title="BEARISH SCENARIO" />
          </div>

          <MultiTimeframeMatrix rows={bundle.multi_timeframe} selected={timeframe} />
          <MarketStrip market={bundle.market || undefined} />
        </>
      )}
      <NewsTicker items={bundle?.news || []} />
    </div>
  );
}
