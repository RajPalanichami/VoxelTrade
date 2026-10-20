"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { money } from "@/lib/format";
import { TIMEFRAMES, type Quote, type Timeframe } from "@/lib/types";
import { useTerminal } from "@/components/layout/AppShell";
import { TickerSearch } from "@/components/search/TickerSearch";
import { TechnicalChart } from "@/components/chart/TechnicalChart";
import {
  CHART_TIMEFRAMES,
  EMA_DEFAULTS,
  EMA_GUIDE,
  analyzeChart,
  chartCacheKey,
  crossoverAt,
  hypotheticalRiskReward,
  leverageProfile,
  type ChartCandle,
  type EnabledChartTimeframe,
} from "@/src/engines/technicalChart";

const EMA_COLORS = ["#38bdf8", "#fbbf24", "#a78bfa", "#fb7185", "#34d399", "#f97316"];
const EXAMPLES = ["AAPL", "MSFT", "SOXL", "SOXS", "BTC-USD"];

type EmaPref = { period: number; enabled: boolean };

export function TechnicalStudio() {
  const { symbol, setSymbol, timeframe, setTimeframe } = useTerminal();
  const [chartTimeframe, setChartTimeframe] = useState<EnabledChartTimeframe>(timeframe);
  const [emaPrefs, setEmaPrefs] = useState<EmaPref[]>(EMA_DEFAULTS.map((period) => ({ period, enabled: true })));
  const [showFib, setShowFib] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [fibAnchors, setFibAnchors] = useState<{ highTime: number; lowTime: number } | null>(null);
  const [hover, setHover] = useState<ChartCandle | null>(null);
  const [planOn, setPlanOn] = useState(false);
  const [stopText, setStopText] = useState("");
  const [targetText, setTargetText] = useState("");
  const resetRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setFibAnchors(null);
    setHover(null);
  }, [symbol, chartTimeframe]);

  const barsQuery = useQuery({
    queryKey: ["chart-bars", symbol, chartTimeframe],
    queryFn: ({ signal }) => api.chartBars(symbol, chartTimeframe, signal),
    staleTime: 60_000,
  });
  const quoteQuery = useQuery({
    queryKey: keys.quote(symbol),
    queryFn: ({ signal }) => api.quote(symbol, signal),
    staleTime: 30_000,
  });

  const enabledPeriods = emaPrefs.filter((item) => item.enabled).map((item) => item.period);
  const periodKey = enabledPeriods.join(",");
  const gapEligible = (chartTimeframe === "1d" || chartTimeframe === "1w") && !symbol.endsWith("-USD") && !symbol.startsWith("^");
  const settingsKey = chartCacheKey(symbol, chartTimeframe, `${periodKey}:${fibAnchors?.highTime ?? "auto"}:${fibAnchors?.lowTime ?? "auto"}`);
  const analysis = useMemo(() => {
    if (!barsQuery.data?.data) return null;
    const custom = periodKey ? periodKey.split(",").map(Number) : [];
    return analyzeChart(barsQuery.data.data, {
      timeframe: chartTimeframe,
      emaPeriods: [...new Set([...EMA_DEFAULTS, ...custom])],
      gapEligible,
      fibAnchors,
    });
  }, [barsQuery.data, chartTimeframe, fibAnchors, gapEligible, periodKey]);
  const chartModel = useMemo(() => {
    if (!analysis) return null;
    const enabled = new Set(periodKey ? periodKey.split(",").map(Number) : []);
    return {
      emas: analysis.emas
        .filter((item) => enabled.has(item.period))
        .map((item, index) => ({ ...item, color: EMA_COLORS[index % EMA_COLORS.length] })),
      zones: analysis.zones
        .filter((zone) => {
          if (zone.role !== "active" || analysis.price == null) return false;
          return zone.kind === "support" ? zone.high <= analysis.price : zone.low >= analysis.price;
        })
        .slice(0, 4),
      gap: analysis.gaps.length ? analysis.gaps[analysis.gaps.length - 1] : null,
    };
  }, [analysis, periodKey]);

  useEffect(() => {
    if (fibAnchors == null && analysis?.suggestedAnchors) {
      setFibAnchors({ highTime: analysis.suggestedAnchors.highTime, lowTime: analysis.suggestedAnchors.lowTime });
    }
  }, [analysis?.suggestedAnchors, fibAnchors]);

  const quote = quoteQuery.data?.data;
  const leverage = leverageProfile(`${quote?.long_name || ""} ${quote?.name || ""}`);
  const panelEmas = chartModel?.emas ?? [];
  const activeZones = chartModel?.zones ?? [];
  const latestGap = chartModel?.gap ?? null;
  const completedIndex = analysis ? (analysis.provisional ? analysis.candles.length - 2 : analysis.candles.length - 1) : -1;
  const ema9 = analysis?.emas.find((item) => item.period === 9);
  const ema21 = analysis?.emas.find((item) => item.period === 21);
  const cross = ema9 && ema21 ? crossoverAt(ema9.series, ema21.series, completedIndex) : "insufficient";
  const headerCandle = hover ?? analysis?.candles[analysis.candles.length - 1] ?? null;
  const plan = planOn && analysis?.price != null ? hypotheticalRiskReward(analysis.price, numberOrNull(stopText), numberOrNull(targetText)) : null;

  const selectTimeframe = (id: EnabledChartTimeframe) => {
    setChartTimeframe(id);
    if (TIMEFRAMES.some((item) => item.id === id)) setTimeframe(id as Timeframe);
  };

  return (
    <div data-testid="technical-studio" data-cache-key={settingsKey} className="p-3 lg:p-4">
      <h1 className="sr-only">Technical analysis chart for {symbol}</h1>
      <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <aside className="panel p-3 space-y-3">
          <div className="text-[10px] tracking-[0.16em] text-slate-500">TICKER</div>
          <TickerSearch value={symbol} onSelect={setSymbol} label="Search ticker" />
          <div className="flex flex-wrap gap-1">
            {EXAMPLES.map((item) => (
              <button key={item} type="button" onClick={() => setSymbol(item)} className="rounded border border-line px-2 py-1 text-[11px] text-slate-300 hover:border-accent/60">
                {item}
              </button>
            ))}
          </div>
          <SymbolFact label="Symbol" value={quote?.symbol || symbol} />
          <SymbolFact label="Name" value={quote?.long_name || quote?.name || "—"} />
          <SymbolFact label="Type" value={instrumentLabel(symbol, quote?.name || "", leverage)} />
          <SymbolFact label="Exchange" value={quote?.exchange || "—"} />
          <SymbolFact label="Currency" value={quote?.currency || "—"} />
          <p className="text-[11px] leading-4 text-slate-500">The chart follows the ticker selected here or in the header search. Levels are recalculated for this symbol and timeframe.</p>
        </aside>

        <section className="space-y-3 min-w-0">
          <div className="panel p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold" data-testid="chart-symbol">
                  {quote?.symbol || symbol} <span className="text-sm font-normal text-slate-400">{quote?.name}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="tick text-2xl" data-testid="chart-price">
                    {quote ? money(quote.price) : analysis?.price != null ? money(analysis.price) : "—"}
                  </span>
                  {quote?.change != null && quote.change_percent != null && (
                    <span className={quote.change >= 0 ? "text-bull text-sm" : "text-bear text-sm"}>
                      {quote.change >= 0 ? "+" : ""}
                      {money(quote.change)} ({quote.change_percent.toFixed(2)}%)
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-slate-500" data-testid="chart-freshness">
                  {freshnessLine(quote, barsQuery.data?.dataStatus, chartTimeframe, analysis?.provisional ?? false)}
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-400" aria-live="polite">
                {headerCandle ? (
                  <>
                    <div>O {money(headerCandle.open)} H {money(headerCandle.high)}</div>
                    <div>L {money(headerCandle.low)} C {money(headerCandle.close)}</div>
                    <div>V {headerCandle.volume == null ? "—" : Intl.NumberFormat("en", { notation: "compact" }).format(headerCandle.volume)}</div>
                  </>
                ) : (
                  "Crosshair OHLCV"
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Timeframe">
              {CHART_TIMEFRAMES.map((item) =>
                item.enabled ? (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={chartTimeframe === item.id}
                    onClick={() => selectTimeframe(item.id)}
                    className={`rounded px-2 py-1 text-xs ${chartTimeframe === item.id ? "bg-accent/20 text-white" : "text-slate-400 hover:bg-white/5"}`}
                  >
                    {item.label}
                  </button>
                ) : (
                  <button key={item.id} type="button" disabled title={item.reason} className="rounded px-2 py-1 text-xs text-slate-600 cursor-not-allowed">
                    {item.label}
                  </button>
                ),
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Toggle pressed={showZones} onClick={() => setShowZones((value) => !value)} label="Support / resistance" />
              <Toggle pressed={showFib} onClick={() => setShowFib((value) => !value)} label="Fibonacci" />
              <Toggle pressed={showVolume} onClick={() => setShowVolume((value) => !value)} label="Volume" />
              <button type="button" onClick={() => resetRef.current?.()} className="rounded border border-line px-2 py-1 text-xs text-slate-300">
                Reset view
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {emaPrefs.map((pref, index) => (
                <label key={index} className="flex items-center gap-1 text-[11px] text-slate-300" title={EMA_GUIDE[pref.period] || "Configurable exponential moving average."}>
                  <input
                    type="checkbox"
                    checked={pref.enabled}
                    aria-label={`Show EMA ${pref.period}`}
                    onChange={(event) => setEmaPrefs((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, enabled: event.target.checked } : item)))}
                  />
                  <span style={{ color: EMA_COLORS[index] }}>EMA</span>
                  <input
                    type="number"
                    min={2}
                    max={400}
                    value={pref.period}
                    aria-label={`EMA period ${index + 1}`}
                    onChange={(event) => {
                      const period = Number(event.target.value);
                      if (!Number.isInteger(period)) return;
                      setEmaPrefs((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, period } : item)));
                    }}
                    className="w-14 bg-panel2 border border-line rounded px-1 py-0.5"
                  />
                </label>
              ))}
            </div>
          </div>

          {leverage && (
            <div className="panel p-3 text-xs leading-5 text-warn" data-testid="leverage-notice">
              {leverage.inverse ? "Inverse" : "Leveraged"} fund{leverage.multiple ? ` (${leverage.multiple}x in the instrument name)` : ""}. {leverage.notice}
            </div>
          )}

          <div className="panel overflow-hidden h-[420px] lg:h-[520px]" data-testid="technical-chart">
            {barsQuery.isLoading && <div className="p-4 text-sm text-slate-400">Loading {symbol} {chartTimeframe} candles…</div>}
            {barsQuery.isError && (
              <div className="p-4 text-sm text-bear" role="alert" data-testid="chart-error">
                {(barsQuery.error as Error).message || "Market data is unavailable for this symbol and timeframe."}
              </div>
            )}
            {analysis && analysis.candles.length > 0 && (
              <TechnicalChart
                candles={analysis.candles}
                emas={panelEmas}
                zones={activeZones}
                fib={showFib ? analysis.fib : null}
                gap={latestGap}
                trendlines={analysis.trendlines}
                showZones={showZones}
                showFib={showFib}
                showVolume={showVolume}
                timeframe={chartTimeframe}
                onCandle={setHover}
                resetRef={resetRef}
              />
            )}
            {analysis && analysis.candles.length === 0 && <div className="p-4 text-sm text-slate-400">No valid candles were returned for {symbol}.</div>}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="panel p-3 space-y-2">
              <h2 className="text-xs tracking-[0.14em] text-slate-500">EMA ANALYSIS</h2>
              {panelEmas.map((ema) => (
                <div key={ema.period} className="flex items-start justify-between gap-2 text-xs">
                  <span title={EMA_GUIDE[ema.period] || "Exponential moving average of close."}>
                    <span style={{ color: ema.color }}>EMA {ema.period}</span>
                    <span className="block text-[10px] text-slate-500">{EMA_GUIDE[ema.period] || "Custom period. A convention, not a guaranteed signal."}</span>
                  </span>
                  <span className="text-right">
                    <span className="tick">{ema.value == null ? "Insufficient data" : money(ema.value)}</span>
                    <span className="block text-[10px] text-slate-400">
                      {ema.slope} · price {ema.priceRelation}
                    </span>
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-slate-500">EMA 9 / EMA 21 crossover on the last completed candle: {cross}. The forming candle is excluded.</p>
            </article>

            <article className="panel p-3 space-y-2 text-xs">
              <h2 className="text-xs tracking-[0.14em] text-slate-500">KEY INDICATORS</h2>
              <p>Support / resistance: {activeZones.length ? `${activeZones.length} active zone${activeZones.length === 1 ? "" : "s"} on ${chartTimeframe}` : "Insufficient data"}</p>
              <p title="A swing is confirmed only after 3 later candles. Higher high, higher low, lower high, and lower low compare the latest two confirmed pivots.">
                Structure: {analysis?.structure.trend ?? "—"} · highs {analysis?.structure.highLabel ?? "—"} · lows {analysis?.structure.lowLabel ?? "—"}
              </p>
              <p>{analysis?.structure.reversalRule}</p>
              <p>Reversal confirmed: {analysis ? (analysis.structure.reversalConfirmed ? "Yes" : "No") : "—"}</p>
              <FibControls analysisAnchors={analysis?.swings ?? []} fib={analysis?.fib ?? null} onChange={setFibAnchors} onLatest={() => analysis?.suggestedAnchors && setFibAnchors({ highTime: analysis.suggestedAnchors.highTime, lowTime: analysis.suggestedAnchors.lowTime })} />
              <p title={latestGap?.session || "Gaps use the previous daily or weekly high and low. They are not calculated for intraday or 24-hour markets."}>
                Gap: {latestGap ? `${latestGap.filled ? "Filled" : "Open"} ${latestGap.direction} ${money(latestGap.low)}–${money(latestGap.high)} (${latestGap.fillPct.toFixed(0)}%)` : gapEligible ? "None detected" : "Not applicable for this instrument or timeframe"}
              </p>
              <p>Trendline: {analysis?.trendlines.length ? analysis.trendlines.map((line) => `${line.kind} ${line.status}`).join(" · ") : "Insufficient data"}</p>
              <p title={analysis?.volume.note}>
                Volume: {analysis?.volume.lastCompleted == null ? "Insufficient data" : Intl.NumberFormat("en", { notation: "compact" }).format(analysis.volume.lastCompleted)}
                {analysis?.volume.average != null ? ` · avg ${Intl.NumberFormat("en", { notation: "compact" }).format(analysis.volume.average)}` : ""}
                {analysis?.volume.relative != null ? ` · RVOL ${analysis.volume.relative.toFixed(2)}` : ""}
              </p>
              <p className="text-[10px] text-slate-500">Green volume is an up candle (close at or above open). Red volume is a down candle. High volume does not establish the next price direction. A higher-volume breakout only means more participation in that candle.</p>
            </article>

            <article className="panel p-3 space-y-2" data-testid="decision-support">
              <h2 className="text-xs tracking-[0.14em] text-slate-500">DAY TRADING DECISION SUPPORT</h2>
              <div className="text-sm font-semibold" data-testid="decision-status">
                {analysis?.decision.status ?? (barsQuery.isLoading ? "Loading" : "INSUFFICIENT DATA")}
              </div>
              <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                {(analysis?.decision.reasons ?? ["Waiting for candles."]).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-400">Invalidation: {analysis?.decision.invalidation ?? "Insufficient data"}</p>
              <p className="text-[10px] text-slate-500">This status describes calculated price structure. It is not a buy or sell instruction, and it is not a win probability.</p>
              <button type="button" aria-pressed={planOn} onClick={() => setPlanOn((value) => !value)} className="text-xs text-accent">
                {planOn ? "Hide hypothetical plan" : "Hypothetical plan"}
              </button>
              {planOn && (
                <div className="space-y-1 text-xs">
                  <label className="block">
                    Stop
                    <input value={stopText} onChange={(event) => setStopText(event.target.value)} inputMode="decimal" className="mt-1 w-full bg-panel2 border border-line rounded px-2 py-1" />
                  </label>
                  <label className="block">
                    Target
                    <input value={targetText} onChange={(event) => setTargetText(event.target.value)} inputMode="decimal" className="mt-1 w-full bg-panel2 border border-line rounded px-2 py-1" />
                  </label>
                  <p>{plan ? `Hypothetical R/R ${plan.ratio.toFixed(2)} from close ${money(plan.reference)}. ${plan.note}` : "Enter a stop and a target. Nothing is filled in for you."}</p>
                </div>
              )}
            </article>
          </div>
        </section>

        <aside className="panel p-3 space-y-3 text-xs leading-5" data-testid="technical-summary">
          <h2 className="text-sm font-semibold">Technical Analysis Summary</h2>
          <SummaryBlock title="A. Current market structure" lines={analysis?.summary.structure ?? ["Insufficient data"]} />
          <SummaryBlock title="B. Important price levels" lines={analysis?.summary.levels ?? ["Insufficient data"]} />
          <SummaryBlock title="C. Bullish scenario" lines={[analysis?.summary.bullish ?? "Insufficient data"]} />
          <SummaryBlock title="D. Neutral scenario" lines={[analysis?.summary.neutral ?? "Insufficient data"]} />
          <SummaryBlock title="E. Bearish scenario" lines={[analysis?.summary.bearish ?? "Insufficient data"]} />
          <SummaryBlock title="F. Invalidation conditions" lines={analysis?.summary.invalidation ?? ["Insufficient data"]} />
          <div className="border-t border-line pt-2 text-[10px] text-slate-500 space-y-1" data-testid="chart-limitations">
            <div>Data status: {barsQuery.data?.dataStatus || quote?.freshness.data_status || "—"} · Source: {barsQuery.data?.source || "—"} · Calculated: {barsQuery.isFetching ? "Updating" : analysis ? "Complete" : "Waiting"}</div>
            {(analysis?.limitations ?? []).map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>Missing intervals in this window: {analysis?.missingIntervals ?? "—"}.</p>
            <p>Technical indicators can lag and can produce false signals. This panel is educational and uses only levels calculated from the loaded candles.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Toggle({ pressed, onClick, label }: { pressed: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`rounded border px-2 py-1 text-xs ${pressed ? "border-accent/60 text-white" : "border-line text-slate-500"}`}>
      {label} {pressed ? "on" : "off"}
    </button>
  );
}

function SymbolFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function SummaryBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section>
      <h3 className="text-[11px] tracking-[0.12em] text-slate-500">{title}</h3>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </section>
  );
}

function FibControls({
  analysisAnchors,
  fib,
  onChange,
  onLatest,
}: {
  analysisAnchors: { time: number; price: number; kind: "high" | "low" }[];
  fib: { direction: string; high: { time: number; price: number }; low: { time: number; price: number }; note: string } | null;
  onChange: (anchors: { highTime: number; lowTime: number }) => void;
  onLatest: () => void;
}) {
  const highs = analysisAnchors.filter((point) => point.kind === "high");
  const lows = analysisAnchors.filter((point) => point.kind === "low");
  if (!fib) return <p>Fibonacci: Insufficient data</p>;
  return (
    <div className="space-y-1">
      <p title={fib.note}>
        Fibonacci {fib.direction} swing: low {money(fib.low.price)} to high {money(fib.high.price)}. Retracement only.
      </p>
      <label className="block text-[10px] text-slate-500">
        Swing high anchor
        <select
          aria-label="Fibonacci swing high"
          value={fib.high.time}
          onChange={(event) => onChange({ highTime: Number(event.target.value), lowTime: fib.low.time })}
          className="mt-1 w-full bg-panel2 border border-line rounded px-1 py-1 text-xs"
        >
          {highs.map((point) => (
            <option key={point.time} value={point.time}>
              {money(point.price)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[10px] text-slate-500">
        Swing low anchor
        <select
          aria-label="Fibonacci swing low"
          value={fib.low.time}
          onChange={(event) => onChange({ highTime: fib.high.time, lowTime: Number(event.target.value) })}
          className="mt-1 w-full bg-panel2 border border-line rounded px-1 py-1 text-xs"
        >
          {lows.map((point) => (
            <option key={point.time} value={point.time}>
              {money(point.price)}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onLatest} className="text-[11px] text-accent">
        Use latest confirmed swings
      </button>
    </div>
  );
}

function freshnessLine(quote: Quote | undefined, barStatus: string | undefined, timeframe: string, provisional: boolean) {
  const status = quote?.freshness.data_status || barStatus || "UNAVAILABLE";
  const when = quote?.freshness.timestamp ? new Date(quote.freshness.timestamp).toLocaleString() : "timestamp unavailable";
  const state = quote?.market_state || "market status unavailable";
  const candle = provisional ? "Latest chart candle is still forming." : "Latest chart candle is completed.";
  return `${timeframe.toUpperCase()} · ${status} · ${state} · ${when}. ${candle} Delayed or end-of-day data is not labeled real-time.`;
}

function instrumentLabel(symbol: string, name: string, leverage: ReturnType<typeof leverageProfile>) {
  if (leverage?.inverse && leverage.leveraged) return "Leveraged inverse ETF";
  if (leverage?.inverse) return "Inverse ETF";
  if (leverage?.leveraged) return "Leveraged ETF";
  if (symbol.endsWith("-USD")) return "Cryptocurrency";
  if (symbol.startsWith("^")) return "Index";
  if (/etf|trust|fund/i.test(name)) return "ETF";
  if (name && name.toUpperCase() !== symbol.toUpperCase()) return "Equity";
  return "Instrument";
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
