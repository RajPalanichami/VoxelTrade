"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { pct, usd, toneClass } from "@/lib/format";
import type {
  ChartPatternAnalysis,
  OverviewDecision,
  PatternSnapshot,
  PatternTimeframe,
  PatternTradePlan,
} from "@/lib/types";
import { PatternTimeframeSelect } from "./PatternTimeframeSelect";

export function matchesPatternSelection(bundle: ChartPatternAnalysis | undefined, symbol: string) {
  if (!bundle) return false;
  return bundle.symbol.toUpperCase() === symbol.toUpperCase();
}

const DECISION_STYLE: Record<string, string> = {
  BULLISH: "text-bull",
  BEARISH: "text-bear",
  NEUTRAL: "text-slate-300",
  "BUY / ENTER": "text-bull",
  "SELL / ENTER": "text-bear",
  ENTER: "text-bull",
  "ENTER SWING TRADE": "text-bull",
  WAIT: "text-warn",
  "WAIT FOR BREAKOUT": "text-warn",
  AVOID: "text-bear",
  "AVOID / NO TRADE": "text-bear",
};

export function PatternDashboard() {
  const { symbol, autoRefresh } = useTerminal();
  const [timeframe, setTimeframe] = useState<PatternTimeframe>("1d");
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.chartPattern(symbol, timeframe),
    queryFn: ({ signal }) => api.chartPattern(symbol, timeframe, signal),
    placeholderData: (previous) => previous,
    refetchInterval: autoRefresh ? 90_000 : false,
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("enough market data") || msg.includes("does not currently support")) return false;
      return count < 1;
    },
  });
  const bundle = matchesPatternSelection(data?.data, symbol) ? data?.data : undefined;
  const pending = isLoading && !bundle;

  return (
    <div className="p-4 space-y-4 pb-16">
      <div className="panel p-4">
        <h1 className="text-2xl font-semibold tracking-tight">Chart Pattern Analysis</h1>
        <p className="text-sm text-slate-400 mt-1">
          Search a ticker above. Daily, weekly, and monthly tiles show the current pattern. Pick a timeframe below for the trade plan.
        </p>
      </div>

      {pending && (
        <div className="panel p-10 text-center text-slate-400">
          Reading {symbol.toUpperCase()} across daily, weekly, and monthly structure…
        </div>
      )}
      {error && !bundle && (
        <div className="panel p-6 text-bear text-sm">
          DATA UNAVAILABLE — {(error as Error).message}. Values are never invented.
        </div>
      )}

      {bundle && (
        <>
          <div className="panel p-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[11px] tracking-[0.18em] text-slate-500">TICKER</div>
              <div className="text-3xl font-semibold text-white mt-1" data-testid="chart-pattern-ticker">
                {bundle.symbol}
              </div>
              {bundle.name && bundle.name !== bundle.symbol && (
                <div className="text-sm text-slate-400 mt-1">{bundle.name}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl tick text-white">{usd(bundle.price)}</div>
              <div className={`text-sm tick ${toneClass(bundle.change_percent)}`}>{pct(bundle.change_percent)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="chart-pattern-overview">
            <OverviewTile snapshot={bundle.overview.daily} testId="pattern-tile-daily" />
            <OverviewTile snapshot={bundle.overview.weekly} testId="pattern-tile-weekly" />
            <OverviewTile snapshot={bundle.overview.monthly} testId="pattern-tile-monthly" />
          </div>

          <div className="panel p-4">
            <PatternTimeframeSelect value={timeframe} onChange={setTimeframe} />
          </div>

          <TradeCard plan={bundle.trade} fetching={isFetching} />
        </>
      )}
    </div>
  );
}

function OverviewTile({ snapshot, testId }: { snapshot: PatternSnapshot; testId: string }) {
  return (
    <section className="panel p-5 space-y-3" data-testid={testId}>
      <div className="text-[11px] tracking-[0.2em] text-slate-500">{snapshot.timeframe_label.toUpperCase()}</div>
      <Fact label="Current Pattern" value={snapshot.pattern_name} />
      <Fact label="Market Structure" value={snapshot.market_structure} />
      <Fact label="Direction" value={snapshot.bias} tone={snapshot.bias} />
      <Fact label="Status" value={snapshot.status} />
      <Fact label="Decision" value={snapshot.decision} tone={snapshot.decision} />
    </section>
  );
}

function TradeCard({ plan, fetching }: { plan: PatternTradePlan; fetching: boolean }) {
  return (
    <section className={`panel p-6 space-y-5 ${fetching ? "opacity-80" : ""}`} data-testid="chart-pattern-trade">
      <div>
        <div className="text-[11px] tracking-[0.18em] text-slate-500">TRADING ANALYSIS</div>
        <h2 className="text-xl font-semibold text-white mt-1" data-testid="chart-pattern-trade-heading">
          {plan.heading}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Fact label="Current Pattern" value={plan.pattern_name} testId="chart-pattern-name" />
        <Fact label="Direction" value={plan.bias} testId="chart-pattern-bias" tone={plan.bias} />
        <Fact label="Market Structure" value={plan.market_structure} testId="chart-pattern-structure" />
        <Fact label="Status" value={plan.status} testId="chart-pattern-status" />
        {plan.style === "day" ? (
          <Fact label="Entry" value={plan.entry || "—"} testId="chart-pattern-entry" />
        ) : (
          <>
            <Fact label="Entry Zone" value={plan.entry_zone || "—"} testId="chart-pattern-entry-zone" />
            <Fact label="Preferred Entry" value={plan.preferred_entry || "—"} testId="chart-pattern-preferred-entry" />
          </>
        )}
        <Fact label="Stop Loss" value={plan.stop || "—"} testId="chart-pattern-stop" />
        <Fact label="Target 1" value={plan.target_1 || "—"} testId="chart-pattern-target-1" />
        <Fact label="Target 2" value={plan.target_2 || "—"} testId="chart-pattern-target-2" />
        <Fact label="Target 3" value={plan.target_3 || "—"} testId="chart-pattern-target-3" />
      </div>

      <div
        className={`rounded-md border border-line px-4 py-3 ${DECISION_STYLE[plan.decision] || "text-white"}`}
        data-testid="chart-pattern-decision"
      >
        <div className="text-[11px] tracking-[0.16em] text-slate-500">DECISION</div>
        <div className="text-xl font-semibold mt-1">{plan.decision}</div>
      </div>
    </section>
  );
}

function Fact({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: string;
  testId?: string;
  tone?: OverviewDecision | string;
}) {
  return (
    <div className="rounded-md border border-line px-4 py-3">
      <div className="text-[11px] tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`text-lg mt-1 ${tone ? DECISION_STYLE[tone] || "text-white" : "text-white"}`} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
