"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { compact, pct, usd } from "@/lib/format";
import { useTerminal } from "@/components/layout/AppShell";
import {
  STOCK_DECISION_TF_LABEL,
  STOCK_DECISION_TIMEFRAMES,
  isStockDecisionTimeframe,
  type StockDecisionLevel,
  type StockDecisionMap,
  type StockDecisionTimeframe,
} from "@/lib/stockDecision";
import { DecisionChart, type DecisionOverlays } from "./DecisionChart";
import { DecisionSummary } from "./DecisionSummary";

const ACTION_STYLE: Record<string, string> = {
  BUY_SETUP: "bg-bull/15 text-bull border-bull/40",
  WATCH: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  WAIT: "bg-warn/15 text-warn border-warn/40",
  NO_TRADE: "bg-bear/15 text-bear border-bear/40",
  INSUFFICIENT_DATA: "bg-slate-700/40 text-slate-300 border-line",
};

function sessionLabel(session: string | null) {
  const s = (session || "").toUpperCase();
  if (s === "REGULAR" || s === "OPEN") return "OPEN";
  if (s === "PRE_MARKET" || s === "PREMARKET") return "PRE-MARKET";
  if (s === "AFTER_HOURS" || s === "AFTER-HOURS") return "AFTER-HOURS";
  if (s === "CLOSED") return "CLOSED";
  return session || "—";
}

function freshnessLine(map: StockDecisionMap) {
  const status = (map.freshness.dataStatus || "UNAVAILABLE").toUpperCase();
  if (status === "LIVE") return `LIVE • ${map.freshness.ageLabel}`;
  if (status === "DELAYED") return `DELAYED • ${map.freshness.ageLabel}`;
  if (status === "STALE") return `STALE • ${map.freshness.ageLabel}`;
  return `${status} • ${map.freshness.ageLabel}`;
}

function ScoreBar({ value }: { value: number | null }) {
  if (value == null) return <div className="text-[11px] text-slate-500">unavailable</div>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded bg-panel2 overflow-hidden">
        <div className="h-full bg-accent/70" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="tick text-[11px] w-8 text-right">{Math.round(value)}</span>
    </div>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-12 rounded bg-panel2" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const w = 220;
  const h = 48;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - lo) / span) * (h - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={pts} />
    </svg>
  );
}

function LevelList({ title, levels }: { title: string; levels: StockDecisionLevel[] }) {
  return (
    <section className="panel p-3">
      <h3 className="text-[11px] tracking-[0.16em] text-slate-500 mb-2">{title}</h3>
      <div className="space-y-2">
        {levels.map((l) => (
          <div key={`${l.label}-${l.price}`} className="border-b border-line/20 last:border-0 pb-2">
            <div className="flex justify-between gap-2 text-[12px]">
              <span>
                {l.label} <span className="text-slate-500">· {l.strength}</span>
              </span>
              <span className="tick font-semibold">{l.price == null ? "unavailable" : usd(l.price)}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">{l.why}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Section({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <h2 className="text-[11px] tracking-[0.18em] text-slate-400">{title}</h2>
        <span className="text-slate-500 text-xs">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div id={id} className="px-3 pb-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function StockDecision() {
  const { symbol, setSymbol, autoRefresh } = useTerminal();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ symbol?: string }>();
  const [tf, setTf] = useState<StockDecisionTimeframe>("1d");
  const [view, setView] = useState<"BEGINNER" | "PRO">("BEGINNER");
  const [overlays, setOverlays] = useState<DecisionOverlays>({ vwap: true, ema: true, sr: true, volume: true });
  const [open, setOpen] = useState<Record<string, boolean>>({
    scores: true,
    chart: true,
    flow: true,
    levels: true,
    mtf: true,
    plan: true,
    context: true,
    explain: true,
    week: false,
    alerts: false,
  });

  const routeSymbol = String(params.symbol || "").toUpperCase();
  const activeSymbol = routeSymbol || symbol;

  useEffect(() => {
    if (!activeSymbol) return;
    const savedTf = window.sessionStorage.getItem("stock-decision-tf-v2");
    const savedSym = window.sessionStorage.getItem("stock-decision-tf-symbol");
    if (savedSym === activeSymbol && savedTf && isStockDecisionTimeframe(savedTf)) {
      setTf(savedTf);
      return;
    }
    setTf("1d");
    window.sessionStorage.setItem("stock-decision-tf-v2", "1d");
    window.sessionStorage.setItem("stock-decision-tf-symbol", activeSymbol);
  }, [activeSymbol]);

  useEffect(() => {
    if (routeSymbol && routeSymbol !== symbol) setSymbol(routeSymbol);
  }, [routeSymbol, setSymbol, symbol]);

  useEffect(() => {
    const onPick = (event: Event) => {
      const next = String((event as CustomEvent<string>).detail || "").toUpperCase();
      if (!next || !pathname.startsWith("/stock-decision")) return;
      const dest = `/stock-decision/${next}`;
      if (pathname !== dest) router.replace(dest);
    };
    window.addEventListener("voxel:symbol", onPick);
    return () => window.removeEventListener("voxel:symbol", onPick);
  }, [pathname, router]);

  useEffect(() => {
    if (!pathname.startsWith("/stock-decision")) return;
    if (routeSymbol) return;
    if (symbol) router.replace(`/stock-decision/${symbol}`);
  }, [pathname, routeSymbol, router, symbol]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.stockDecision(activeSymbol, tf),
    queryFn: ({ signal }) => api.stockDecision(activeSymbol, tf, signal),
    enabled: Boolean(activeSymbol),
    refetchInterval: autoRefresh ? 60_000 : false,
    placeholderData: (prev) => prev,
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Invalid ticker") || msg.includes("enough market data")) return false;
      return count < 1;
    },
  });
  const map = data?.data;
  const stale = map?.freshness.dataStatus === "STALE";

  const toggle = (key: keyof DecisionOverlays) => setOverlays((o) => ({ ...o, [key]: !o[key] }));
  const flip = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  const [alertNote, setAlertNote] = useState<string | null>(null);
  const createWatchAlert = async (type: string) => {
    if (!map) return;
    try {
      await api.createAlert({
        symbol: map.symbol,
        type,
        config: { timeframe: map.timeframe, resistance: map.breakout.resistance, support: map.supports[0]?.price, action: map.action },
      });
      setAlertNote(`${type.replaceAll("_", " ")} alert saved for ${map.symbol}.`);
    } catch (err) {
      setAlertNote(err instanceof Error ? err.message : "Alert could not be saved.");
    }
  };

  const matrixRows = useMemo(
    () => [
      ["Up", "High", "Strong participation"],
      ["Up", "Low", "Weak participation"],
      ["Down", "High", "Strong selling pressure"],
      ["Down", "Low", "Lower-participation pullback"],
      ["Flat", "High", "Absorption / conflict"],
      ["Flat", "Low", "Consolidation"],
    ],
    [],
  );

  return (
    <div className="p-3 sm:p-4 space-y-3 pb-16" data-testid="stock-decision">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.22em] text-slate-500">STOCK DECISION ENGINE</div>
          <h1 className="text-xl font-semibold tracking-tight">
            {activeSymbol} <span className="text-slate-400">{STOCK_DECISION_TF_LABEL[tf]}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-0.5 max-w-3xl">
            Daily is the default. Changing ticker or timeframe recalculates the full weighted decision — it does not only redraw the chart.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" data-testid="decision-view">
            {(["BEGINNER", "PRO"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setView(m)}
                className={`px-3 py-1.5 rounded-md border text-[11px] ${view === m ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
              >
                {m === "BEGINNER" ? "Beginner View" : "Pro View"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" data-testid="decision-timeframes">
            {STOCK_DECISION_TIMEFRAMES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTf(id);
                  window.sessionStorage.setItem("stock-decision-tf-v2", id);
                  window.sessionStorage.setItem("stock-decision-tf-symbol", activeSymbol);
                }}
                className={`px-3 py-1.5 rounded-md border text-[12px] ${tf === id ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
              >
                {STOCK_DECISION_TF_LABEL[id]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <div className="panel p-10 text-center text-slate-400">Building the {activeSymbol} decision map…</div>}
      {error && !map && (
        <div className="panel p-6 text-bear text-sm">
          Market data temporarily unavailable — {(error as Error).message}. Values are never invented.
        </div>
      )}

      {map && (
        <>
          <DecisionSummary map={map} />

          <section className="panel p-4" data-testid="decision-header">
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <div className="text-2xl font-bold tracking-tight">
                  {map.symbol} <span className="text-base font-normal text-slate-400">{map.name}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Tier {map.dataTier} OHLCV · 1-minute and monthly bars are not in the primary bar specs
                </div>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.16em] text-slate-500">PRICE</div>
                <div className="text-xl font-semibold tick">{map.price == null ? "unavailable" : usd(map.price)}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.16em] text-slate-500">CHANGE</div>
                <div className={`tick ${(map.changePercent || 0) >= 0 ? "text-bull" : "text-bear"}`}>
                  {map.change == null ? "unavailable" : usd(map.change)} · {pct(map.changePercent)}
                </div>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.16em] text-slate-500">MARKET STATUS</div>
                <div className="font-semibold">{sessionLabel(map.session)}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.16em] text-slate-500">DATA FRESHNESS</div>
                <div className={stale ? "text-bear" : map.freshness.dataStatus === "LIVE" ? "text-bull" : "text-warn"}>
                  {freshnessLine(map)}
                  {isFetching ? " · refreshing" : ""}
                </div>
              </div>
            </div>
          </section>

          <section className="panel p-4" data-testid="decision-card">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-[12px]">
              <Stat k="Market state" v={map.marketState.replaceAll("_", " ")} />
              <Stat k="Current setup" v={map.currentSetup} />
              <Stat k="Order flow" v={map.orderFlowState} />
              <Stat k="Volume" v={map.volumeState} />
              <Stat k="Breakout" v={map.breakoutState} />
              <div>
                <div className="text-[10px] tracking-[0.16em] text-slate-500">ENGINE STATE</div>
                <div className={`mt-1 inline-flex px-2 py-1 rounded border text-[12px] font-semibold ${ACTION_STYLE[map.action] || "border-line"}`}>
                  {map.action.replaceAll("_", " ")}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {map.direction} · {map.confidence} confidence
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-300 mt-3 leading-relaxed" data-testid="decision-why">
              {view === "BEGINNER" ? map.beginnerWhy : map.why}
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3" data-testid="decision-kpis">
            <Kpi label="Trend" value={map.direction} detail={map.structure.detail} />
            <Kpi
              label="Structure"
              value={`${map.structure.hh ? "HH " : ""}${map.structure.hl ? "HL " : ""}${map.structure.lh ? "LH " : ""}${map.structure.ll ? "LL" : ""}`.trim() || map.structure.label}
              detail={map.structure.detail}
            />
            <Kpi label="Location" value={map.vwap.state} detail={map.location} />
            <Kpi label="Participation" value={map.volume.rvol == null ? "unavailable" : `RVOL ${map.volume.rvol.toFixed(2)}`} detail={map.participation} />
            <Kpi
              label="Order flow"
              value={map.orderFlow.available ? map.orderFlow.state : "unavailable"}
              detail={
                view === "BEGINNER"
                  ? map.orderFlow.delta == null
                    ? "Aggressive buy/sell volume cannot be classified from a tape that is not connected."
                    : map.orderFlow.delta > 0
                      ? "More completed candles closed up than down. That is only an estimate of which side initiated, not actual buyer volume."
                      : map.orderFlow.delta < 0
                        ? "More completed candles closed down than up. That is only an estimate of which side initiated, not actual seller volume."
                        : "Up and down completed candles are roughly balanced. The engine does not force a winner."
                  : map.orderFlow.disclaimer
              }
            />
          </div>

          <Section id="decision-scores" title="INDEPENDENT SCORES — NOT AVERAGED INTO A BUY" open={open.scores} onToggle={() => flip("scores")}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {map.scores.map((s) => (
                <div key={s.id} className="rounded-md border border-line/40 p-2">
                  <div className="text-[11px] text-slate-400">{s.label}</div>
                  <ScoreBar value={s.value} />
                  {view === "PRO" ? <p className="text-[11px] text-slate-500 mt-1">{s.why}</p> : null}
                </div>
              ))}
            </div>
          </Section>

          <Section id="decision-chart-wrap" title="PRICE CHART" open={open.chart} onToggle={() => flip("chart")}>
            <div className="flex flex-wrap gap-1 mb-2">
              {(
                [
                  ["vwap", "VWAP"],
                  ["ema", "EMA / SMA"],
                  ["sr", "Support / Resistance"],
                  ["volume", "Volume"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className={`px-2 py-1 rounded border text-[11px] ${overlays[key] ? "border-accent bg-accent/15" : "border-line text-slate-400"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <DecisionChart bars={map.bars} overlays={overlays} map={map} timeframe={map.timeframe} />
          </Section>

          <Section id="decision-flow" title="VOLUME + ESTIMATED DELTA + CVD" open={open.flow} onToggle={() => flip("flow")}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] text-slate-500">Estimated aggressive buy / sell</div>
                <div className="text-sm mt-1">
                  Buy {compact(map.orderFlow.estimatedBuy)} · Sell {compact(map.orderFlow.estimatedSell)}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">{map.volume.interpretation}</p>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Estimated delta</div>
                <div className="tick">{map.orderFlow.delta == null ? "unavailable" : `${map.orderFlow.delta >= 0 ? "+" : ""}${compact(map.orderFlow.delta)}`}</div>
                <Spark values={map.deltaSeries} color="#38bdf8" />
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Estimated CVD</div>
                <div className="tick">{map.orderFlow.cvd == null ? "unavailable" : compact(map.orderFlow.cvd)}</div>
                <Spark values={map.cvdSeries} color="#a78bfa" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{map.orderFlow.disclaimer}</p>
          </Section>

          <Section id="decision-levels" title="SUPPORT / RESISTANCE / LIQUIDITY MAP" open={open.levels} onToggle={() => flip("levels")}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <LevelList title="RESISTANCE" levels={map.resistances} />
              <LevelList title="SUPPORT" levels={map.supports} />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Liquidity map uses calculated support and resistance.
            </p>
          </Section>

          <Section id="decision-mtf" title="MULTI-TIMEFRAME ANALYSIS" open={open.mtf} onToggle={() => flip("mtf")}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" data-testid="decision-mtf">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left py-1">Timeframe</th>
                    <th className="text-left">Trend</th>
                    <th className="text-left">Structure</th>
                    <th className="text-left">VWAP</th>
                    <th className="text-left">Volume</th>
                    <th className="text-left">Order flow</th>
                  </tr>
                </thead>
                <tbody>
                  {map.mtf.map((row) => (
                    <tr key={row.timeframe} className="border-t border-line/20">
                      <td className="py-1.5">{row.label}</td>
                      <td>{row.available ? row.trend : "unavailable"}</td>
                      <td>{row.available ? row.structure : "unavailable"}</td>
                      <td>{row.available ? row.vwap : "unavailable"}</td>
                      <td>{row.available ? row.volume : "unavailable"}</td>
                      <td>{row.available ? row.orderFlow : "unavailable"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="decision-plan" title="ENTRY / STOP / TARGETS / INVALIDATION" open={open.plan} onToggle={() => flip("plan")}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-[12px]" data-testid="decision-plan">
              <Stat k="Entry zone" v={map.plan.entryZone} />
              <Stat k="Stop" v={map.plan.stop} />
              <Stat k="Targets" v={`${map.plan.target1} / ${map.plan.target2} / ${map.plan.target3}`} />
              <Stat k="Risk / reward" v={map.plan.rr == null ? "unavailable" : `${map.plan.rr.toFixed(2)}:1`} />
            </div>
            <p className="text-[12px] text-slate-400 mt-2">{map.plan.confirmation}</p>
            <p className="text-[12px] text-slate-400">{map.plan.rrNote}</p>
            <p className="text-[12px] text-slate-300 mt-2">
              Invalidation: {map.plan.invalidation}
            </p>
            {map.noTradeReasons.length ? (
              <ul className="mt-2 text-[12px] text-warn list-disc pl-5">
                {map.noTradeReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section id="decision-context" title="MARKET CONTEXT + EVENT RISK + SESSIONS" open={open.context} onToggle={() => flip("context")}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              <Stat k="SPY" v={map.context.spy == null ? "unavailable" : pct(map.context.spy)} />
              <Stat k="QQQ" v={map.context.qqq == null ? "unavailable" : pct(map.context.qqq)} />
              <Stat k="IWM" v={map.context.iwm == null ? "unavailable" : pct(map.context.iwm)} />
              <Stat k="VIX" v={map.context.vix == null ? "unavailable" : String(map.context.vix.toFixed(2))} />
            </div>
            <p className="text-[12px] text-slate-400 mt-2">{map.context.note}</p>
            <div className="mt-3 text-[12px]">
              Event risk: <span className={map.eventRisk.label === "HIGH" ? "text-warn" : "text-slate-300"}>{map.eventRisk.label}</span>
              <p className="text-slate-500 mt-1">{map.eventRisk.detail}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <SessionBox title="Premarket" s={map.sessions.premarket} />
              <SessionBox title="After-hours" s={map.sessions.afterHours} />
            </div>
          </Section>

          <Section id="decision-explain" title="WHY / WHAT CHANGED / DATA QUALITY" open={open.explain} onToggle={() => flip("explain")}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <h3 className="text-[11px] tracking-[0.16em] text-slate-500 mb-1">EXPLANATION FROM CALCULATED EVIDENCE</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{map.why}</p>
                <ul className="mt-2 text-[12px] text-slate-400 list-disc pl-5">
                  {map.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <ul className="mt-2 text-[12px] text-slate-500 list-disc pl-5">
                  {map.invalidations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-[11px] tracking-[0.16em] text-slate-500 mb-1">WHAT CHANGED</h3>
                {map.whatChanged.map((row) => (
                  <div key={row.label} className="flex justify-between text-[12px] py-0.5 border-b border-line/20">
                    <span className="text-slate-400">{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ))}
                <p className="text-[12px] text-slate-500 mt-2">{map.whatChangedNote}</p>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-line/40 p-3 text-[12px]" data-testid="decision-quality">
              <div className="text-[11px] tracking-[0.16em] text-slate-500">DATA QUALITY · TIER {map.dataTier}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                <span>Bars {map.dataQuality.bars}</span>
                <span>Quote {map.dataQuality.quote}</span>
                <span>Order flow {map.dataQuality.orderFlow}</span>
              </div>
              <p className="text-slate-500 mt-2">{map.dataQuality.note}</p>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Pattern vs structure: {map.pattern.name}. Status {map.pattern.status}. {map.pattern.note}
            </p>
          </Section>

          <Section id="decision-week" title="1-WEEK VOLUME ANALYSIS + PRICE/VOLUME MATRIX" open={open.week} onToggle={() => flip("week")}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left py-1">Date</th>
                    <th className="text-left">Close</th>
                    <th className="text-left">Change</th>
                    <th className="text-left">Volume</th>
                    <th className="text-left">RVOL</th>
                    <th className="text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {map.weekVolume.map((d) => (
                    <tr key={d.date} className="border-t border-line/20 align-top">
                      <td className="py-1.5">{d.date}</td>
                      <td>{d.close == null ? "unavailable" : usd(d.close)}</td>
                      <td>{pct(d.changePct)}</td>
                      <td>{compact(d.volume)}</td>
                      <td>{d.rvol == null ? "unavailable" : d.rvol.toFixed(2)}</td>
                      <td className="text-slate-500">{d.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-[12px]">
              {matrixRows.map(([p, v, i]) => (
                <div key={`${p}-${v}`} className={`rounded border p-2 ${map.volume.matrix.includes(p.toUpperCase()) && map.volume.matrix.includes(v === "High" ? "HIGH" : v === "Low" ? "LOW" : "") ? "border-accent/50" : "border-line/40"}`}>
                  <div className="text-slate-400">
                    Price {p} · Volume {v}
                  </div>
                  <div>{i}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Volume vs 5-day average: {map.volume.vs5 == null ? "unavailable" : `${map.volume.vs5.toFixed(2)}x`}. Total volume is not buying volume.
            </p>
          </Section>

          <Section id="decision-alerts" title="ALERTS" open={open.alerts} onToggle={() => flip("alerts")}>
            <p className="text-[12px] text-slate-400 mb-2">
              Alerts use the existing alert store. They watch calculated levels — they do not invent a live tape.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ["PRICE_RESISTANCE", "Price above resistance"],
                ["RVOL", "Relative volume"],
                ["VWAP_RECLAIM", "VWAP reclaim"],
                ["BREAKOUT", "Confirmed breakout"],
                ["STRUCTURE", "Structure transition"],
              ].map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => createWatchAlert(type)}
                  className="px-3 py-1.5 rounded-md border border-line text-[12px] text-slate-300"
                >
                  {label}
                </button>
              ))}
            </div>
            {alertNote ? <p className="text-[12px] text-slate-400 mt-2">{alertNote}</p> : null}
          </Section>

          <p className="text-[10px] text-slate-600 max-w-5xl mx-auto text-center">{map.methodology}</p>
        </>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.16em] text-slate-500">{k.toUpperCase()}</div>
      <div className="text-[13px] font-semibold mt-0.5">{v}</div>
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="panel p-3">
      <div className="text-[10px] tracking-[0.16em] text-slate-500">{label.toUpperCase()}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
      <p className="text-[11px] text-slate-500 mt-1 leading-snug">{detail}</p>
    </section>
  );
}

function SessionBox({
  title,
  s,
}: {
  title: string;
  s: StockDecisionMap["sessions"]["premarket"];
}) {
  return (
    <div className="rounded-md border border-line/40 p-3 text-[12px]">
      <div className="text-[11px] tracking-[0.16em] text-slate-500">{title.toUpperCase()}</div>
      {s.available ? (
        <div className="mt-1 space-y-0.5">
          <div>Price {s.price == null ? "unavailable" : usd(s.price)}</div>
          <div>
            High {s.high == null ? "unavailable" : usd(s.high)} · Low {s.low == null ? "unavailable" : usd(s.low)}
          </div>
          <div>Volume {s.volume == null ? "unavailable" : compact(s.volume)}</div>
          <div>VWAP {s.vwap == null ? "unavailable" : usd(s.vwap)}</div>
        </div>
      ) : (
        <p className="text-slate-500 mt-1">Session data unavailable. Missing values are not shown as zero.</p>
      )}
    </div>
  );
}
