"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { compact, money, pct, usd, toneClass, signalLabel } from "@/lib/format";
import { useTerminal } from "@/components/layout/AppShell";
import { TimeframeSelect } from "@/components/search/TimeframeSelect";
import { TickerSessionStrip } from "@/components/market/TickerSessionStrip";
import { SessionBadge } from "@/components/market/SessionBadge";
import { MultiTimeframeMatrix } from "@/components/mtf/MultiTimeframeMatrix";
import { useTickerMarketContext } from "@/hooks/useTickerMarketContext";
import {
  BUYING_HORIZON_LABEL,
  BUYING_HORIZON_TIMEFRAME,
  BUYING_HORIZONS,
  computePositionSize,
  computeRiskReward,
  freshnessLabel,
  type BuyingHorizon,
} from "@/lib/stockBuying";
import type { Timeframe } from "@/lib/types";
import { BuyingChart, type BuyingOverlays } from "./BuyingChart";

const STATE_STYLE: Record<string, string> = {
  LONG_SETUP: "bg-bull/15 text-bull border-bull/40",
  WATCH: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  WAIT: "bg-warn/15 text-warn border-warn/40",
  NO_TRADE: "bg-bear/15 text-bear border-bear/40",
  INSUFFICIENT_DATA: "bg-slate-700/40 text-slate-300 border-line",
  BREAKOUT_PENDING: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  BREAKOUT_CONFIRMED: "bg-bull/15 text-bull border-bull/40",
  RETEST_PENDING: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  RETEST_CONFIRMED: "bg-bull/15 text-bull border-bull/40",
  FAILED: "bg-bear/15 text-bear border-bear/40",
  INVALIDATED: "bg-bear/15 text-bear border-bear/40",
};

function arrow(label: string) {
  const u = label.toUpperCase();
  if (u.includes("BULL") || u.includes("POSITIVE") || u.includes("CONFIRM") || u.includes("LONG")) return "↑";
  if (u.includes("BEAR") || u.includes("NEGATIVE") || u.includes("FAIL") || u.includes("NO TRADE")) return "↓";
  return "→";
}

export function StockBuyingEngine() {
  const { symbol, setSymbol, timeframe, setTimeframe, autoRefresh } = useTerminal();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ symbol?: string }>();
  const [horizon, setHorizon] = useState<BuyingHorizon>("SWING");
  const [mode, setMode] = useState<"SIMPLE" | "ADVANCED">("SIMPLE");
  const [overlays, setOverlays] = useState<BuyingOverlays>({ ema: true, vwap: true, sr: true, plan: true, volume: true });
  const [account, setAccount] = useState(50_000);
  const [riskPct, setRiskPct] = useState(0.5);
  const [entry, setEntry] = useState<string>("");
  const [stop, setStop] = useState<string>("");
  const [t1, setT1] = useState<string>("");
  const [t2, setT2] = useState<string>("");
  const [t3, setT3] = useState<string>("");

  const routeSymbol = String(params.symbol || "").toUpperCase();

  useEffect(() => {
    if (routeSymbol && routeSymbol !== symbol) setSymbol(routeSymbol);
  }, [routeSymbol, setSymbol, symbol]);

  useEffect(() => {
    if (!pathname.startsWith("/stock-buying-engine")) return;
    if (routeSymbol && routeSymbol !== symbol) return;
    const next = `/stock-buying-engine/${symbol}`;
    if (pathname !== next) router.replace(next);
  }, [pathname, router, symbol, routeSymbol]);

  const queryTf = timeframe;
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.stockBuying(symbol, horizon, queryTf),
    queryFn: ({ signal }) => api.stockBuying(symbol, horizon, queryTf, signal),
    refetchInterval: autoRefresh ? 60_000 : false,
    placeholderData: (prev) => prev,
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Invalid ticker") || msg.includes("enough market data") || msg.includes("does not currently support")) return false;
      return count < 1;
    },
  });
  const ctx = useTickerMarketContext(symbol).data?.data;
  const payload = data?.data;
  const bundle = payload?.bundle;
  const decision = payload?.decision;
  const quote = bundle?.quote;

  useEffect(() => {
    if (!bundle?.long_plan) return;
    const p = bundle.long_plan;
    setEntry((v) => v || (p.ideal_entry != null ? String(p.ideal_entry) : ""));
    setStop((v) => v || (p.stop != null ? String(p.stop) : ""));
    setT1((v) => v || (p.target1 != null ? String(p.target1) : ""));
    setT2((v) => v || (p.target2 != null ? String(p.target2) : ""));
    setT3((v) => v || (p.target3 != null ? String(p.target3) : ""));
  }, [bundle?.long_plan, symbol, horizon]);

  const rr = useMemo(
    () =>
      computeRiskReward({
        entry: num(entry),
        stop: num(stop),
        target1: num(t1),
        target2: num(t2),
        target3: num(t3),
      }),
    [entry, stop, t1, t2, t3],
  );
  const size = useMemo(
    () => computePositionSize({ accountSize: account, riskPct, entry: num(entry), stop: num(stop) }),
    [account, riskPct, entry, stop],
  );

  const applyHorizon = (h: BuyingHorizon) => {
    setHorizon(h);
    setTimeframe(BUYING_HORIZON_TIMEFRAME[h]);
    setEntry("");
    setStop("");
    setT1("");
    setT2("");
    setT3("");
  };

  const toggle = (key: keyof BuyingOverlays) => setOverlays((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div className="p-3 sm:p-4 space-y-3 pb-16" data-testid="stock-buying-engine">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.22em] text-slate-500">STOCK BUYING ENGINE</div>
          <h1 className="text-xl font-semibold tracking-tight">Decision workspace</h1>
          <p className="text-sm text-slate-400 mt-0.5 max-w-3xl">
            Evidence from the current market, structure, volume, and fundamentals — not a guaranteed buy or sell.
          </p>
        </div>
        <div className="flex gap-1">
          {(["SIMPLE", "ADVANCED"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md border text-[11px] ${mode === m ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1" data-testid="buying-horizons">
        {BUYING_HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => applyHorizon(h)}
            className={`px-3 py-1.5 rounded-md border text-[12px] ${horizon === h ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
          >
            {BUYING_HORIZON_LABEL[h]}
          </button>
        ))}
      </div>

      {quote ? (
        <section className="panel p-4">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-2xl font-bold tracking-tight">
                {quote.symbol} <span className="text-base font-normal text-slate-400">{quote.name}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {quote.exchange || "—"} · {quote.sector || "—"} · {freshnessLabel(quote.freshness?.data_status)}
              </div>
            </div>
            <div>
              <div className="text-3xl font-semibold tick flex items-center gap-2">
                {usd(ctx?.quote.price ?? quote.price)}
                <SessionBadge session={ctx?.session} />
              </div>
              <div className={`text-sm ${(ctx?.quote.change ?? quote.change ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
                {pct(ctx?.quote.changePercent ?? quote.change_percent)} today
              </div>
            </div>
            <TimeframeSelect value={timeframe} onChange={setTimeframe} />
            <div className="text-[11px] text-slate-500">
              Updated {bundle?.freshness.timestamp ? new Date(bundle.freshness.timestamp).toLocaleString("en-US", { timeZone: "America/New_York" }) : "—"} ET
              {isFetching ? " · refreshing" : ""}
            </div>
          </div>
          <div className="mt-3">
            <TickerSessionStrip symbol={quote.symbol} />
          </div>
        </section>
      ) : (
        <div className="panel p-4 flex flex-wrap items-end gap-4">
          <div>
            <div className="text-2xl font-bold">{symbol}</div>
            <div className="text-xs text-slate-500">Use the header search to change ticker</div>
          </div>
          <TimeframeSelect value={timeframe} onChange={setTimeframe} />
        </div>
      )}

      {isLoading && <div className="panel p-10 text-center text-slate-400">Loading decision context…</div>}
      {error && !payload && (
        <div className="panel p-6 text-bear text-sm">
          Market data temporarily unavailable — {(error as Error).message}. Values are never invented.
        </div>
      )}

      {decision && bundle && (
        <>
          <section className="panel p-4" data-testid="buying-decision">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] tracking-[0.18em] text-slate-500">CURRENT STATE</div>
                <div className={`inline-flex mt-1 px-3 py-1 rounded border text-lg font-semibold ${STATE_STYLE[decision.state] || STATE_STYLE.WAIT}`}>
                  {arrow(decision.state)} {decision.state.replaceAll("_", " ")}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                <Fact k="Market" v={`${arrow(decision.regime)} ${decision.regime}`} />
                <Fact k="Trend" v={`${arrow(decision.trend)} ${decision.trend}`} />
                <Fact k="Momentum" v={`${arrow(decision.momentum)} ${decision.momentum}`} />
                <Fact k="Volume" v={`${arrow(decision.volume)} ${decision.volume}`} />
                <Fact k="Structure" v={decision.structure.replaceAll("_", " ")} />
                <Fact k="Catalyst" v={decision.catalyst} />
                <Fact k="Valuation" v={decision.valuation} />
                <Fact k="Plan R:R" v={decision.riskReward != null ? `${decision.riskReward.toFixed(2)} : 1` : "—"} />
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-300">
              <div className="font-semibold text-white">Why?</div>
              <p>{decision.why}</p>
              {mode === "ADVANCED" && (
                <p className="text-[12px] text-slate-500 mt-2">
                  WHAT: {decision.what} SO WHAT: {decision.soWhat}
                </p>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <section className="panel p-3">
              <h2 className="text-sm font-semibold mb-2">Market regime</h2>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <Fact k="SPY / SPX" v={bundle.market?.spx_change_pct != null ? pct(bundle.market.spx_change_pct) : "—"} />
                <Fact k="QQQ / NDX" v={bundle.market?.ndx_change_pct != null ? pct(bundle.market.ndx_change_pct) : bundle.market?.qqq_change_pct != null ? pct(bundle.market.qqq_change_pct) : "—"} />
                <Fact k="VIX" v={bundle.market?.vix != null ? money(bundle.market.vix, 2) : "—"} />
                <Fact k="10Y" v={bundle.rates && typeof bundle.rates.yield === "number" ? `${bundle.rates.yield.toFixed(2)}%` : "—"} />
              </div>
            </section>
            <section className="panel p-3" data-testid="buying-relative">
              <h2 className="text-sm font-semibold mb-2">Sector / relative strength</h2>
              <div className="grid grid-cols-3 gap-2 text-[12px] mb-2">
                <Fact k={symbol} v={pct(payload.relative.stock)} />
                <Fact k={payload.relative.sectorEtf || "Sector"} v={pct(payload.relative.sector)} />
                <Fact k="SPY" v={pct(payload.relative.spy)} />
              </div>
              <p className="text-[12px] text-slate-400">{payload.relative.note}</p>
            </section>
          </div>

          <section className="panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold">Primary chart</h2>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {(Object.keys(overlays) as Array<keyof BuyingOverlays>).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggle(k)}
                    className={`px-2 py-1 rounded border ${overlays[k] ? "border-accent text-white" : "border-line text-slate-500"}`}
                  >
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <BuyingChart
              bars={bundle.bars || []}
              indicators={bundle.indicators}
              levels={bundle.levels}
              plan={bundle.long_plan}
              timeframe={timeframe}
              overlays={overlays}
              sma={payload.overlays}
            />
          </section>

          <MultiTimeframeMatrix rows={bundle.multi_timeframe} selected={timeframe as Timeframe} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <section className="panel p-3" data-testid="buying-evidence">
              <h2 className="text-sm font-semibold mb-2">Why this state?</h2>
              <ul className="space-y-1.5 text-[12px]">
                {decision.evidence.slice(0, mode === "SIMPLE" ? 6 : 12).map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className={e.status === "MET" ? "text-bull" : e.status === "NOT_MET" ? "text-bear" : "text-slate-500"}>
                      {e.status === "MET" ? "✓" : e.status === "NOT_MET" ? "×" : "○"}
                    </span>
                    <span>
                      <span className="text-white">{e.label}</span>
                      <span className="text-slate-400"> — {e.current}. {e.explanation}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel p-3">
              <h2 className="text-sm font-semibold mb-2">Key levels</h2>
              <div className="space-y-1 text-[12px]">
                {decision.levels.filter((l) => l.price != null).map((l) => (
                  <div key={l.label} className="flex justify-between gap-3 border-b border-white/5 py-1">
                    <span>{l.label}</span>
                    <span className="text-right">
                      <span className="text-white">{usd(l.price)}</span>
                      {mode === "ADVANCED" ? <span className="block text-[10px] text-slate-500">{l.why}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="panel p-3 overflow-x-auto">
            <h2 className="text-sm font-semibold mb-2">Indicator matrix</h2>
            <table className="w-full text-[12px] min-w-[520px]">
              <thead className="text-slate-500">
                <tr>{["Indicator", "Current", "Status", "Explanation"].map((h) => <th key={h} className="text-left py-1 pr-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {decision.matrix.map((row) => (
                  <tr key={row.name} className="border-t border-white/5">
                    <td className="py-1.5 pr-2 text-white">{row.name}</td>
                    <td className="py-1.5 pr-2">{row.current}</td>
                    <td className={`py-1.5 pr-2 ${toneClass(row.status)}`}>{row.status}</td>
                    <td className="py-1.5 text-slate-400">{mode === "SIMPLE" ? row.explanation.slice(0, 90) + (row.explanation.length > 90 ? "…" : "") : row.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {(horizon === "LONG_TERM" || mode === "ADVANCED") && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <section className="panel p-3">
                <h2 className="text-sm font-semibold mb-2">Fundamentals / thesis</h2>
                <ul className="space-y-1 text-[12px] text-slate-300">
                  {decision.thesis.map((line) => <li key={line}>{line}</li>)}
                </ul>
                {bundle.fundamentals ? (
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
                    <Fact k="Revenue g" v={pct(numBox(bundle.fundamentals.revenue_growth))} />
                    <Fact k="EPS g" v={pct(numBox(bundle.fundamentals.eps_growth))} />
                    <Fact k="Gross m" v={pct(numBox(bundle.fundamentals.gross_margin))} />
                    <Fact k="P/E" v={money(numBox(bundle.fundamentals.pe) ?? quote?.pe)} />
                    <Fact k="Fwd P/E" v={money(numBox(bundle.fundamentals.forward_pe) ?? quote?.forward_pe)} />
                    <Fact k="FCF" v={compact(numBox(bundle.fundamentals.free_cash_flow))} />
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm mt-2">Fundamental snapshot unavailable.</div>
                )}
              </section>
              <section className="panel p-3">
                <h2 className="text-sm font-semibold mb-2">Valuation context</h2>
                <p className="text-[12px] text-slate-300">{decision.valuation}</p>
                <p className="text-[11px] text-slate-500 mt-2">Cheap is not a buy. Expensive is not a sell. Multi-year PE history is not invented when the provider omits it.</p>
              </section>
            </div>
          )}

          {(horizon === "DAY_TRADE" || horizon === "SCALP") && (
            <section className="panel p-3" data-testid="buying-intraday">
              <h2 className="text-sm font-semibold mb-2">{horizon === "SCALP" ? "Scalp dashboard" : "Day-trade context"}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px] mb-2">
                <Fact k="VWAP" v={usd(bundle.indicators.vwap)} />
                <Fact k="RVOL" v={bundle.indicators.volume_ratio != null ? `${bundle.indicators.volume_ratio.toFixed(2)}x` : "—"} />
                <Fact k="Prev close" v={usd(quote?.previous_close)} />
                <Fact k="Session" v={ctx?.session || quote?.market_state || "—"} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {decision.scenarios.map((s) => (
                  <div key={s.id} className="bg-white/[0.03] rounded p-2 text-[12px]">
                    <div className="text-white font-semibold">Scenario {s.id}: {s.title}</div>
                    <div className="text-slate-400">{s.detail}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <section className="panel p-3" data-testid="buying-rr">
              <h2 className="text-sm font-semibold mb-2">Risk / reward</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
                <Num label="Entry" value={entry} onChange={setEntry} />
                <Num label="Stop" value={stop} onChange={setStop} />
                <Num label="Target 1" value={t1} onChange={setT1} />
                <Num label="Target 2" value={t2} onChange={setT2} />
                <Num label="Target 3" value={t3} onChange={setT3} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                <Fact k="Risk" v={usd(rr.risk)} />
                <Fact k="R:R T1" v={rr.rr1 != null ? `${rr.rr1.toFixed(2)} : 1` : "—"} />
                <Fact k="R:R T2" v={rr.rr2 != null ? `${rr.rr2.toFixed(2)} : 1` : "—"} />
                <Fact k="R:R T3" v={rr.rr3 != null ? `${rr.rr3.toFixed(2)} : 1` : "—"} />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">{rr.note}</p>
            </section>
            <section className="panel p-3" data-testid="buying-size">
              <h2 className="text-sm font-semibold mb-2">Position size</h2>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Num label="Account $" value={String(account)} onChange={(v) => setAccount(Number(v) || 0)} />
                <Num label="Risk %" value={String(riskPct)} onChange={(v) => setRiskPct(Number(v) || 0)} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <Fact k="Max $ risk" v={usd(size.maxDollarRisk)} />
                <Fact k="Risk / share" v={usd(size.riskPerShare)} />
                <Fact k="Max shares" v={size.maxShares != null ? String(size.maxShares) : "—"} />
                <Fact k="Position value" v={usd(size.positionValue)} />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">{size.note}</p>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <section className="panel p-3">
              <h2 className="text-sm font-semibold mb-2">Catalysts / macro (ET)</h2>
              {payload.events.length ? payload.events.map((e) => (
                <div key={`${e.name}-${e.dateLabel}`} className="flex justify-between text-[12px] py-1 border-b border-white/5">
                  <span>{e.name}</span>
                  <span className="text-slate-500">{e.dateLabel} {e.timeLabel} · {e.status}</span>
                </div>
              )) : <div className="text-slate-500 text-sm">No dated macro events from the calendar provider.</div>}
              <div className="mt-3 space-y-1">
                {(bundle.news || []).slice(0, 5).map((n) => (
                  <a key={n.id || n.headline} href={n.url || undefined} target="_blank" rel="noreferrer" className="block text-[12px]">
                    <span className="text-white">{n.headline}</span>
                    <span className="block text-[10px] text-slate-500">{n.source} · {n.published_at || "time not provided"}</span>
                  </a>
                ))}
              </div>
            </section>
            <section className="panel p-3" data-testid="buying-watch">
              <h2 className="text-sm font-semibold mb-2">What would change this analysis?</h2>
              <Block title="Bullish confirmation" items={decision.whatChanges.confirm} />
              <Block title="Caution" items={decision.whatChanges.caution} />
              <Block title="Invalidation" items={decision.whatChanges.invalidate} />
            </section>
          </div>

          {mode === "ADVANCED" && (
            <section className="panel p-3">
              <h2 className="text-sm font-semibold mb-2">Signal categories</h2>
              <div className="text-[12px] text-slate-400 mb-2">
                Existing engine label {signalLabel(bundle.signal.signal)} · score {bundle.signal.score} is a documented weighted sum, not a probability.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
                {bundle.signal.categories.map((c) => (
                  <div key={c.name} className="flex justify-between gap-2 border-b border-white/5 py-1">
                    <span>{c.name}</span>
                    <span className={toneClass(c.status)}>{c.status} · {c.raw_score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">{payload.methodology}</p>
            </section>
          )}

          <section className="panel p-3 text-[12px]">
            <h2 className="text-sm font-semibold mb-2">Deeper Voxel pages for {symbol}</h2>
            <div className="flex flex-wrap gap-2">
              <PageLink href="/signals" label="Signal Analyzer" />
              <PageLink href="/patterns" label="Chart Pattern" />
              <PageLink href="/swing" label="Swing Trading" />
              <PageLink href="/scalp-analyzer" label="Scalp Analyzer" />
              <PageLink href="/fundamentals" label="Fundamentals" />
              <PageLink href="/news" label="News" />
              <PageLink href="/watchlist" label="Watchlist" />
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-400">
              {decision.quality.map((q) => (
                <Fact key={q.label} k={q.label} v={q.value} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-white/[0.03] rounded px-2 py-1.5 min-w-0">
      <div className="text-[10px] tracking-wide text-slate-500 truncate">{k}</div>
      <div className="text-slate-200 truncate">{v}</div>
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-[11px] text-slate-500">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="mt-0.5 w-full bg-panel2 border border-line rounded px-2 py-1 text-sm text-white"
      />
    </label>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] tracking-wide text-slate-500">{title}</div>
      <ul className="list-disc pl-4 text-[12px] text-slate-300">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}

function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="px-2 py-1 rounded border border-line text-[12px] text-slate-300 hover:text-white">
      {label}
    </Link>
  );
}

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== "" ? n : null;
}

function numBox(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
