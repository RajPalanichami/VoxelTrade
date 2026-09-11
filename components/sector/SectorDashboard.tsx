"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { compact, pct, usd } from "@/lib/format";
import { INTRADAY, LONG, Mag7Range, Mag7Stock, Mag7Timeframe, PERF_RANGES, SWING } from "@/lib/mag7";
import { SECTOR_PAGES } from "@/lib/sectors";
import { Sparkline } from "@/components/pulse/Sparkline";
import { SectorChart } from "./SectorChart";

function tone(signal?: string) {
  const s = (signal || "").toUpperCase();
  if (s === "STRONG" || s === "BULLISH") return "text-bull";
  if (s === "WEAK" || s === "BEARISH") return "text-bear";
  return "text-warn";
}

function chip(signal?: string) {
  const s = (signal || "").toUpperCase();
  if (s === "STRONG" || s === "BULLISH") return "bg-bull/15 text-bull border-bull/40";
  if (s === "WEAK" || s === "BEARISH") return "bg-bear/15 text-bear border-bear/40";
  return "bg-warn/15 text-warn border-warn/40";
}

function rsiHint(rsi?: number | null) {
  if (rsi == null) return "RSI unavailable";
  if (rsi >= 70) return "RSI 70+ — overbought. That is not automatically a sell.";
  if (rsi >= 50) return "RSI 50–70 — bullish momentum";
  if (rsi >= 30) return "RSI 30–50 — weak";
  return "RSI below 30 — oversold. That is not automatically a buy.";
}

function ScoreRing({ score }: { score: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = score >= 80 ? "#4ade80" : score >= 68 ? "#38bdf8" : score >= 52 ? "#fbbf24" : "#f87171";
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0">
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="4" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <text x="24" y="28" textAnchor="middle" className="tick" fill="white" fontSize="11" fontWeight="700">
        {score}
      </text>
    </svg>
  );
}

function Bar({ value, max = 25 }: { value: number; max?: number }) {
  const pctW = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 rounded bg-white/10 overflow-hidden">
      <div className="h-full bg-accent" style={{ width: `${pctW}%` }} />
    </div>
  );
}

export function SectorDashboard({ slug }: { slug: string }) {
  const meta = SECTOR_PAGES.find((s) => s.slug === slug);
  const { autoRefresh } = useTerminal();
  const [tf, setTf] = useState<Mag7Timeframe>("1d");
  const [range, setRange] = useState<Mag7Range>("1M");
  const [selected, setSelected] = useState<string | null>(null);

  const indicatorTf = LONG.includes(tf) ? "1d" : tf;
  const { data, isLoading, error } = useQuery({
    queryKey: keys.sector(slug, indicatorTf, range),
    queryFn: () => api.sector(slug, indicatorTf, range),
    staleTime: 45_000,
    refetchInterval: autoRefresh ? 90_000 : false,
  });
  const p = data?.data;
  const stocks = p?.stocks || [];
  const pick = stocks.find((s) => s.symbol === (selected || stocks[0]?.symbol)) || stocks[0];

  const onGlobalTf = (next: Mag7Timeframe) => {
    setTf(next);
    if ((PERF_RANGES as string[]).includes(next)) setRange(next as Mag7Range);
  };

  const cats = p?.categories || {};
  const ctx = p?.context || {};

  return (
    <div className="w-full p-3 sm:p-4 space-y-4 pb-10" data-testid="sector-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.2em] text-slate-500">{(meta?.name || slug).toUpperCase()} · {p?.etf || meta?.etf}</div>
          <h1 className="text-xl font-semibold">{meta?.name || "Sector"} Intelligence</h1>
          <p className="text-sm text-slate-400 max-w-3xl mt-1">{p?.headline || `Which ${meta?.name || "sector"} stock is strongest right now, and why?`}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>
            Market status: <span className={tone(p?.market_status)}>{p?.market_status || "—"}</span>
          </div>
          <div>{p?.updated ? new Date(p.updated).toLocaleString() : ""}</div>
        </div>
      </div>

      <div className="panel p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-slate-500 tracking-widest">INTRADAY</span>
          {INTRADAY.map((t) => (
            <TfBtn key={t} active={tf === t} onClick={() => onGlobalTf(t)} label={t} />
          ))}
          <span className="text-slate-500 tracking-widest ml-2">SWING</span>
          {SWING.map((t) => (
            <TfBtn key={t} active={tf === t} onClick={() => onGlobalTf(t)} label={t.toUpperCase()} />
          ))}
          <span className="text-slate-500 tracking-widest ml-2">LONG-TERM</span>
          {LONG.map((t) => (
            <TfBtn key={t} active={tf === t} onClick={() => onGlobalTf(t)} label={t} />
          ))}
        </div>
        <ContextStrip ctx={ctx} etf={p?.etf || meta?.etf || ""} />
      </div>

      {isLoading && <div className="panel p-10 text-center text-slate-400">Loading live {meta?.name || "sector"} data…</div>}
      {error && (
        <div className="panel p-4 text-bear text-sm">DATA UNAVAILABLE — {(error as Error).message}. Values are never invented.</div>
      )}
      {p?.missing?.length ? <div className="text-xs text-warn">Missing live rows: {p.missing.join(", ")}</div> : null}

      {p && (
        <>
          <BestFor cats={cats} stocks={stocks} />

          <section>
            <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-2">{(meta?.name || "SECTOR").toUpperCase()} MARKET PULSE · ranked strongest → weakest</div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-2">
              {stocks.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => setSelected(s.symbol)}
                  className={`panel p-2.5 text-left ${pick?.symbol === s.symbol ? "ring-1 ring-accent" : ""}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="text-[10px] text-slate-500">#{s.rank}</div>
                      <div className="font-semibold">{s.symbol}</div>
                    </div>
                    <ScoreRing score={s.strength} />
                  </div>
                  <div className="tick text-sm mt-1">{usd(s.price)}</div>
                  <div className={`text-[11px] tick ${ (s.change_percent || 0) >= 0 ? "text-bull" : "text-bear"}`}>{pct(s.change_percent)}</div>
                  <Sparkline values={s.spark || []} up={(s.change_percent || 0) >= 0} compact />
                  <div className="grid grid-cols-4 gap-1 mt-1 text-[9px] text-slate-500">
                    <span>1W {pct(s.performance["1W"])}</span>
                    <span>1M {pct(s.performance["1M"])}</span>
                    <span>3M {pct(s.performance["3M"])}</span>
                    <span>1Y {pct(s.performance["1Y"])}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-3">
            <div className="panel overflow-x-auto">
              <div className="px-4 py-3 text-[11px] tracking-[0.18em] text-slate-500">STRENGTH SCORE · 0–100</div>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-1">#</th>
                    <th className="text-left px-3 py-1">Stock</th>
                    <th className="text-right px-3 py-1">Trend/25</th>
                    <th className="text-right px-3 py-1">Mom/25</th>
                    <th className="text-right px-3 py-1">Vol/15</th>
                    <th className="text-right px-3 py-1">Vola/15</th>
                    <th className="text-right px-3 py-1">Perf/20</th>
                    <th className="text-right px-3 py-1">Score</th>
                    <th className="text-right px-3 py-1">Risk</th>
                    <th className="text-left px-3 py-1">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => (
                    <tr key={s.symbol} className="border-t border-white/5 cursor-pointer hover:bg-white/5" onClick={() => setSelected(s.symbol)}>
                      <td className="px-3 py-1.5">{s.rank}</td>
                      <td className="px-3 py-1.5 font-semibold">{s.symbol}</td>
                      <td className="px-3 py-1.5 text-right tick">{s.components.trend}</td>
                      <td className="px-3 py-1.5 text-right tick">{s.components.momentum}</td>
                      <td className="px-3 py-1.5 text-right tick">{s.components.volume}</td>
                      <td className="px-3 py-1.5 text-right tick">{s.components.volatility}</td>
                      <td className="px-3 py-1.5 text-right tick">{s.components.performance}</td>
                      <td className="px-3 py-1.5 text-right tick font-semibold">{s.strength}</td>
                      <td className="px-3 py-1.5 text-right tick">{s.risk_score}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${chip(s.signal)}`}>{s.signal}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SectorChart series={p.series} range={range} onRange={setRange} legend={p.legend} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <MiniTable
              title="TREND ANALYSIS"
              rows={stocks.map((s) => [
                s.symbol,
                usd(s.emas.ema20),
                usd(s.emas.ema50),
                usd(s.emas.ema200),
                s.trend.alignment,
              ])}
              cols={["Stock", "20 EMA", "50 EMA", "200 EMA", "Trend"]}
            />
            <MiniTable
              title="MOMENTUM"
              rows={stocks.map((s) => [
                s.symbol,
                s.momentum.rsi != null ? s.momentum.rsi.toFixed(0) : "—",
                s.momentum.macd_label || "—",
                pct(s.momentum.roc),
                s.momentum_label,
              ])}
              cols={["Stock", "RSI", "MACD", "ROC", "Signal"]}
              tips={stocks.map((s) => rsiHint(s.momentum.rsi))}
            />
            <MiniTable
              title="VOLUME INTELLIGENCE"
              rows={stocks.map((s) => [
                s.symbol,
                compact(s.volume.volume),
                s.volume.relative_volume != null ? `${s.volume.relative_volume.toFixed(2)}x` : "—",
                s.volume.confirm,
              ])}
              cols={["Stock", "Volume", "Rel Vol", "Read"]}
            />
            <MiniTable
              title="VOLATILITY"
              rows={stocks.map((s) => [
                s.symbol,
                s.volatility.atr_pct != null ? `${s.volatility.atr_pct.toFixed(2)}%` : "—",
                s.volatility.hv20 != null ? `${s.volatility.hv20.toFixed(0)}%` : "—",
                s.volatility.label || "—",
              ])}
              cols={["Stock", "ATR %", "20D Vol", "Risk"]}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-3">
            <div className="panel overflow-x-auto">
              <div className="px-4 py-3 text-[11px] tracking-[0.18em] text-slate-500">PERFORMANCE MATRIX</div>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-1">Stock</th>
                    {["today", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"].map((c) => (
                      <th key={c} className="text-right px-3 py-1">
                        {c === "today" ? "Today" : c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => (
                    <tr key={s.symbol} className="border-t border-white/5">
                      <td className="px-3 py-1.5 font-semibold">{s.symbol}</td>
                      {["today", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"].map((c) => {
                        const v = s.performance[c];
                        return (
                          <td key={c} className={`px-3 py-1.5 text-right tick ${(v || 0) >= 0 ? "text-bull" : "text-bear"}`}>
                            {pct(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel overflow-x-auto">
              <div className="px-4 py-3 text-[11px] tracking-[0.18em] text-slate-500">RELATIVE STRENGTH · 1M vs SPY / QQQ / Nasdaq / sector basket</div>
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-1">Stock</th>
                    <th className="text-right px-3 py-1">vs SPY</th>
                    <th className="text-right px-3 py-1">vs QQQ</th>
                    <th className="text-right px-3 py-1">vs Nasdaq</th>
                    <th className="text-right px-3 py-1">vs Sector EW</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => (
                    <tr key={s.symbol} className="border-t border-white/5">
                      <td className="px-3 py-1.5 font-semibold">{s.symbol}</td>
                      <RsCell v={s.momentum.rs_spy} />
                      <RsCell v={s.momentum.rs_qqq} />
                      <RsCell v={s.momentum.rs_ndx} />
                      <RsCell v={s.momentum.rs_mag7} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel overflow-x-auto">
            <div className="px-4 py-3 text-[11px] tracking-[0.18em] text-slate-500">LEADERBOARD</div>
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  {["Rank", "Stock", "Score", "Trend", "Momentum", "Volume", "Volatility", "1M"].map((h) => (
                    <th key={h} className={`px-3 py-1 ${h === "Rank" || h === "Stock" ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.leaderboard.map((r) => (
                  <tr key={r.symbol} className="border-t border-white/5 cursor-pointer hover:bg-white/5" onClick={() => setSelected(r.symbol)}>
                    <td className="px-3 py-1.5">{r.rank}</td>
                    <td className="px-3 py-1.5 font-semibold">{r.symbol}</td>
                    <td className="px-3 py-1.5 text-right tick">{r.strength}</td>
                    <td className={`px-3 py-1.5 text-right ${tone(r.trend)}`}>{r.trend}</td>
                    <td className="px-3 py-1.5 text-right">{r.momentum}</td>
                    <td className="px-3 py-1.5 text-right">{r.volume}</td>
                    <td className="px-3 py-1.5 text-right">{r.volatility}</td>
                    <td className={`px-3 py-1.5 text-right tick ${(r.perf_1m || 0) >= 0 ? "text-bull" : "text-bear"}`}>{pct(r.perf_1m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pick && <Detail stock={pick} />}
        </>
      )}
    </div>
  );
}

function TfBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-[11px] border ${active ? "border-accent/50 bg-accent/15 text-white" : "border-line text-slate-400"}`}
    >
      {label}
    </button>
  );
}

function ContextStrip({ ctx, etf }: { ctx: Mag7PayloadContext; etf: string }) {
  const items: [string, Mag7PayloadContext[string]][] = [
    ["SPY", ctx.SPY],
    ["QQQ", ctx.QQQ],
    [etf || "ETF", ctx[etf] || ctx.SOXX],
    ["VIX", ctx.VIX],
    ["10Y", ctx.US10Y],
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1.5">
          <span className="text-slate-500">{k}</span>
          <span className="tick text-white">{v?.price != null ? (k === "10Y" ? `${v.price.toFixed(2)}%` : k === "VIX" ? v.price.toFixed(1) : usd(v.price)) : "—"}</span>
          {v?.change_percent != null && <span className={(v.change_percent || 0) >= 0 ? "text-bull" : "text-bear"}>{pct(v.change_percent)}</span>}
        </div>
      ))}
    </div>
  );
}

type Mag7PayloadContext = Record<string, { price?: number | null; change_percent?: number | null } | undefined>;

function BestFor({ cats, stocks }: { cats: Record<string, string | null>; stocks: Mag7Stock[] }) {
  const by = useMemo(() => Object.fromEntries(stocks.map((s) => [s.symbol, s])), [stocks]);
  const items = [
    ["Best Overall", cats.best_overall],
    ["Best Momentum", cats.best_momentum],
    ["Best Trend", cats.best_trend],
    ["Best Volume", cats.best_volume],
    ["Lowest Volatility", cats.lowest_volatility],
    ["Best 1M", cats.best_1m],
    ["Best 1Y", cats.best_1y],
    ["Highest Risk", cats.highest_risk],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
      {items.map(([label, sym]) => (
        <div key={label} className="panel px-3 py-2">
          <div className="text-[10px] text-slate-500">{label}</div>
          <div className="font-semibold">{sym || "—"}</div>
          <div className="text-[10px] text-slate-500">{sym && by[sym] ? `${by[sym].strength}/100` : ""}</div>
        </div>
      ))}
    </div>
  );
}

function MiniTable({
  title,
  cols,
  rows,
  tips,
}: {
  title: string;
  cols: string[];
  rows: (string | number)[][];
  tips?: string[];
}) {
  return (
    <div className="panel overflow-x-auto">
      <div className="px-3 py-2 text-[11px] tracking-[0.18em] text-slate-500">{title}</div>
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            {cols.map((c) => (
              <th key={c} className={`px-2 py-1 ${c === cols[0] ? "text-left" : "text-right"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r[0])} className="border-t border-white/5" title={tips?.[i]}>
              {r.map((cell, j) => (
                <td key={j} className={`px-2 py-1.5 ${j === 0 ? "text-left font-semibold" : "text-right tick"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RsCell({ v }: { v?: number | null }) {
  return <td className={`px-3 py-1.5 text-right tick ${(v || 0) >= 0 ? "text-bull" : "text-bear"}`}>{v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}</td>;
}

function Detail({ stock }: { stock: Mag7Stock }) {
  const stars = "★".repeat(Math.max(1, Math.round(stock.strength / 20))) + "☆".repeat(Math.max(0, 5 - Math.round(stock.strength / 20)));
  return (
    <div className="panel p-4 space-y-3" data-testid="sector-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.18em] text-slate-500">SELECTED STOCK ANALYSIS</div>
          <h2 className="text-lg font-semibold">
            {stock.symbol} · {stock.name}
          </h2>
          <div className="tick text-xl">
            {usd(stock.price)} <span className={(stock.change_percent || 0) >= 0 ? "text-bull text-sm" : "text-bear text-sm"}>{pct(stock.change_percent)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm">
            Strength <span className="font-semibold">{stock.strength}/100</span> · Risk <span className="font-semibold">{stock.risk_score}/100</span>
          </div>
          <div className="text-warn text-sm">{stars}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        {[
          ["Trend", stock.components.trend, 25],
          ["Momentum", stock.components.momentum, 25],
          ["Volume", stock.components.volume, 15],
          ["Volatility", stock.components.volatility, 15],
          ["Performance", stock.components.performance, 20],
        ].map(([label, val, max]) => (
          <div key={String(label)}>
            <div className="text-slate-500 flex justify-between">
              <span>{label}</span>
              <span className="tick">
                {val}/{max}
              </span>
            </div>
            <Bar value={Number(val)} max={Number(max)} />
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <Stat label="20 EMA" value={usd(stock.emas.ema20)} />
        <Stat label="50 EMA" value={usd(stock.emas.ema50)} />
        <Stat label="100 EMA" value={usd(stock.emas.ema100)} />
        <Stat label="200 EMA" value={usd(stock.emas.ema200)} />
        <Stat label="RSI" value={stock.momentum.rsi != null ? stock.momentum.rsi.toFixed(1) : "—"} hint={rsiHint(stock.momentum.rsi)} />
        <Stat label="MACD" value={stock.momentum.macd_label || "—"} />
        <Stat label="ATR" value={stock.volatility.atr != null ? usd(stock.volatility.atr) : "—"} />
        <Stat label="ATR %" value={stock.volatility.atr_pct != null ? `${stock.volatility.atr_pct.toFixed(2)}%` : "—"} />
        <Stat label="Rel Vol" value={stock.volume.relative_volume != null ? `${stock.volume.relative_volume.toFixed(2)}x` : "—"} />
        <Stat label="20D Vol" value={stock.volatility.hv20 != null ? `${stock.volatility.hv20.toFixed(1)}%` : "—"} />
        <Stat label="30D Vol" value={stock.volatility.hv30 != null ? `${stock.volatility.hv30.toFixed(1)}%` : "—"} />
        <Stat label="60D Vol" value={stock.volatility.hv60 != null ? `${stock.volatility.hv60.toFixed(1)}%` : "—"} />
      </div>
      {stock.crosses.length > 0 && <div className="text-xs text-slate-400">Crosses: {stock.crosses.join(" · ")}</div>}
      <div className="text-sm text-slate-300 leading-relaxed">
        <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-1">WHY</div>
        {stock.why}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-slate-500">{label}</div>
      <div className="tick text-white">{value}</div>
    </div>
  );
}
