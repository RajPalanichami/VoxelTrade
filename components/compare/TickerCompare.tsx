"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { TickerSearch } from "@/components/search/TickerSearch";
import {
  COMPARE_PERIODS,
  COMPARE_TF_LABELS,
  COMPARE_TIMEFRAMES,
  parseCompareTicker,
  type ComparePayload,
  type ComparePeriod,
  type CompareTimeframe,
} from "@/lib/compare";
import { CompareChart } from "./CompareChart";

function tone(signal: string) {
  if (signal.includes("BULLISH")) return "text-bull";
  if (signal.includes("BEARISH")) return "text-bear";
  if (signal === "OVEREXTENDED") return "text-warn";
  return "text-slate-300";
}

export function TickerCompare() {
  const { symbol } = useTerminal();
  const [t1, setT1] = useState(() => symbol || "");
  const [t2, setT2] = useState("");
  const t1Ref = useRef(t1);
  const t2Ref = useRef(t2);
  t1Ref.current = t1;
  t2Ref.current = t2;
  const [timeframe, setTimeframe] = useState<CompareTimeframe>("1d");
  const [period, setPeriod] = useState<ComparePeriod>("1Y");
  const [mode, setMode] = useState<"absolute" | "normalized" | "percent">("normalized");
  const [overlays, setOverlays] = useState({ ema20: true, ema50: true, ema200: false, volume: false, rsi: false, macd: false });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sig, setSig] = useState("All");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [onlyDir, setOnlyDir] = useState(false);
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [showInsuff, setShowInsuff] = useState(true);
  const [sort, setSort] = useState<"category" | "name" | "t1" | "t2" | "confidence" | "signal">("category");
  const [openId, setOpenId] = useState<string | null>(null);
  const [distFilter, setDistFilter] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: (vars: { ticker1: string; ticker2: string; tf?: CompareTimeframe; period?: ComparePeriod }) =>
      api.compare(vars.ticker1, vars.ticker2, vars.tf || timeframe, vars.period || period),
  });
  const raw = run.data?.data as ComparePayload | undefined;
  const data =
    raw &&
    raw.ticker1.symbol === t1.trim().toUpperCase() &&
    raw.ticker2.symbol === t2.trim().toUpperCase()
      ? raw
      : undefined;

  function analyze(next?: { ticker1?: string; ticker2?: string; tf?: CompareTimeframe; period?: ComparePeriod; autorun?: boolean }) {
    const a = parseCompareTicker(next?.ticker1 ?? t1Ref.current, "Ticker 1");
    const b = parseCompareTicker(next?.ticker2 ?? t2Ref.current, "Ticker 2");
    if ("error" in a) {
      setLocalError(a.error);
      return;
    }
    if ("error" in b) {
      setLocalError(b.error);
      return;
    }
    if (a.symbol === b.symbol) {
      setLocalError("Ticker 1 and Ticker 2 must be different symbols.");
      return;
    }
    setLocalError(null);
    run.mutate({ ticker1: a.symbol, ticker2: b.symbol, tf: next?.tf, period: next?.period });
  }

  const rows = useMemo(() => {
    if (!data) return [];
    return data.indicators
      .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.category.toLowerCase().includes(q.toLowerCase()))
      .filter((r) => cat === "All" || r.category === cat)
      .filter((r) => {
        if (sig === "All") return true;
        if (sig === "Bullish") return r.t1.signal.includes("BULLISH") || r.t2.signal.includes("BULLISH");
        if (sig === "Bearish") return r.t1.signal.includes("BEARISH") || r.t2.signal.includes("BEARISH");
        return r.t1.signal === sig || r.t2.signal === sig;
      })
      .filter((r) => !onlyDiff || r.t1.signal !== r.t2.signal)
      .filter((r) => !onlyDir || [r.t1, r.t2].some((c) => c.signal.includes("BULLISH") || c.signal.includes("BEARISH")))
      .filter((r) => !onlyHigh || ((r.t1.confidence || 0) >= 80 && (r.t2.confidence || 0) >= 80))
      .filter((r) => showInsuff || (r.t1.signal !== "INSUFFICIENT DATA" && r.t2.signal !== "INSUFFICIENT DATA"))
      .filter((r) => {
        if (!distFilter) return true;
        const hit = (s: string) =>
          (distFilter === "Bullish" && s.includes("BULLISH")) ||
          (distFilter === "Bearish" && s.includes("BEARISH")) ||
          s === distFilter ||
          (distFilter === "Insufficient Data" && s === "INSUFFICIENT DATA");
        return hit(r.t1.signal) || hit(r.t2.signal);
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "t1") return String(a.t1.display).localeCompare(String(b.t1.display));
        if (sort === "t2") return String(a.t2.display).localeCompare(String(b.t2.display));
        if (sort === "confidence") return (b.t1.confidence || 0) - (a.t1.confidence || 0);
        if (sort === "signal") return a.t1.signal.localeCompare(b.t1.signal) || a.name.localeCompare(b.name);
        return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      });
  }, [data, q, cat, sig, onlyDiff, onlyDir, onlyHigh, showInsuff, sort, distFilter]);

  const categories = ["All", "Trend", "Momentum", "Volume", "Volatility", "Structure", "Support/Resistance", "Patterns", "Relative Strength"];

  return (
    <div className="w-full p-3 sm:p-4 space-y-4 pb-12" data-testid="ticker-compare">
      <div className="panel p-4 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Ticker Comparison</h1>
        <p className="text-sm text-slate-400">
          Analyze two symbols independently, then compare documented technical parameters. This is an analytical snapshot,
          not a prediction of future prices.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_140px_140px_auto] gap-3 items-end">
          <label className="text-xs text-slate-500">
            Ticker 1
            <div className="mt-1">
              <TickerSearch
                value={t1}
                label="Ticker 1"
                placeholder="First ticker"
                commitOnBlur
                onInputChange={setT1}
                onSelect={(s) => {
                  setT1(s);
                  if ("symbol" in parseCompareTicker(t2Ref.current) && "symbol" in parseCompareTicker(s)) {
                    analyze({ ticker1: s });
                  }
                }}
              />
            </div>
          </label>
          <label className="text-xs text-slate-500">
            Ticker 2
            <div className="mt-1">
              <TickerSearch
                value={t2}
                label="Ticker 2"
                placeholder="Second ticker"
                commitOnBlur
                onInputChange={setT2}
                onSelect={(s) => {
                  setT2(s);
                  if ("symbol" in parseCompareTicker(t1Ref.current) && "symbol" in parseCompareTicker(s)) {
                    analyze({ ticker2: s });
                  }
                }}
              />
            </div>
          </label>
          <label className="text-xs text-slate-500">
            Timeframe
            <select
              aria-label="Timeframe"
              className="block mt-1 w-full bg-panel2 border border-line rounded px-2 py-2 text-sm text-white"
              value={timeframe}
              onChange={(e) => {
                const next = e.target.value as CompareTimeframe;
                setTimeframe(next);
                if (raw) analyze({ tf: next });
              }}
            >
              {COMPARE_TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {COMPARE_TF_LABELS[tf]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Period
            <select
              aria-label="Period"
              className="block mt-1 w-full bg-panel2 border border-line rounded px-2 py-2 text-sm text-white"
              value={period}
              onChange={(e) => {
                const p = e.target.value as ComparePeriod;
                setPeriod(p);
                if (raw) analyze({ period: p });
              }}
            >
              {COMPARE_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => analyze()}
            className="px-4 py-2 rounded-md bg-accent/20 border border-accent/50 text-white text-sm"
          >
            ANALYZE
          </button>
        </div>
        {data && (
          <div className="text-xs text-slate-500">
            Data Updated: {data.as_of_et} ET · {data.timezone}
          </div>
        )}
      </div>

      {run.isPending && (
        <div className="panel p-6 text-slate-400" data-testid="compare-loading">
          Analyzing {t1} and {t2}… fetching market data, then calculating trend, momentum, volume, and comparison scores.
        </div>
      )}
      {localError && <div className="panel p-4 text-bear text-sm">{localError}</div>}
      {run.error && <div className="panel p-4 text-bear text-sm">{(run.error as Error).message}</div>}
      {raw && !data && !run.isPending && (
        <div className="panel p-3 text-sm text-slate-400">
          Tickers changed. Click ANALYZE to compare {t1 || "Ticker 1"} and {t2 || "Ticker 2"}. Previous results are hidden so
          they cannot mix with a different pair.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SummaryCard card={data.ticker1} />
            <SummaryCard card={data.ticker2} />
          </div>

          <div className="panel p-4">
            <div className="text-[10px] tracking-widest text-slate-500 mb-2">CATEGORY SCORE COMPARISON</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr>
                    <th className="text-left py-1">Category</th>
                    <th className="text-right">{data.ticker1.symbol}</th>
                    <th className="text-right">{data.ticker2.symbol}</th>
                    <th className="text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ticker1.scoreBreakdown.map((row) => (
                    <tr key={row.category} className="border-t border-line">
                      <td className="py-1.5">{row.category}</td>
                      <td className="text-right tick">{row.score ?? "N/A"}</td>
                      <td className="text-right tick">{data.ticker2.scoreBreakdown.find((x) => x.category === row.category)?.score ?? "N/A"}</td>
                      <td className="text-right text-slate-500">{(row.weight * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">{data.weightsNote}</p>
          </div>

          <div className="panel p-4 overflow-x-auto">
            <div className="text-[10px] tracking-widest text-slate-500 mb-2">MULTI-TIMEFRAME TREND</div>
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-xs">
                <tr>
                  <th className="text-left py-1">Timeframe</th>
                  <th>{data.ticker1.symbol}</th>
                  <th>{data.ticker2.symbol}</th>
                </tr>
              </thead>
              <tbody>
                {data.multiTimeframe.map((r) => (
                  <tr key={r.tf} className="border-t border-line">
                    <td className="py-1.5">{COMPARE_TF_LABELS[r.tf]}</td>
                    <td className={tone(r.t1)}>{r.t1}</td>
                    <td className={tone(r.t2)}>{r.t2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-slate-400 mt-2">
              {data.alignment.t1} · {data.alignment.t2} (bullish timeframes / timeframes with data)
            </div>
          </div>

          <div className="panel p-4">
            <div className="flex flex-wrap gap-3 items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest text-slate-500">NORMALIZED PERFORMANCE CHART</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["absolute", "normalized", "percent"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-1">
                    <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                    {m === "absolute" ? "Absolute Price" : m === "normalized" ? "Normalized Performance" : "Percentage Return"}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-2">
              {(["ema20", "ema50", "ema200", "volume", "rsi", "macd"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1">
                  <input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays((p) => ({ ...p, [k]: e.target.checked }))} />
                  {k.toUpperCase()}
                </label>
              ))}
            </div>
            <CompareChart data={data} mode={mode} overlays={overlays} />
            {overlays.rsi && (
              <p className="text-xs text-slate-500 mt-2">
                RSI(14) last: {data.ticker1.symbol} {data.indicators.find((i) => i.id === "rsi14")?.t1.display} · {data.ticker2.symbol}{" "}
                {data.indicators.find((i) => i.id === "rsi14")?.t2.display}
              </p>
            )}
            {overlays.macd && (
              <p className="text-xs text-slate-500">
                MACD last: {data.ticker1.symbol} {data.indicators.find((i) => i.id === "macd")?.t1.display} · {data.ticker2.symbol}{" "}
                {data.indicators.find((i) => i.id === "macd")?.t2.display}
              </p>
            )}
            {overlays.volume && (
              <p className="text-xs text-slate-500">
                Volume last: {data.ticker1.symbol} {data.indicators.find((i) => i.id === "volume")?.t1.display} · {data.ticker2.symbol}{" "}
                {data.indicators.find((i) => i.id === "volume")?.t2.display}
              </p>
            )}
          </div>

          <div className="panel overflow-hidden">
            <div className="px-4 py-2 text-[10px] tracking-widest text-slate-500">RELATIVE PERFORMANCE</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2">Metric</th>
                    <th className="text-right px-4 py-2">{data.ticker1.symbol}</th>
                    <th className="text-right px-4 py-2">{data.ticker2.symbol}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.relative.map((r) => (
                    <tr key={r.label} className="border-t border-line">
                      <td className="px-4 py-1.5">{r.label}</td>
                      <td className="px-4 py-1.5 text-right tick">{r.t1}</td>
                      <td className="px-4 py-1.5 text-right tick">{r.t2}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Distribution title={data.ticker1.symbol} dist={data.ticker1.distribution} onPick={setDistFilter} />
            <Distribution title={data.ticker2.symbol} dist={data.ticker2.distribution} onPick={setDistFilter} />
          </div>

          <div className="panel p-4 space-y-3">
            <div className="text-[10px] tracking-widest text-slate-500">INDICATOR COMPARISON</div>
            <div className="flex flex-wrap gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search indicators..."
                aria-label="Search indicators"
                className="bg-panel2 border border-line rounded px-2 py-1.5 text-sm text-white min-w-[180px]"
              />
              <select aria-label="Category filter" value={cat} onChange={(e) => setCat(e.target.value)} className="bg-panel2 border border-line rounded px-2 py-1.5 text-sm text-white">
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select aria-label="Signal filter" value={sig} onChange={(e) => setSig(e.target.value)} className="bg-panel2 border border-line rounded px-2 py-1.5 text-sm text-white">
                {["All", "Bullish", "Bearish", "NEUTRAL", "MIXED", "OVEREXTENDED", "INSUFFICIENT DATA"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select aria-label="Sort indicators" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="bg-panel2 border border-line rounded px-2 py-1.5 text-sm text-white">
                <option value="category">Sort: category</option>
                <option value="name">Sort: indicator</option>
                <option value="t1">Sort: ticker 1</option>
                <option value="t2">Sort: ticker 2</option>
                <option value="confidence">Sort: confidence</option>
                <option value="signal">Sort: signal</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <label><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Show only differences</label>
              <label><input type="checkbox" checked={onlyDir} onChange={(e) => setOnlyDir(e.target.checked)} /> Show only bullish/bearish signals</label>
              <label><input type="checkbox" checked={onlyHigh} onChange={(e) => setOnlyHigh(e.target.checked)} /> Show only high confidence</label>
              <label><input type="checkbox" checked={showInsuff} onChange={(e) => setShowInsuff(e.target.checked)} /> Show insufficient-data indicators</label>
            </div>
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-slate-500 text-xs sticky top-0 bg-panel">
                  <tr>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-left px-3 py-2">Indicator</th>
                    <th className="text-right px-3 py-2">{data.ticker1.symbol}</th>
                    <th className="text-right px-3 py-2">Signal</th>
                    <th className="text-right px-3 py-2">{data.ticker2.symbol}</th>
                    <th className="text-right px-3 py-2">Signal</th>
                    <th className="text-right px-3 py-2">Relative</th>
                    <th className="text-right px-3 py-2">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        className="border-t border-line cursor-pointer hover:bg-white/5"
                        tabIndex={0}
                        aria-expanded={openId === r.id}
                        onClick={() => setOpenId(openId === r.id ? null : r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenId(openId === r.id ? null : r.id);
                          }
                        }}
                      >
                        <td className="px-3 py-1.5 text-slate-400">{r.category}</td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5 text-right tick">{r.t1.display}</td>
                        <td className={`px-3 py-1.5 text-right text-xs ${tone(r.t1.signal)}`}>{r.t1.signal}</td>
                        <td className="px-3 py-1.5 text-right tick">{r.t2.display}</td>
                        <td className={`px-3 py-1.5 text-right text-xs ${tone(r.t2.signal)}`}>{r.t2.signal}</td>
                        <td className="px-3 py-1.5 text-right text-xs">{r.relative}</td>
                        <td className="px-3 py-1.5 text-right tick">{r.t1.confidence ?? "N/A"}</td>
                      </tr>
                      {openId === r.id && (
                        <tr key={`${r.id}-x`} className="bg-white/5">
                          <td colSpan={8} className="px-4 py-3 text-xs text-slate-300">
                            <div className="grid md:grid-cols-2 gap-3">
                              <Detail symbol={data.ticker1.symbol} row={r} side="t1" />
                              <Detail symbol={data.ticker2.symbol} row={r} side="t2" />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-slate-500">{rows.length} of {data.indicators.length} indicators shown.</div>
          </div>

          <div className="panel p-4" data-testid="compare-data-quality">
            <div className="text-[10px] tracking-widest text-slate-500 mb-2">DATA QUALITY</div>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <Quality label={data.ticker1.symbol} q={data.dataQuality.t1} />
              <Quality label={data.ticker2.symbol} q={data.dataQuality.t2} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ card }: { card: ComparePayload["ticker1"] }) {
  return (
    <div className="panel p-4" data-testid={`compare-card-${card.symbol}`}>
      <div className="text-xl font-semibold">{card.symbol}</div>
      <div className="text-xs text-slate-500">{card.name}</div>
      {card.error && <div className="text-bear mt-2">{card.error === "INVALID TICKER" ? "INVALID TICKER — enter a supported stock or ETF." : card.error}</div>}
      <div className={`text-2xl font-semibold mt-2 ${tone(card.signal)}`}>{card.signal}</div>
      <div className="text-sm mt-1">Score: {card.score == null ? "N/A" : `${card.score} / 100`}</div>
      <div className="text-sm">Confidence: {card.confidence == null ? "N/A" : `${card.confidence}%`}</div>
      <div className="grid grid-cols-2 gap-1 mt-3 text-sm">
        {Object.entries(card.categories).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-slate-500">{k}</span>
            <span className="tick">{v ?? "N/A"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Distribution({ title, dist, onPick }: { title: string; dist: Record<string, number>; onPick: (k: string | null) => void }) {
  return (
    <div className="panel p-4">
      <div className="text-[10px] tracking-widest text-slate-500 mb-2">SIGNAL DISTRIBUTION · {title}</div>
      {Object.entries(dist).map(([k, v]) => (
        <button key={k} type="button" className="w-full flex justify-between text-sm py-0.5 hover:text-white" onClick={() => onPick(k)}>
          <span className="text-slate-400">{k}</span>
          <span className="tick">{v}</span>
        </button>
      ))}
    </div>
  );
}

function Detail({
  symbol,
  row,
  side,
}: {
  symbol: string;
  row: ComparePayload["indicators"][number];
  side: "t1" | "t2";
}) {
  const cell = row[side];
  return (
    <div>
      <div className="font-semibold">{row.name} · {symbol}</div>
      <div>Value: {cell.display}</div>
      <div>Calculation: {row.calculation}</div>
      <div>Interpretation: {cell.interpretation}</div>
      <div>Signal: {cell.signal}</div>
      <div>Confidence: {cell.confidence == null ? "N/A" : `${cell.confidence}/100`}</div>
      <div>Data: {cell.validBars} valid candles (needs {row.requiredPeriods})</div>
    </div>
  );
}

function Quality({ label, q }: { label: string; q: ComparePayload["dataQuality"]["t1"] }) {
  return (
    <div>
      <div className="font-semibold">{label}</div>
      <div>Status: {q.status}</div>
      <div>Latest Data: {q.latest} ET</div>
      <div>Historical Candles: {q.candles.toLocaleString()}</div>
      <div>Missing Candles: {q.missing}</div>
    </div>
  );
}
