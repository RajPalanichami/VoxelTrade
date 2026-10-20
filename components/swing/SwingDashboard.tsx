"use client";

import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { usd, toneClass } from "@/lib/format";
import type { SwingAnalysis, SwingTimeframe } from "@/lib/types";
import { useState } from "react";
import { SwingStrategyCard } from "./SwingStrategyCard";
import { SwingTimeframeSelect } from "./SwingTimeframeSelect";
import { TickerSessionStrip } from "@/components/market/TickerSessionStrip";

export function matchesSwingSelection(bundle: SwingAnalysis | undefined, symbol: string, timeframe: SwingTimeframe) {
  if (!bundle) return false;
  return bundle.symbol.toUpperCase() === symbol.toUpperCase() && bundle.timeframe === timeframe;
}

export function SwingDashboard() {
  const { symbol, autoRefresh } = useTerminal();
  const [timeframe, setTimeframe] = useState<SwingTimeframe>("4h");
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.swing(symbol, timeframe),
    queryFn: ({ signal }) => api.swing(symbol, timeframe, signal),
    refetchInterval: autoRefresh ? 90_000 : false,
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("enough market data") || msg.includes("does not currently support")) return false;
      return count < 1;
    },
  });

  const bundle = matchesSwingSelection(data?.data, symbol, timeframe) ? data?.data : undefined;
  const pending = isLoading || (isFetching && !bundle);

  return (
    <div className="p-4 space-y-6 pb-16">
      <TickerSessionStrip symbol={symbol} compactMode />
      <div className="panel p-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {symbol.toUpperCase()} — {bundle?.timeframe_label || timeframeLabel(timeframe)} Swing Trading Analysis
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            One ticker and one timeframe drive all 10 strategies. Search above, then change the timeframe to recalculate every chart and level.
          </p>
        </div>
        <SwingTimeframeSelect value={timeframe} onChange={setTimeframe} />
      </div>

      {pending && (
        <div className="panel p-10 text-center text-slate-400">
          Retrieve market data, then run all 10 swing strategies for {symbol.toUpperCase()} on {timeframeLabel(timeframe)}…
        </div>
      )}
      {error && !bundle && (
        <div className="panel p-6 text-bear text-sm">
          DATA UNAVAILABLE — {(error as Error).message}. Values are never invented.
        </div>
      )}

      {bundle && (
        <>
          <OverallPanel bundle={bundle} />
          {bundle.strategies.map((strategy) => (
            <SwingStrategyCard
              key={`${bundle.symbol}-${bundle.timeframe}-${strategy.id}`}
              strategy={strategy}
              symbol={bundle.symbol}
              timeframe={bundle.timeframe}
              timeframeLabel={bundle.timeframe_label}
              bars={bundle.bars}
              onTimeframe={setTimeframe}
            />
          ))}
          <OverallTable bundle={bundle} />
        </>
      )}
    </div>
  );
}

function OverallPanel({ bundle }: { bundle: SwingAnalysis }) {
  const s = bundle.summary;
  return (
    <div className="panel p-5 space-y-4" data-testid="swing-overall">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-slate-500">OVERALL SWING SCORE</div>
          <div className="text-3xl font-bold tick" data-testid="swing-overall-score">
            {s.overallScore} / 100
          </div>
          <div className={`text-lg font-semibold ${toneClass(s.overallSignal)}`}>{s.overallLabel}</div>
        </div>
        <div className="text-sm text-slate-400 max-w-xl">{s.agreement}</div>
      </div>
      <p className="text-white leading-relaxed" data-testid="swing-action">
        {s.action}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <Metric label="PREFERRED ENTRY" value={`${usd(s.preferredEntryLow)}–${usd(s.preferredEntryHigh)}`} />
        <Metric label="ENTRY" value={usd(s.preferredEntry)} />
        <Metric label="STOP LOSS" value={usd(s.stop)} />
        <Metric label="TARGET 1" value={usd(s.target1)} />
        <Metric label="TARGET 2" value={usd(s.target2)} />
        <Metric label="TARGET 3" value={usd(s.target3)} />
        <Metric label="R:R" value={s.riskReward == null ? "—" : `1:${s.riskReward.toFixed(1)}`} />
      </div>
    </div>
  );
}

function OverallTable({ bundle }: { bundle: SwingAnalysis }) {
  const s = bundle.summary;
  return (
    <section className="panel overflow-hidden" data-testid="swing-summary-table">
      <div className="px-4 py-3 border-b border-line">
        <h2 className="text-lg font-semibold">Overall swing agreement</h2>
        <p className="text-sm text-slate-400 mt-1">{s.summary}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-[0.16em] text-slate-500">
            <tr className="border-b border-line">
              <th className="text-left px-4 py-2">Strategy</th>
              <th className="text-left px-4 py-2">Score</th>
              <th className="text-left px-4 py-2">Signal</th>
            </tr>
          </thead>
          <tbody>
            {bundle.strategies.map((row) => (
              <tr key={row.id} className="border-b border-white/5">
                <td className="px-4 py-2 text-white">{row.name}</td>
                <td className="px-4 py-2 tick">{row.score}</td>
                <td className={`px-4 py-2 ${toneClass(row.signal)}`}>{row.signal.replace("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs border-t border-line">
        <Metric label="OVERALL SWING SCORE" value={`${s.overallScore} / 100`} />
        <Metric label="OVERALL SIGNAL" value={s.overallLabel} />
        <Metric label="PREFERRED ENTRY" value={`${usd(s.preferredEntryLow)}–${usd(s.preferredEntryHigh)}`} />
        <Metric label="STOP LOSS" value={usd(s.stop)} />
        <Metric label="TARGET 1" value={usd(s.target1)} />
        <Metric label="TARGET 2" value={usd(s.target2)} />
        <Metric label="RISK/REWARD" value={s.riskReward == null ? "—" : `1:${s.riskReward.toFixed(1)}`} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.16em] text-slate-500">{label}</div>
      <div className="text-white tick mt-1">{value}</div>
    </div>
  );
}

function timeframeLabel(tf: SwingTimeframe) {
  return (
    {
      "15m": "15 Minutes",
      "30m": "30 Minutes",
      "1h": "1 Hour",
      "4h": "4 Hours",
      "1d": "Daily",
      "1w": "Weekly",
    } as const
  )[tf];
}
