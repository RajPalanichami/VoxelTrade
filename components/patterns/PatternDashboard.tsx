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
import { TickerSessionStrip } from "@/components/market/TickerSessionStrip";

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
      <TickerSessionStrip symbol={symbol} compactMode />
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

          {bundle.mtf_summary && (
            <div className="panel p-5 space-y-3" data-testid="chart-pattern-mtf">
              <div className="text-[11px] tracking-[0.2em] text-slate-500">MULTI-TIMEFRAME SUMMARY</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <Fact label="Short-Term" value={bundle.mtf_summary.short_term} />
                <Fact label="Intermediate-Term" value={bundle.mtf_summary.intermediate_term} />
                <Fact label="Long-Term" value={bundle.mtf_summary.long_term} />
              </div>
              <Fact label="MTF Status" value={bundle.mtf_summary.status} />
              <p className="text-sm text-slate-400">{bundle.mtf_summary.explanation}</p>
            </div>
          )}

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
      <Fact label="Pattern Bias" value={snapshot.bias} tone={snapshot.bias} />
      <Fact label="Market Structure" value={snapshot.market_structure} />
      <Fact label="Status" value={snapshot.pattern_status || snapshot.status} />
      <Fact label="Trading Signal" value={`${snapshot.trading_signal || snapshot.bias} · ${snapshot.signal_action || snapshot.decision}`} tone={snapshot.trading_signal || snapshot.bias} />
      {snapshot.structure_conflict && <p className="text-sm text-slate-400">{snapshot.structure_conflict}</p>}
      {snapshot.explanation && !snapshot.structure_conflict && <p className="text-sm text-slate-400">{snapshot.explanation}</p>}
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
        <Fact label="Pattern Bias" value={plan.bias} testId="chart-pattern-bias" tone={plan.bias} />
        <Fact label="Market Structure" value={plan.market_structure} testId="chart-pattern-structure" />
        <Fact label="Status" value={plan.pattern_status || plan.status} testId="chart-pattern-status" />
        <Fact label="Trading Signal" value={`${plan.trading_signal || plan.bias} · ${plan.signal_action || "WAIT"}`} />
        <Fact label="Entry Status" value={plan.entry_status || "WAITING FOR BREAKOUT"} />
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
        {plan.explanation && <p className="text-sm text-slate-400 mt-2">{plan.explanation}</p>}
      </div>

      <WhyPattern plan={plan} />
    </section>
  );
}

function WhyPattern({ plan }: { plan: PatternTradePlan }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3" data-testid="chart-pattern-why">
      <button
        type="button"
        className="rounded-md border border-line px-4 py-2 text-sm text-white hover:border-accent/60"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide pattern evidence" : "Why This Pattern?"}
      </button>
      {open && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Fact label="Pattern" value={plan.pattern_name} />
            <Fact label="Timeframe" value={plan.timeframe_label} />
            <Fact label="Pattern Confidence" value={plan.confidence != null ? `${plan.confidence}/100` : "—"} />
            <Fact label="Signal Score" value={plan.signal_score != null ? `${plan.signal_score}/100` : "—"} />
            <Fact label="Neckline" value={plan.neckline != null ? `$${plan.neckline.toFixed(2)}` : "—"} />
            <Fact label="Support" value={plan.support != null ? `$${plan.support.toFixed(2)}` : "—"} />
            <Fact label="Resistance" value={plan.resistance != null ? `$${plan.resistance.toFixed(2)}` : "—"} />
            <Fact label="Volume" value={plan.volume_note || "Volume confirmation unavailable."} />
          </div>
          {plan.wick_note && <p className="text-sm text-warn">{plan.wick_note}</p>}
          {plan.breakout_note && <p className="text-sm text-slate-300">{plan.breakout_note}</p>}
          {plan.invalidation && <p className="text-sm text-slate-400">Invalidation: {plan.invalidation}</p>}
          {(plan.points || []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr>
                    <th className="text-left py-2">Role</th>
                    <th className="text-left py-2">Candle</th>
                    <th className="text-right py-2">Price</th>
                    <th className="text-left py-2 pl-4">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {(plan.points || []).map((p) => (
                    <tr key={`${p.role}-${p.candleIndex}`} className="border-t border-line">
                      <td className="py-2">{p.role}</td>
                      <td className="py-2">{p.timestamp ? p.timestamp.slice(0, 10) : `Bar ${p.candleIndex}`}</td>
                      <td className="py-2 text-right tick">${p.price.toFixed(2)}</td>
                      <td className="py-2 pl-4 text-slate-400">{p.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(plan.evidence || []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr>
                    <th className="text-left py-2">Evidence</th>
                    <th className="text-left py-2">Value</th>
                    <th className="text-right py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(plan.evidence || []).map((row) => (
                    <tr key={row.label} className="border-t border-line">
                      <td className="py-2">{row.label}</td>
                      <td className="py-2">{row.value}</td>
                      <td className="py-2 text-right">{row.ok == null ? "—" : row.ok ? "✓" : "×"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(plan.signal_factors || []).length > 0 && (
            <div>
              <div className="text-[11px] tracking-[0.16em] text-slate-500 mb-2">SIGNAL ANALYSIS</div>
              {(plan.signal_factors || []).map((f) => (
                <div key={f.name} className="flex justify-between gap-3 text-sm py-1">
                  <span className="text-slate-400">
                    {f.name} <span className="text-slate-600">{f.note}</span>
                  </span>
                  <span className="tick">
                    {f.score}/{f.max}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold pt-2 border-t border-line">
                <span>Total</span>
                <span className="tick">{plan.signal_score ?? 0}/100</span>
              </div>
            </div>
          )}
          {(plan.alternatives || []).length > 0 && (
            <div>
              <div className="text-[11px] tracking-[0.16em] text-slate-500 mb-2">ALTERNATIVE PATTERNS</div>
              {(plan.alternatives || []).map((alt) => (
                <div key={alt.name} className="flex justify-between text-sm py-1">
                  <span>{alt.name}</span>
                  <span className="tick">{alt.confidence}/100</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
