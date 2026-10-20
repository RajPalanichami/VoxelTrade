"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { pct, usd } from "@/lib/format";
import {
  BREAKOUT_LIFECYCLE_TIMEFRAMES,
  BREAKOUT_SCAN_TIMEFRAMES,
  DEFAULT_BREAKOUT_SETTINGS,
  DEFAULT_BREAKOUT_UNIVERSE,
  mergeBreakoutSettings,
  parseBreakoutTickers,
  phaseLabel,
  stateLabel,
  type BreakoutLifecycleTimeframe,
  type BreakoutScanTimeframe,
  type BreakoutSettings,
  type BreakoutState,
  type BreakoutUniverseSource,
} from "@/lib/breakoutPotential";
import { SECTORS } from "@/src/data/sectors";
import type { BreakoutRow } from "@/src/engines/breakoutPotential";
import { BreakoutChart } from "./BreakoutChart";

const STATE_STYLE: Record<BreakoutState, string> = {
  STRONG_DOWNTREND: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  DOWNTREND_WEAKENING: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  SELLING_EXHAUSTION: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  BASE_FORMING: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  ACCUMULATION_POTENTIAL: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  EARLY_DEMAND_RETURN: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  PRE_BREAKOUT: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  BREAKOUT_ATTEMPT: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  BREAKOUT_CONFIRMED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  POST_BREAKOUT_CONTINUATION: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  BREAKOUT_FAILED: "bg-red-500/15 text-red-300 border-red-500/30",
  EXHAUSTION_AFTER_BREAKOUT: "bg-yellow-500/15 text-yellow-200 border-yellow-500/30",
  INSUFFICIENT_DATA: "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

const SOURCES: { id: BreakoutUniverseSource; label: string }[] = [
  { id: "default", label: "Default Universe" },
  { id: "search", label: "Search Ticker" },
  { id: "sector", label: "Sector" },
  { id: "etf", label: "ETF Universe" },
  { id: "watchlist", label: "Watchlist" },
  { id: "custom", label: "Custom List" },
];

function scoreColor(score: number | null) {
  if (score == null) return "bg-slate-700";
  if (score >= 75) return "bg-emerald-400";
  if (score >= 60) return "bg-sky-400";
  if (score >= 40) return "bg-amber-400";
  return "bg-slate-500";
}

export function BreakoutPotentialScanner() {
  const [source, setSource] = useState<BreakoutUniverseSource>("default");
  const [timeframe, setTimeframe] = useState<BreakoutScanTimeframe>("1d");
  const [lifecycle, setLifecycle] = useState<BreakoutLifecycleTimeframe>("1d");
  const [sector, setSector] = useState("semiconductors");
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState(DEFAULT_BREAKOUT_UNIVERSE.join(", "));
  const [selected, setSelected] = useState<string>(DEFAULT_BREAKOUT_UNIVERSE[0]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [settings, setSettings] = useState<BreakoutSettings>(DEFAULT_BREAKOUT_SETTINGS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const tickers = useMemo(() => {
    if (source === "search") return parseBreakoutTickers(search).tickers;
    if (source === "custom") return parseBreakoutTickers(custom).tickers;
    return undefined;
  }, [source, search, custom]);

  const universes = useQuery({
    queryKey: keys.breakoutUniverses,
    queryFn: () => api.breakoutUniverses(),
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: keys.breakoutPotential(source, tickers || [sector], timeframe, lifecycle, selected),
    queryFn: () =>
      api.breakoutPotential({
        source,
        tickers,
        sector: source === "sector" ? sector : undefined,
        timeframe,
        lifecycleTimeframe: lifecycle,
        settings,
        selected,
      }),
    enabled: mounted && !((source === "search" || source === "custom") && !tickers?.length),
    staleTime: 30_000,
  });

  const payload = query.data?.data;
  const rows = payload?.rows || [];
  const detail = payload?.selected || null;

  return (
    <div className="p-4 space-y-3 pb-16" data-testid="breakout-potential">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Breakout Potential</h1>
          <div className="text-sm text-slate-400 mt-0.5">Early Demand & Momentum Transition</div>
          <p className="text-xs text-slate-500 mt-2 max-w-3xl">
            Scan any supported ticker for the first important change from weakness or consolidation into potential bullish momentum.
            This is setup-state evidence, not a prediction or buy signal.
          </p>
        </div>
        <button
          className="px-3 py-1.5 rounded bg-accent/20 text-accent border border-accent/40 text-sm"
          onClick={() => query.refetch()}
        >
          Scan Now
        </button>
      </header>

      <div className="panel p-3 flex flex-wrap gap-2 items-end">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={`px-2.5 py-1 rounded text-xs border ${source === s.id ? "bg-accent/15 text-white border-accent/40" : "border-line text-slate-400"}`}
          >
            {s.label}
          </button>
        ))}
        <label className="text-xs text-slate-400">
          Timeframe
          <select className="ml-2 bg-panel2 border border-line/50 rounded px-2 py-1" value={timeframe} onChange={(e) => setTimeframe(e.target.value as BreakoutScanTimeframe)}>
            {BREAKOUT_SCAN_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Lifecycle
          <select className="ml-2 bg-panel2 border border-line/50 rounded px-2 py-1" value={lifecycle} onChange={(e) => setLifecycle(e.target.value as BreakoutLifecycleTimeframe)}>
            {BREAKOUT_LIFECYCLE_TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
        </label>
        {source === "sector" && (
          <select className="bg-panel2 border border-line/50 rounded px-2 py-1 text-xs" value={sector} onChange={(e) => setSector(e.target.value)}>
            {Object.values(SECTORS).map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        )}
        {source === "search" && (
          <input className="bg-panel2 border border-line/50 rounded px-2 py-1 text-xs w-40" placeholder="Any ticker" value={search} onChange={(e) => { setSearch(e.target.value.toUpperCase()); const p = parseBreakoutTickers(e.target.value); if (p.tickers[0]) setSelected(p.tickers[0]); }} />
        )}
        <label className="text-xs text-slate-400">
          Min score
          <input type="number" className="ml-2 w-16 bg-panel2 border border-line/50 rounded px-2 py-1" value={settings.minScore} onChange={(e) => setSettings(mergeBreakoutSettings({ ...settings, minScore: Number(e.target.value) }))} />
        </label>
      </div>

      {source === "custom" && (
        <textarea className="w-full bg-panel2 border border-line/50 rounded px-3 py-2 text-xs" rows={2} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Paste any tickers" />
      )}

      {query.isError && <div className="panel p-3 text-bear text-sm">{(query.error as Error).message}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-3">
        <section className="panel overflow-auto">
          <table className="w-full text-xs" data-testid="breakout-table">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Ticker</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">State</th>
                <th className="text-left p-2">Breakout Potential</th>
                <th className="text-left p-2">Key Signal</th>
                <th className="text-left p-2">TF</th>
                <th className="text-left p-2">Price</th>
                <th className="text-left p-2">Change</th>
                <th className="text-left p-2"></th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr><td colSpan={10} className="p-8 text-center text-slate-500">Scanning selling pressure, structure, volume and resistance…</td></tr>
              )}
              {rows.map((row, i) => (
                <tr
                  key={row.symbol}
                  className={`border-t border-line/40 cursor-pointer ${selected === row.symbol ? "bg-white/5" : "hover:bg-white/5"}`}
                  onClick={() => setSelected(row.symbol)}
                >
                  <td className="p-2 text-slate-500">{i + 1}</td>
                  <td className="p-2 font-semibold">{row.symbol}</td>
                  <td className="p-2 text-slate-400">{row.name}</td>
                  <td className="p-2"><StateBadge state={row.state} /></td>
                  <td className="p-2 min-w-[140px]"><ScoreBar score={row.score} /></td>
                  <td className="p-2 text-slate-300">{row.keySignal}</td>
                  <td className="p-2">{timeframe}</td>
                  <td className="p-2">{usd(row.price)}</td>
                  <td className={`p-2 ${ (row.changePct || 0) >= 0 ? "text-bull" : "text-bear"}`}>{pct(row.changePct)}</td>
                  <td className="p-2"><span className="text-accent">View</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <DetailPanel
          row={rows.find((r) => r.symbol === selected) || rows[0] || null}
          detail={detail}
          timeframe={timeframe}
          lifecycle={lifecycle}
          highlight={highlight}
          onHighlight={setHighlight}
          loading={query.isFetching}
        />
      </div>
      <p className="text-[11px] text-slate-600">Default universe is a starting list only. Search, sectors, ETFs, watchlist and custom tickers all use the same ticker-independent engine.</p>
      {universes.data?.data?.etf ? null : null}
    </div>
  );
}

function StateBadge({ state }: { state: BreakoutState }) {
  return <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${STATE_STYLE[state]}`}>{stateLabel(state)}</span>;
}

function ScoreBar({ score }: { score: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
        <div className={`h-full ${scoreColor(score)}`} style={{ width: `${score ?? 0}%` }} />
      </div>
      <span className="tabular-nums w-8">{score ?? "—"}</span>
    </div>
  );
}

function DetailPanel({
  row,
  detail,
  timeframe,
  lifecycle,
  highlight,
  onHighlight,
  loading,
}: {
  row: BreakoutRow | null;
  detail: import("@/src/engines/breakoutPotential").BreakoutDetail | null;
  timeframe: string;
  lifecycle: string;
  highlight: string | null;
  onHighlight: (v: string | null) => void;
  loading: boolean;
}) {
  if (!row) {
    return <aside className="panel p-8 text-slate-500 text-sm">{loading ? "Loading selected ticker…" : "Select a ticker."}</aside>;
  }
  const view = detail && detail.symbol === row.symbol ? detail : null;
  return (
    <aside className="space-y-3" data-testid="breakout-detail">
      <section className="panel p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">{row.symbol}</div>
            <div className="text-xs text-slate-400">{row.name}</div>
          </div>
          <div className="text-right">
            <div className="text-lg">{usd(row.price)}</div>
            <div className={`text-xs ${(row.changePct || 0) >= 0 ? "text-bull" : "text-bear"}`}>{pct(row.changePct)}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <StateBadge state={row.state} />
          <span className="text-xs text-slate-400">Breakout Potential {row.score ?? "—"} / 100 · {row.band.replaceAll("_", " ")}</span>
        </div>
        <div className="mt-3">
          <BreakoutChart
            bars={view?.chart || []}
            overlays={view?.overlays || { ema20: null, ema50: null, ema200: null, support: null, resistance: row.resistance, high20: null, high50: null, swingHigh: null, swingLow: null }}
            highlightTime={highlight}
          />
        </div>
      </section>

      <section className="panel p-3 text-xs space-y-1">
        <div className="text-[11px] tracking-[0.16em] text-slate-500">BREAKOUT POTENTIAL ANALYSIS</div>
        <div>Scan TF: {timeframe} · Lifecycle TF: {lifecycle} (lifecycle never overrides the selected scan timeframe)</div>
        <div>Key signal: {row.keySignal}</div>
        <div>Structure: {row.structure} · Momentum: {row.momentum}</div>
        <div>Volume: {row.volume} · Compression: {row.compression}</div>
        <div>Resistance: {usd(row.resistance)} {row.resistanceSource ? `· ${row.resistanceSource}` : ""} · Distance {row.distanceToResistancePct != null ? `${row.distanceToResistancePct.toFixed(2)}%` : "—"}</div>
        <div>Alignment: {row.timeframeAlignment != null ? `${row.timeframeAlignment}%` : "—"} · {row.alignmentNote}</div>
      </section>

      {view && (
        <>
          <section className="panel p-3 text-sm space-y-2">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">WHAT CHANGED?</div>
            <p className="text-slate-300">{view.whatChanged}</p>
            <div className="text-[11px] tracking-[0.16em] text-slate-500 mt-2">EARLY SIGNALS</div>
            <ul className="space-y-1 text-xs">
              {view.earlySignals.length ? view.earlySignals.map((s) => <li key={s}>✓ {s}</li>) : <li className="text-slate-500">No early-demand cluster yet.</li>}
            </ul>
            <div className="text-[11px] tracking-[0.16em] text-slate-500 mt-2">CONFIRMATION REQUIRED</div>
            <ul className="space-y-1 text-xs text-slate-400">{view.confirmationRequired.map((s) => <li key={s}>□ {s}</li>)}</ul>
            <div className="text-[11px] tracking-[0.16em] text-slate-500 mt-2">INVALIDATION</div>
            <ul className="space-y-1 text-xs text-warn">{view.invalidation.map((s) => <li key={s}>✕ {s}</li>)}</ul>
            <p className="text-xs text-slate-400">Next trigger: {view.nextTrigger}</p>
          </section>

          <section className="panel p-3 text-xs">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">SCORE COMPONENTS</div>
            <ul className="mt-2 space-y-1">
              {view.scoreFactors.map((f) => <li key={f.name}>{f.name} +{f.score}/{f.max} · {f.note}</li>)}
            </ul>
          </section>

          <section className="panel p-3 text-xs space-y-1">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">SELLOFF → RECOVERY · {view.lifecycle.timeframe}</div>
            <div>Current phase: {phaseLabel(view.lifecycle.current)} · Confidence {view.lifecycle.confidence}</div>
            {view.lifecycle.selloff && (
              <div>
                Selloff {view.lifecycle.selloff.severity}: {view.lifecycle.selloff.declinePct.toFixed(1)}% / {view.lifecycle.selloff.atrDecline?.toFixed(2) ?? "n/a"} ATR
              </div>
            )}
            <div>Exhaustion: {view.lifecycle.exhaustion.flag}</div>
            <div>Stabilization: {view.lifecycle.stabilization.flag}</div>
            <div>First higher low: {view.lifecycle.firstHigherLow.found ? usd(view.lifecycle.firstHigherLow.price) : "not yet"}</div>
            <div>Primary support: {usd(view.lifecycle.primarySupport)} · Secondary: {usd(view.lifecycle.secondarySupport)}</div>
            <div>Pullback: {view.lifecycle.pullback}</div>
            {view.lifecycle.battle.detected && (
              <div>High-volume battle at {usd(view.lifecycle.battle.level)} · RVOL {view.lifecycle.battle.rvol?.toFixed(2)} · Winner {view.lifecycle.battle.winner}</div>
            )}
            <ul className="mt-2 space-y-1">{view.lifecycle.evidence.map((e) => <li key={e}>✓ {e}</li>)}</ul>
          </section>

          <section className="panel p-3">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">BULLISH SIGNAL TIMELINE</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {view.lifecycle.events.map((ev, i) => (
                <button
                  key={`${ev.phase}-${ev.index}-${i}`}
                  className={`text-[10px] px-2 py-1 rounded border ${highlight === ev.time ? "border-accent text-white" : "border-line text-slate-400"}`}
                  onClick={() => onHighlight(ev.time)}
                >
                  {new Date(ev.time).toLocaleDateString()} {phaseLabel(ev.phase)}
                </button>
              ))}
              {!view.lifecycle.events.length && <div className="text-xs text-slate-500">No lifecycle events on this timeframe.</div>}
            </div>
            {highlight && view.lifecycle.events.filter((e) => e.time === highlight).map((ev) => (
              <div key={ev.phase} className="mt-2 text-xs text-slate-300">
                {phaseLabel(ev.phase)} @ {usd(ev.price)} · RVOL {ev.rvol?.toFixed(2) ?? "n/a"} · RSI {ev.rsi?.toFixed(1) ?? "n/a"}
                <ul className="mt-1">{ev.evidence.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            ))}
          </section>

          <section className="panel p-3 text-xs">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">CANDLE SEQUENCE</div>
            <ul className="mt-2 space-y-1">
              {view.candleSequence.map((c) => (
                <li key={c.time} className={c.highlight ? "text-accent" : "text-slate-400"}>{c.label}</li>
              ))}
            </ul>
          </section>

          <section className="panel p-3 text-xs">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">MULTI-TIMEFRAME</div>
            <table className="w-full mt-2">
              <thead><tr className="text-slate-500"><th className="text-left">TF</th><th className="text-left">State</th><th className="text-left">Phase</th><th className="text-left">Structure</th></tr></thead>
              <tbody>
                {view.mtf.map((t) => (
                  <tr key={t.timeframe}><td>{t.timeframe}</td><td>{stateLabel(t.state)}</td><td>{phaseLabel(t.phase)}</td><td>{t.structure}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel p-3 text-xs space-y-1">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">HISTORICAL ANALOG ANALYSIS</div>
            {view.analogs.sample === "INSUFFICIENT_SAMPLE" ? (
              <div>INSUFFICIENT_SAMPLE — not enough point-in-time matches.</div>
            ) : (
              <>
                <div>Sample: {view.analogs.sample} events</div>
                <div>1D median: {view.analogs.median1?.toFixed(2)}% · 3D: {view.analogs.median3?.toFixed(2)}% · 5D: {view.analogs.median5?.toFixed(2)}%</div>
                <div>MFE: {view.analogs.mfe?.toFixed(2)}% · MAE: {view.analogs.mae?.toFixed(2)}%</div>
                <div className="text-slate-500">Outcomes only. This is not a prediction.</div>
              </>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
