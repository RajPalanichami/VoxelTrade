"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, keys } from "@/lib/api";
import { money, pct, usd } from "@/lib/format";
import {
  DEFAULT_OPPORTUNITY_SETTINGS,
  DEFAULT_OPPORTUNITY_UNIVERSE,
  mergeOpportunitySettings,
  parseOpportunityUniverse,
  parsePastedTickers,
  type OpportunityPayload,
  type OpportunitySettings,
  type OpportunityState,
} from "@/lib/opportunity";
import type { OpportunityRow } from "@/src/engines/opportunityEngine";
import { OpportunityChart } from "./OpportunityCharts";

const LS_UNIVERSE = "voxel:opportunity:universe";
const LS_SETTINGS = "voxel:opportunity:settings";

const STATE_STYLE: Record<OpportunityState, string> = {
  DEVELOPING: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "PRE-BREAKOUT": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  TRIGGERED: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  CONFIRMED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  RETEST: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  ACTIVE: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  "NO TRADE": "bg-slate-500/15 text-slate-300 border-slate-500/30",
  "INSUFFICIENT DATA": "bg-orange-500/15 text-orange-300 border-orange-500/30",
};

type SortKey =
  | "technicalQuality"
  | "tradeReadiness"
  | "rr"
  | "rs"
  | "volume"
  | "distanceToResistancePct"
  | "catalyst"
  | "state";

const RS_RANK: Record<string, number> = { Strong: 5, Improving: 4, Neutral: 3, Weakening: 2, Weak: 1 };
const CAT_RANK: Record<string, number> = { Positive: 3, Neutral: 2, None: 1, Negative: 0 };

function formatEtClock(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d) + " ET";
}

function readLocalUniverse(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_UNIVERSE);
    if (!raw) return null;
    const parsed = parseOpportunityUniverse(JSON.parse(raw));
    return parsed.tickers.length ? parsed.tickers : null;
  } catch {
    return null;
  }
}

function writeLocalUniverse(tickers: string[]) {
  try {
    localStorage.setItem(LS_UNIVERSE, JSON.stringify(tickers));
  } catch {
    /* ignore */
  }
}

function readLocalSettings(): OpportunitySettings | null {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    return raw ? mergeOpportunitySettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function OpportunityMonitor() {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [slots, setSlots] = useState<string[]>([...DEFAULT_OPPORTUNITY_UNIVERSE]);
  const [paste, setPaste] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showAllWatch, setShowAllWatch] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("technicalQuality");
  const [selected, setSelected] = useState<string | null>(null);
  const [scoreOpen, setScoreOpen] = useState<"breakout" | "swing" | null>(null);
  const [mounted, setMounted] = useState(false);
  const [localSettings, setLocalSettings] = useState<OpportunitySettings>(DEFAULT_OPPORTUNITY_SETTINGS);
  const [universe, setUniverse] = useState<string[]>([...DEFAULT_OPPORTUNITY_UNIVERSE]);

  const settingsKey = JSON.stringify(localSettings);
  const query = useQuery({
    queryKey: keys.opportunity(universe, settingsKey),
    queryFn: () => api.opportunity({ tickers: universe, settings: localSettings }),
    staleTime: 30_000,
    refetchInterval: 90_000,
    retry: 1,
  });
  const payload = query.data?.data as OpportunityPayload | undefined;

  useEffect(() => {
    setMounted(true);
    const storedUniverse = readLocalUniverse();
    if (storedUniverse) setUniverse(storedUniverse);
    const local = readLocalSettings();
    if (local) setLocalSettings(local);
    api.opportunityUniverse()
      .then((res) => {
        if (res.data?.tickers?.length) {
          setUniverse(res.data.tickers);
          writeLocalUniverse(res.data.tickers);
        }
        if (res.data?.settings) {
          const merged = mergeOpportunitySettings(res.data.settings);
          setLocalSettings(merged);
          try {
            localStorage.setItem(LS_SETTINGS, JSON.stringify(merged));
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        const fallback = readLocalUniverse();
        if (fallback) setUniverse(fallback);
      });
  }, []);

  const saveUniverse = useMutation({
    mutationFn: async (tickers: string[]) => {
      const checked = await api.validateOpportunityUniverse(tickers);
      if (checked.data.errors.length && !checked.data.tickers.length) {
        throw new Error(checked.data.errors[0]);
      }
      if (checked.data.errors[0]) throw new Error(checked.data.errors[0]);
      await api.saveOpportunityUniverse(checked.data.tickers, localSettings);
      return checked.data.tickers;
    },
    onSuccess: (tickers) => {
      setUniverse(tickers);
      writeLocalUniverse(tickers);
      setEditorOpen(false);
      setEditorError(null);
      qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
    onError: (err: Error) => setEditorError(err.message),
  });

  const resetUniverse = useMutation({
    mutationFn: async () => {
      await api.resetOpportunityUniverse();
      return [...DEFAULT_OPPORTUNITY_UNIVERSE];
    },
    onSuccess: (tickers) => {
      setUniverse(tickers);
      setSlots(tickers);
      writeLocalUniverse(tickers);
      setEditorOpen(false);
      qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (next: OpportunitySettings) => {
      await api.saveOpportunitySettings(next);
      return next;
    },
    onSuccess: (next) => {
      setLocalSettings(next);
      try {
        localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["opportunity"] });
    },
  });

  const rows = payload?.rows || [];
  const selectedRow = rows.find((r) => r.symbol === selected) || null;
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "technicalQuality") return (b.technicalQuality ?? -1) - (a.technicalQuality ?? -1);
      if (sortKey === "tradeReadiness") return (b.overallOpportunity ?? -1) - (a.overallOpportunity ?? -1);
      if (sortKey === "rs") return (RS_RANK[b.rs] || 0) - (RS_RANK[a.rs] || 0);
      if (sortKey === "rr") return (b.rr ?? -1) - (a.rr ?? -1);
      if (sortKey === "distanceToResistancePct") return (a.distanceToResistancePct ?? 99) - (b.distanceToResistancePct ?? 99);
      if (sortKey === "catalyst") return (CAT_RANK[b.catalyst] || 0) - (CAT_RANK[a.catalyst] || 0);
      if (sortKey === "volume") return a.volume.localeCompare(b.volume);
      return a.state.localeCompare(b.state);
    });
    return copy;
  }, [rows, sortKey]);

  const watchRows = showAllWatch ? sorted.filter((r) => r.bucket === "BREAKOUT_WATCH" || ["PRE-BREAKOUT", "TRIGGERED", "CONFIRMED", "RETEST"].includes(r.state)) : sorted.filter((r) => r.bucket === "BREAKOUT_WATCH");
  const technicalWatch = sorted.filter((r) => r.bucket === "TECHNICAL_WATCH");
  const noTradeRows = sorted.filter((r) => r.bucket === "NO_TRADE");
  const swingRows = sorted.filter((r) => (r.swingScore ?? 0) >= 50 && r.state !== "INSUFFICIENT DATA" && r.state !== "NO TRADE");

  const source = payload?.universe.source || (universe.join() === DEFAULT_OPPORTUNITY_UNIVERSE.join() ? "default" : "custom");

  return (
    <div className="p-4 space-y-4 pb-16" data-testid="opportunity-monitor">
      <header className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Opportunity Monitor</h1>
            <div className="text-sm text-slate-400 mt-0.5">20-Ticker Breakout & 2–3 Week Swing Opportunity Engine</div>
            <p className="text-sm text-slate-500 mt-2 max-w-3xl">
              Monitor technical structure, momentum, VWAP, volume, catalysts, relative strength and risk/reward across your selected universe.
            </p>
          </div>
          <div className="text-right text-xs space-y-1 text-slate-400">
            <div>Universe: {universe.length} / 20</div>
            <div>Last Updated: {mounted ? formatEtClock(payload?.lastUpdated) : "—"}</div>
            <div>
              Market Status:{" "}
              <span className={payload?.marketStatus.state === "OPEN" ? "text-bull" : "text-warn"}>
                {payload?.marketStatus.state || "—"}
              </span>
            </div>
            <div>
              Data Status:{" "}
              <span className={payload?.dataStatus === "LIVE" ? "text-bull" : payload?.dataStatus === "STALE" ? "text-warn" : "text-bear"}>
                {payload?.dataStatus || (query.isLoading ? "LOADING" : "—")}
              </span>
            </div>
            {payload?.marketStatus.state === "CLOSED" && (
              <div className="text-slate-500">Using latest available market data</div>
            )}
          </div>
        </div>
      </header>

      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.16em] text-slate-500">STOCK UNIVERSE</div>
            <div className="text-sm mt-1">
              {source === "default" ? "Default Universe" : "Active Universe: Custom"} · {universe.length} / 20 stocks
            </div>
            <div className="text-xs text-slate-500 mt-1 max-w-3xl">{universe.join(" · ")}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-1.5 text-sm rounded-md border border-line hover:border-accent/50"
              onClick={() => {
                setSlots([...universe, ...Array(Math.max(0, 20 - universe.length)).fill("")].slice(0, 20));
                setPaste("");
                setEditorError(null);
                setEditorOpen(true);
              }}
            >
              Edit Universe
            </button>
            <button className="px-3 py-1.5 text-sm rounded-md border border-line hover:border-accent/50" onClick={() => resetUniverse.mutate()}>
              Restore Default 20
            </button>
            <button className="px-3 py-1.5 text-sm rounded-md bg-accent/20 border border-accent/40" onClick={() => query.refetch()}>
              Analyze Universe
            </button>
          </div>
        </div>
      </section>

      {query.isLoading && !payload && (
        <div className="panel p-10 text-center text-slate-400">Reading structure, VWAP, volume and relative strength across the universe…</div>
      )}
      {query.error && !payload && (
        <div className="panel p-6 text-bear text-sm">
          Market data is currently unavailable. No technical conclusions were generated. {(query.error as Error).message}
        </div>
      )}
      {!query.isLoading && !universe.length && (
        <div className="panel p-6 text-warn">Add at least one ticker to begin analysis.</div>
      )}

      {payload && (
        <>
          <section className="panel p-4">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">MARKET REGIME</div>
            <div className="flex flex-wrap items-end justify-between gap-3 mt-2">
              <div>
                <div className={`text-2xl font-semibold ${payload.regime.label === "BULLISH" ? "text-bull" : payload.regime.label === "BEARISH" ? "text-bear" : "text-warn"}`}>
                  {payload.regime.label} · {payload.regime.risk}
                </div>
                <p className="text-sm text-slate-400 mt-1 max-w-2xl">{payload.regime.explanation}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
              {(
                [
                  ["SPY", payload.regime.spy],
                  ["QQQ", payload.regime.qqq],
                  ["IWM", payload.regime.iwm],
                ] as [string, typeof payload.regime.spy][]
              ).map(([label, pack]) => (
                <div key={label} className="rounded-md border border-line/40 p-3">
                  <div className="text-slate-500 text-xs">{label}</div>
                  <div>Trend: {pack.trend}</div>
                  <div>Price vs 20 EMA: {pack.vs20}</div>
                  <div>Price vs 50 EMA: {pack.vs50}</div>
                </div>
              ))}
              <div className="rounded-md border border-line/40 p-3">
                <div className="text-slate-500 text-xs">VIX</div>
                <div>Trend: {payload.regime.vix.trend}</div>
                <div>Risk Environment: {payload.regime.vix.risk}</div>
                <div>Level: {payload.regime.vix.price != null ? money(payload.regime.vix.price) : "—"}</div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {[
              [payload.summary.monitored, "Stocks Monitored"],
              [payload.summary.preBreakout, "Pre-Breakout"],
              [payload.summary.triggered, "Triggered"],
              [payload.summary.confirmed, "Confirmed"],
              [payload.summary.retest, "Retest"],
              [payload.summary.developing, "Developing"],
              [payload.summary.noTrade, "No Trade"],
              [payload.summary.insufficient, "Insufficient Data"],
            ].map(([n, label]) => (
              <div key={String(label)} className="panel p-3">
                <div className="text-2xl font-semibold">{n}</div>
                <div className="text-[11px] text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </section>

          <section className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-[11px] tracking-[0.16em] text-slate-500">OPPORTUNITY RADAR</div>
                <h2 className="text-lg font-semibold">Primary Table</h2>
              </div>
              <label className="text-sm text-slate-400 flex items-center gap-2">
                Sort
                <select
                  className="bg-panel2 border border-line/50 rounded px-2 py-1 text-slate-200"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="technicalQuality">Technical Quality</option>
                  <option value="tradeReadiness">Trade Readiness</option>
                  <option value="rs">Relative Strength</option>
                  <option value="volume">Volume</option>
                  <option value="rr">R:R</option>
                  <option value="distanceToResistancePct">Distance to Resistance</option>
                  <option value="catalyst">Catalyst</option>
                  <option value="state">State</option>
                </select>
              </label>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] tracking-[0.12em] text-slate-500">
                  <tr className="border-b border-line/40">
                    {["Ticker", "Price", "State", "Structure", "Resistance", "VWAP", "Volume", "RS", "Catalyst", "R:R", "Technical", "Ready"].map((h) => (
                      <th key={h} className="text-left font-medium py-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr
                      key={row.symbol}
                      className="border-b border-line/20 hover:bg-white/5 cursor-pointer"
                      onClick={() => setSelected(row.symbol)}
                    >
                      <td className="py-2 pr-3 font-semibold">{row.symbol}</td>
                      <td className="pr-3">{usd(row.price)} <span className="text-slate-500">{pct(row.changePct)}</span></td>
                      <td className="pr-3"><StateBadge state={row.state} /></td>
                      <td className="pr-3">{row.mtf.find((t) => t.timeframe === "1d")?.structure || "—"}</td>
                      <td className="pr-3">{row.resistance != null ? usd(row.resistance) : "INSUFFICIENT DATA"}</td>
                      <td className="pr-3">{row.vwapDetail?.alignment || row.vwap}</td>
                      <td className="pr-3">{row.volumeDetail?.rvol != null ? `${row.volumeDetail.rvol.toFixed(2)}x · ${row.volumeDetail.breakoutVolume === "NOT YET CONFIRMED" ? "Vol not confirmed" : row.volumeDetail.breakoutVolume}` : row.volume}</td>
                      <td className="pr-3">{row.rs}{row.rsDetail?.spy20 != null ? ` ${row.rsDetail.spy20 > 0 ? "+" : ""}${row.rsDetail.spy20.toFixed(1)}%` : ""}</td>
                      <td className="pr-3">{row.catalyst}</td>
                      <td className="pr-3">{row.rrLabel}</td>
                      <td className="pr-3">{row.technicalQuality ?? "—"}</td>
                      <td className="pr-3">{row.tradeReadiness}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {sorted.map((row) => (
                <button
                  key={row.symbol}
                  className="w-full text-left panel p-3"
                  onClick={() => setSelected(row.symbol)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{row.symbol}</div>
                    <StateBadge state={row.state} />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Swing Score: {row.swingScore ?? "—"} · VWAP: {row.vwap} · Volume: {row.volume}
                  </div>
                  <div className="text-xs text-slate-400">RS: {row.rs} · {row.rrLabel}</div>
                  <div className="text-xs text-accent mt-1">View Details</div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-[11px] tracking-[0.16em] text-slate-500">BREAKOUT WATCH</div>
                <h2 className="text-lg font-semibold">Actionable setups only (R:R and quality gates applied)</h2>
              </div>
              <label className="text-xs text-slate-400 flex items-center gap-2">
                <input type="checkbox" checked={showAllWatch} onChange={(e) => setShowAllWatch(e.target.checked)} />
                Show All
              </label>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {watchRows.length ? watchRows.map((row) => (
                <button key={row.symbol} className="text-left rounded-md border border-line/40 p-3 hover:border-accent/40" onClick={() => setSelected(row.symbol)}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{row.symbol}</div>
                    <StateBadge state={row.state} />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Tech {row.technicalQuality} · Ready {row.tradeReadiness} · {row.rrLabel}</div>
                  <div className="text-xs text-slate-500">{row.volumeDetail?.trend || row.volume} · Breakout vol: {row.volumeDetail?.breakoutVolume || "NOT YET CONFIRMED"}</div>
                </button>
              )) : <div className="text-sm text-slate-500">No setups currently clear the breakout-watch gates.</div>}
            </div>
          </section>

          <section className="panel p-4">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">TECHNICAL WATCH — POOR R:R OR MISSING ENTRY</div>
            <h2 className="text-lg font-semibold mb-3">Technically interesting, not trade-ready</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {technicalWatch.length ? technicalWatch.map((row) => (
                <button key={row.symbol} className="text-left rounded-md border border-warn/30 p-3" onClick={() => setSelected(row.symbol)}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{row.symbol}</div>
                    <span className="text-[10px] text-warn">{row.tradeReadiness}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Technical {row.technicalQuality} · {row.rrLabel}</div>
                  <div className="text-xs text-slate-500 mt-1">{row.rrReason}</div>
                </button>
              )) : <div className="text-sm text-slate-500">No technical-watch names right now.</div>}
            </div>
          </section>

          <section className="panel p-4">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">NO TRADE</div>
            <div className="text-sm text-slate-400 mt-2">{noTradeRows.length ? noTradeRows.map((r) => r.symbol).join(" · ") : "None"}</div>
          </section>

          <section className="panel p-4">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">2–3 WEEK SWING OPPORTUNITY ENGINE</div>
            <h2 className="text-lg font-semibold mb-3">Swing opportunity view — not an investment ranking</h2>
            <div className="grid lg:grid-cols-2 gap-3">
              {swingRows.length ? swingRows.map((row) => (
                <article key={row.symbol} className="rounded-md border border-line/40 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{row.symbol} · {usd(row.price)}</div>
                      <div className="text-xs text-slate-500">Daily {row.mtf.find((t) => t.timeframe === "1d")?.trend} · Weekly {row.mtf.find((t) => t.timeframe === "1w")?.trend}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-semibold">{row.swingScore}</div>
                      <StateBadge state={row.state} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mt-2">
                    <div>Catalyst: {row.catalyst}</div>
                    <div>RS: {row.rs} / Sector {row.sectorRs}</div>
                    <div>Entry: {usd(row.entry)}</div>
                    <div>Invalidation: {usd(row.stop)}</div>
                    <div>T1 / T2: {usd(row.t1)} / {usd(row.t2)}</div>
                    <div>{row.rrLabel}</div>
                  </div>
                  <div className="text-xs mt-2"><span className="text-slate-500">Why now:</span> {row.whyNow[0]}</div>
                  <div className="text-xs mt-1"><span className="text-slate-500">Next:</span> {row.nextTrigger}</div>
                  <div className="text-xs mt-1"><span className="text-slate-500">Invalidate:</span> {row.invalidation}</div>
                  <button className="text-xs text-accent mt-2" onClick={() => setSelected(row.symbol)}>Open detail</button>
                </article>
              )) : <div className="text-sm text-slate-500">No 2–3 week swing candidates currently meet the technical bar.</div>}
            </div>
          </section>

          <section className="panel p-4">
            <div className="text-[11px] tracking-[0.16em] text-slate-500">ALERTS / MONITORING</div>
            <div className="mt-2 space-y-1 text-sm">
              {payload.alerts.length ? payload.alerts.slice(0, 12).map((a, i) => (
                <div key={`${a.symbol}-${a.type}-${i}`} className="text-slate-300">
                  <span className="text-slate-500">{a.symbol}</span> · {a.message}
                </div>
              )) : <div className="text-slate-500">No active alerts for the current universe.</div>}
            </div>
          </section>

          <section className="panel p-4">
            <button className="text-sm text-slate-300" onClick={() => setSettingsOpen((v) => !v)}>
              Strategy Settings {settingsOpen ? "▾" : "▸"}
            </button>
            {settingsOpen && (
              <div className="grid md:grid-cols-3 gap-3 mt-3 text-sm">
                <NumField label="Breakout proximity %" value={localSettings.breakoutProximityPct} onChange={(v) => setLocalSettings({ ...localSettings, breakoutProximityPct: v })} />
                <NumField label="Minimum relative volume" value={localSettings.minRelVolume} onChange={(v) => setLocalSettings({ ...localSettings, minRelVolume: v })} />
                <NumField label="Minimum R:R" value={localSettings.minRR} onChange={(v) => setLocalSettings({ ...localSettings, minRR: v })} />
                <NumField label="RSI max" value={localSettings.rsiMax} onChange={(v) => setLocalSettings({ ...localSettings, rsiMax: v })} />
                <NumField label="ADX threshold" value={localSettings.adxThreshold} onChange={(v) => setLocalSettings({ ...localSettings, adxThreshold: v })} />
                <NumField label="News lookback (hours)" value={localSettings.newsLookbackHours} onChange={(v) => setLocalSettings({ ...localSettings, newsLookbackHours: v })} />
                <NumField label="Earnings warning (days)" value={localSettings.earningsWarnDays} onChange={(v) => setLocalSettings({ ...localSettings, earningsWarnDays: v })} />
                <NumField label="Overextension %" value={localSettings.overextensionPct} onChange={(v) => setLocalSettings({ ...localSettings, overextensionPct: v })} />
                <NumField label="Minimum technical score" value={localSettings.minTechnicalScore} onChange={(v) => setLocalSettings({ ...localSettings, minTechnicalScore: v })} />
                <NumField label="Minimum resistance tests" value={localSettings.minResistanceTests} onChange={(v) => setLocalSettings({ ...localSettings, minResistanceTests: v })} />
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={localSettings.requireVwapSupport} onChange={(e) => setLocalSettings({ ...localSettings, requireVwapSupport: e.target.checked })} />
                  Require VWAP support
                </label>
                <label>
                  Confirmation TF
                  <select
                    className="w-full mt-1 bg-panel2 border border-line/50 rounded px-2 py-1"
                    value={localSettings.confirmTimeframe}
                    onChange={(e) => setLocalSettings({ ...localSettings, confirmTimeframe: e.target.value as "15m" | "30m" })}
                  >
                    <option value="30m">30m</option>
                    <option value="15m">15m</option>
                  </select>
                </label>
                <div className="md:col-span-3 flex gap-2">
                  <button className="px-3 py-1.5 rounded-md bg-accent/20 border border-accent/40" onClick={() => saveSettings.mutate(localSettings)}>
                    Save Settings
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-md border border-line"
                    onClick={() => {
                      setLocalSettings(DEFAULT_OPPORTUNITY_SETTINGS);
                      saveSettings.mutate(DEFAULT_OPPORTUNITY_SETTINGS);
                    }}
                  >
                    Reset to Default Settings
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex">
          <button className="flex-1 bg-black/60" aria-label="Close universe editor" onClick={() => setEditorOpen(false)} />
          <aside className="w-full max-w-lg h-full bg-navy border-l border-line overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit Universe</h2>
              <button onClick={() => setEditorOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mt-1">1–20 tickers. Duplicates and invalid symbols are rejected.</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {slots.map((value, i) => (
                <label key={i} className="text-xs text-slate-500">
                  {i + 1}.
                  <input
                    className="w-full mt-1 bg-panel2 border border-line/50 rounded px-2 py-1 text-sm text-slate-100"
                    value={value}
                    onChange={(e) => {
                      const next = [...slots];
                      next[i] = e.target.value.toUpperCase();
                      setSlots(next);
                    }}
                  />
                </label>
              ))}
            </div>
            <textarea
              className="w-full mt-3 bg-panel2 border border-line/50 rounded px-2 py-2 text-sm"
              rows={3}
              placeholder="Paste multiple tickers"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                className="px-3 py-1.5 text-sm border border-line rounded"
                onClick={() => {
                  const pasted = parsePastedTickers(paste);
                  if (!pasted.length) return;
                  setSlots([...pasted, ...Array(Math.max(0, 20 - pasted.length)).fill("")].slice(0, 20));
                }}
              >
                Apply Paste
              </button>
              <button
                className="px-3 py-1.5 text-sm border border-line rounded"
                onClick={() => {
                  const filled = slots.map((s) => s.trim()).filter(Boolean);
                  const i = filled.length ? slots.findIndex((s) => s.trim() === filled[filled.length - 1]) : 0;
                  if (i <= 0) return;
                  const next = [...slots];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setSlots(next);
                }}
              >
                Move Last Up
              </button>
              <button className="px-3 py-1.5 text-sm border border-line rounded" onClick={() => setSlots(Array(20).fill(""))}>
                Clear
              </button>
            </div>
            {editorError && <div className="text-sm text-bear mt-3">{editorError}</div>}
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                className="px-3 py-1.5 rounded-md bg-accent/20 border border-accent/40"
                disabled={saveUniverse.isPending}
                onClick={() => {
                  const parsed = parseOpportunityUniverse(slots);
                  if (parsed.errors[0]) {
                    setEditorError(parsed.errors[0]);
                    return;
                  }
                  saveUniverse.mutate(parsed.tickers);
                }}
              >
                Save Universe
              </button>
              <button className="px-3 py-1.5 rounded-md border border-line" onClick={() => resetUniverse.mutate()}>
                Reset to Default
              </button>
              <button className="px-3 py-1.5 rounded-md border border-line" onClick={() => setEditorOpen(false)}>
                Cancel
              </button>
            </div>
          </aside>
        </div>
      )}

      {selectedRow && (
        <DetailDrawer
          row={selectedRow}
          scoreOpen={scoreOpen}
          onScore={setScoreOpen}
          onClose={() => {
            setSelected(null);
            setScoreOpen(null);
          }}
        />
      )}
    </div>
  );
}

function StateBadge({ state }: { state: OpportunityState }) {
  return <span className={`text-[10px] px-2 py-0.5 rounded border ${STATE_STYLE[state]}`}>{state}</span>;
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label>
      {label}
      <input
        type="number"
        className="w-full mt-1 bg-panel2 border border-line/50 rounded px-2 py-1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function DetailDrawer({
  row,
  scoreOpen,
  onScore,
  onClose,
}: {
  row: OpportunityRow;
  scoreOpen: "breakout" | "swing" | null;
  onScore: (v: "breakout" | "swing" | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button className="flex-1 bg-black/50" aria-label="Close details" onClick={onClose} />
      <aside className="w-full max-w-xl h-full bg-navy border-l border-line overflow-y-auto p-4 space-y-4" data-testid="opportunity-drawer">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-2xl font-semibold">{row.symbol}</div>
            <div className="text-sm text-slate-400">{row.name} · {usd(row.price)} {pct(row.changePct)}</div>
            <div className="mt-1 flex flex-wrap gap-2 items-center">
              <StateBadge state={row.state} />
              <span className="text-xs text-slate-400">Ready: {row.tradeReadiness}</span>
              <span className="text-xs text-slate-500">{row.bucket.replaceAll("_", " ")}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {row.error && (
          <div className="panel p-3 text-bear text-sm">
            {row.symbol} data unavailable. {row.error}
          </div>
        )}

        <section className="panel p-3 text-sm space-y-1">
          <div>Technical Quality: {row.technicalQuality ?? "—"} · Entry Quality: {row.entryQuality ?? "—"} · Overall: {row.overallOpportunity ?? "—"}</div>
          <div>VWAP {row.vwapQuality ?? "—"} · Volume {row.volumeQuality ?? "—"} · RS {row.rsQuality ?? "—"} · Market {row.marketAlignment ?? "—"} · Catalyst {row.catalystQuality ?? "—"} · R:R {row.rrQuality ?? "—"}</div>
          <div>Sector: {row.sector.name} ({row.sector.etf || "—"}) · Alignment {row.sector.alignment} · vs SPY {row.sector.vsSpy ?? "—"} · Ticker vs sector {row.sector.tickerVsSector ?? "—"}</div>
          <div>RS vs SPY 20D: {row.rsDetail?.spy20 ?? "—"} · QQQ: {row.rsDetail?.qqq20 ?? "—"} · Sector: {row.rsDetail?.sector20 ?? "—"} · Trend {row.rsDetail?.trend}</div>
          <div>Pattern: {row.pattern ? `${row.pattern.name} · ${row.pattern.status} · ${row.pattern.bias}` : "None reported"} · Structure {row.structureBias}</div>
          <div>Earnings: {row.earnings.label} {row.earnings.risk ? <span className="text-warn font-semibold">Earnings Event Risk</span> : null} {row.earnings.insideSwing ? <span className="text-warn"> EARNINGS EVENT INSIDE SWING WINDOW</span> : null}</div>
          {row.previousEvent && (
            <div className="text-warn">Previous setup: {row.previousEvent.flag} · {row.previousEvent.reason} · {row.previousEvent.time}</div>
          )}
          <div className="text-xs text-slate-500">
            Market Data: {row.freshness.market} · News: {row.freshness.news} · Technical: {row.freshness.technical}
            {row.freshness.stale ? " · STALE DATA" : ""}
          </div>
        </section>

        <section className="panel p-3 text-sm space-y-1">
          <div className="text-[11px] tracking-[0.16em] text-slate-500">RESISTANCE / SUPPORT</div>
          <div>Immediate: {row.resistances?.immediate ? `$${row.resistances.immediate.price.toFixed(2)} · ${row.resistances.immediate.timeframe} ${row.resistances.immediate.source.replaceAll("_", " ")} · ${row.resistances.immediate.testCount} tests` : "INSUFFICIENT DATA"}</div>
          <div>30m: {row.resistances?.m30 ? `$${row.resistances.m30.price.toFixed(2)}` : "—"} · 1H: {row.resistances?.h1 ? `$${row.resistances.h1.price.toFixed(2)}` : "—"} · 4H: {row.resistances?.h4 ? `$${row.resistances.h4.price.toFixed(2)}` : "—"}</div>
          <div>Daily: {row.resistances?.daily ? `$${row.resistances.daily.price.toFixed(2)}` : "—"} · Weekly: {row.resistances?.weekly ? `$${row.resistances.weekly.price.toFixed(2)}` : "—"} · 52-week: {row.resistances?.week52 ? `$${row.resistances.week52.price.toFixed(2)}` : "—"}</div>
          <div>Support: {usd(row.support)} · Distance to resistance: {row.distanceToResistancePct != null ? `${row.distanceToResistancePct.toFixed(2)}%` : "—"}</div>
        </section>

        <section className="panel p-3 text-sm space-y-1">
          <div className="text-[11px] tracking-[0.16em] text-slate-500">VWAP</div>
          <div>{row.vwapDetail?.alignment} · Status {row.vwapDetail?.status}</div>
          <div>Price vs VWAP: {row.vwapDetail?.distancePct != null ? `${row.vwapDetail.distancePct >= 0 ? "+" : ""}${row.vwapDetail.distancePct.toFixed(2)}%` : "—"} · {row.vwapDetail?.distanceStatus}</div>
          <div>VWAP: {row.vwapDetail?.vwap != null ? usd(row.vwapDetail.vwap) : "—"} · Price: {usd(row.price)}</div>
        </section>

        <section className="panel p-3">
          <div className="text-[11px] tracking-[0.16em] text-slate-500">WHY THIS SETUP IS INTERESTING</div>
          <ul className="mt-2 space-y-1 text-sm">
            {row.whyNow.map((line) => <li key={line}>✓ {line}</li>)}
          </ul>
          {row.waiting.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-warn">
              {row.waiting.map((line) => <li key={line}>WATCH {line}</li>)}
            </ul>
          )}
        </section>

        <section className="panel p-3 text-sm">
          <div className="text-[11px] tracking-[0.16em] text-slate-500">WHAT NEEDS TO HAPPEN</div>
          <div className="mt-2">NEXT TRIGGER</div>
          <p className="text-slate-300 mt-1">{row.nextTrigger}</p>
          <div className="text-slate-500 mt-2">If triggered: Monitor breakout/retest entry.</div>
          <div className="mt-2">What would invalidate it: {row.invalidation}</div>
        </section>

        <section className="panel p-3 text-sm grid grid-cols-2 gap-2">
          <div>Potential Entry: {usd(row.entry)} <span className="text-slate-500">{row.entrySource}</span></div>
          <div>Stop / Invalidation: {usd(row.stop)} <span className="text-slate-500">{row.stopSource}</span></div>
          <div>T1: {usd(row.t1)} <span className="text-slate-500">{row.t1Source}</span></div>
          <div>T2: {usd(row.t2)} <span className="text-slate-500">{row.t2Source}</span></div>
          <div>T3: {usd(row.t3)} <span className="text-slate-500">{row.t3Source}</span></div>
          <div>{row.rrLabel} · {row.rrStatus}<div className="text-xs text-slate-500">{row.rrReason}</div></div>
        </section>

        <section className="panel p-3 text-sm">
          <div className="flex items-center justify-between">
            <div>Technical Quality: {row.technicalQuality ?? "—"} · {row.breakoutBand}</div>
            <button className="text-accent text-xs" onClick={() => onScore(scoreOpen === "breakout" ? null : "breakout")}>
              Why is this score {row.breakoutScore ?? "—"}?
            </button>
          </div>
          {scoreOpen === "breakout" && (
            <ul className="mt-2 text-xs space-y-1">
              {row.scoreBreakdown.map((f) => <li key={f.name}>{f.name} +{f.score}/{f.max} · {f.note}</li>)}
              {row.penalties.map((p) => <li key={p.label} className="text-bear">Penalty: -{p.points} {p.label}</li>)}
            </ul>
          )}
          <div className="flex items-center justify-between mt-3">
            <div>Swing Opportunity: {row.swingScore ?? "—"} · {row.swingBand}</div>
            <button className="text-accent text-xs" onClick={() => onScore(scoreOpen === "swing" ? null : "swing")}>
              Why is this score {row.swingScore ?? "—"}?
            </button>
          </div>
          {scoreOpen === "swing" && (
            <ul className="mt-2 text-xs space-y-1">
              {row.swingBreakdown.map((f) => <li key={f.name}>{f.name} +{f.score}/{f.max} · {f.note}</li>)}
            </ul>
          )}
        </section>

        <section className="panel p-3 overflow-x-auto">
          <div className="text-[11px] tracking-[0.16em] text-slate-500">MULTI-TIMEFRAME</div>
          <div className="text-sm mt-1">Alignment: {row.mtfAlignmentPct != null ? `${row.mtfAlignmentPct}%` : "—"} (alignment, not a probability of appreciation)</div>
          <table className="w-full text-xs mt-2">
            <thead><tr className="text-slate-500"><th className="text-left">TF</th><th className="text-left">Trend</th><th className="text-left">VWAP</th><th className="text-left">Momentum</th><th className="text-left">Structure</th></tr></thead>
            <tbody>
              {row.mtf.map((t) => (
                <tr key={t.timeframe}><td>{t.timeframe}</td><td>{t.trend}</td><td>{t.vwap}</td><td>{t.momentum}</td><td>{t.structure}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        {row.conflicts.map((c) => (
          <section key={c.status} className="panel p-3 border-warn/40">
            <div className="text-warn text-xs tracking-[0.14em]">{c.title}</div>
            <div className="font-semibold mt-1">{c.status}</div>
            <p className="text-sm text-slate-400 mt-1">{c.detail}</p>
          </section>
        ))}

        {row.overextended && (
          <section className="panel p-3 text-warn text-sm">
            OVEREXTENDED. Price is significantly extended from VWAP. Chasing risk is elevated. Preferred: wait for consolidation or a controlled pullback.
          </section>
        )}

        <section className="space-y-2">
          <OpportunityChart title="Daily" bars={row.charts["1d"] || []} resistance={row.resistance} support={row.support} entry={row.entry} stop={row.stop} t1={row.t1} />
          <OpportunityChart title="30m" bars={row.charts["30m"] || []} resistance={row.resistance} support={row.support} entry={row.entry} stop={row.stop} t1={row.t1} />
          <OpportunityChart title="15m" bars={row.charts["15m"] || []} resistance={row.resistance} support={row.support} entry={row.entry} stop={row.stop} t1={row.t1} />
          <OpportunityChart title="5m" bars={row.charts["5m"] || []} resistance={row.resistance} support={row.support} entry={row.entry} stop={row.stop} t1={row.t1} />
        </section>

        <section className="panel p-3">
          <div className="text-[11px] tracking-[0.16em] text-slate-500">NEWS / CATALYSTS</div>
          <div className="mt-2 space-y-2">
            {row.news.length ? row.news.map((n) => (
              <div key={n.headline} className="text-sm">
                <div>{n.headline}</div>
                <div className="text-xs text-slate-500">{n.source} · {n.age} · {n.category} · Sentiment {n.catalystType} · Relevance {n.relevance} · Impact {n.technicalImpact}</div>
              </div>
            )) : <div className="text-sm text-slate-500">No material recent news in the lookback window.</div>}
          </div>
        </section>

        <section className="panel p-3 text-sm">
          <div className="text-[11px] tracking-[0.16em] text-slate-500">ALERTS</div>
          {row.alerts.length ? row.alerts.map((a) => <div key={a.type}>{a.message}</div>) : <div className="text-slate-500">No ticker alerts.</div>}
        </section>
      </aside>
    </div>
  );
}
