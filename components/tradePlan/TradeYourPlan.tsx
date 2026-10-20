"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { pct, usd } from "@/lib/format";
import { useTerminal } from "@/components/layout/AppShell";
import { isTradePlanTimeframe, TRADE_PLAN_TF_LABEL, TRADE_PLAN_TIMEFRAMES, type TradePlanLevel, type TradePlanMap, type TradePlanTimeframe } from "@/lib/tradePlan";
import { TradePlanChart } from "./TradePlanChart";

const DOT: Record<string, string> = {
  BULLISH: "bg-bull",
  BEARISH: "bg-bear",
  NEUTRAL: "bg-sky-400",
  PIVOT: "bg-warn",
};

function Price({ n }: { n: number | null | undefined }) {
  return <span className="tick font-semibold tabular-nums">{n == null ? "—" : usd(n)}</span>;
}

function Spark({ values, color, mid }: { values: number[]; color: string; mid?: number }) {
  if (values.length < 2) return <div className="h-12 rounded bg-panel2" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const w = 220;
  const h = 48;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - lo) / span) * (h - 6) - 3}`).join(" ");
  const zeroY = mid != null ? h - ((mid - lo) / span) * (h - 6) - 3 : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" aria-hidden>
      {zeroY != null ? <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="rgb(148 163 184 / 0.35)" strokeDasharray="3 3" /> : null}
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={pts} />
    </svg>
  );
}

function LevelRow({ level, compact }: { level: TradePlanLevel; compact?: boolean }) {
  return (
    <div className={`flex items-start gap-2 ${compact ? "py-1" : "py-1.5"} border-b border-line/20 last:border-0`}>
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${DOT[level.tone] || "bg-slate-500"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2 text-[12px]">
          <span className="text-slate-300">
            {level.starred ? "★ " : ""}
            {level.label}
          </span>
          <Price n={level.price} />
        </div>
        {!compact ? <div className="text-[11px] text-slate-500 leading-snug">{level.meaning}</div> : null}
      </div>
    </div>
  );
}

function byPriceDesc(levels: TradePlanLevel[]) {
  return [...levels]
    .filter((l) => l.price != null)
    .sort((a, b) => (b.price || 0) - (a.price || 0))
    .filter((l, i, all) => i === 0 || Math.abs((l.price || 0) - (all[i - 1].price || 0)) > 0.01);
}

export function TradeYourPlan() {
  const { symbol, setSymbol, autoRefresh } = useTerminal();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ symbol?: string }>();
  const [tf, setTf] = useState<TradePlanTimeframe>("1h");

  useEffect(() => {
    const saved = window.sessionStorage.getItem("trade-plan-tf");
    if (saved && isTradePlanTimeframe(saved)) setTf(saved);
  }, []);
  const routeSymbol = String(params.symbol || "").toUpperCase();
  const activeSymbol = routeSymbol || symbol;

  useEffect(() => {
    if (routeSymbol && routeSymbol !== symbol) setSymbol(routeSymbol);
  }, [routeSymbol, setSymbol, symbol]);

  useEffect(() => {
    const onPick = (event: Event) => {
      const next = String((event as CustomEvent<string>).detail || "").toUpperCase();
      if (!next || !pathname.startsWith("/trade-your-plan")) return;
      const dest = `/trade-your-plan/${next}`;
      if (pathname !== dest) router.replace(dest);
    };
    window.addEventListener("voxel:symbol", onPick);
    return () => window.removeEventListener("voxel:symbol", onPick);
  }, [pathname, router]);

  useEffect(() => {
    if (!pathname.startsWith("/trade-your-plan")) return;
    if (routeSymbol) return;
    if (symbol) router.replace(`/trade-your-plan/${symbol}`);
  }, [pathname, routeSymbol, router, symbol]);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.tradePlan(activeSymbol, tf),
    queryFn: ({ signal }) => api.tradePlan(activeSymbol, tf, signal),
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

  return (
    <div className="p-3 sm:p-4 space-y-3 pb-16" data-testid="trade-your-plan">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] tracking-[0.22em] text-slate-500">TRADE YOUR PLAN</div>
          <h1 className="text-xl font-semibold tracking-tight">
            {activeSymbol}{" "}
            <span className="text-slate-400">{TRADE_PLAN_TF_LABEL[tf]}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {tf === "4h" ? "Decision ladder · know your levels · trade the reaction." : "Wave / structure decision map. Let a completed candle confirm."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="panel px-3 py-2 max-w-xs hidden md:block">
            <div className="text-[10px] tracking-[0.16em] text-slate-500">KEY PHILOSOPHY</div>
            <p className="text-[11px] text-slate-400 leading-snug">Break key levels. Follow the structure. Let price decide.</p>
          </div>
          <div className="flex flex-wrap gap-1" data-testid="trade-plan-timeframes">
            {TRADE_PLAN_TIMEFRAMES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTf(id);
                  window.sessionStorage.setItem("trade-plan-tf", id);
                }}
                className={`px-3 py-1.5 rounded-md border text-[12px] ${tf === id ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
              >
                {TRADE_PLAN_TF_LABEL[id]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <div className="panel p-10 text-center text-slate-400">Building the {activeSymbol} decision map…</div>}
      {error && !map && (
        <div className="panel p-6 text-bear text-sm">
          Market data temporarily unavailable — {(error as Error).message}. Levels are never invented.
        </div>
      )}

      {map && (
        <>
          <div className="flex flex-wrap gap-4 text-[12px] text-slate-300">
            <span>
              Price <Price n={map.price} />{" "}
              <span className={(map.changePercent || 0) >= 0 ? "text-bull" : "text-bear"}>{pct(map.changePercent)}</span>
            </span>
            <span>
              Premarket <Price n={map.premarketPrice} />{" "}
              {map.premarketChangePct != null ? (
                <span className={map.premarketChangePct >= 0 ? "text-bull" : "text-bear"}>{pct(map.premarketChangePct)}</span>
              ) : (
                <span className="text-slate-500">unavailable</span>
              )}
            </span>
            <span>
              VWAP <Price n={map.vwap} />
            </span>
            <span className="text-slate-500">
              {map.session || "—"} · {map.freshness.dataStatus}
              {isFetching ? " · refreshing" : ""}
            </span>
          </div>

          {map.layout === "CHART_MAP" ? <ChartMap map={map} /> : <DecisionLadder map={map} />}

          <p className="text-center text-[11px] tracking-[0.18em] text-slate-500 py-2">
            PLAN YOUR TRADE. TRADE YOUR PLAN. LET PRICE CONFIRM.
          </p>
          {map.methodology ? <p className="text-[10px] text-slate-600 max-w-5xl mx-auto text-center">{map.methodology}</p> : null}
        </>
      )}
    </div>
  );
}

function ChartMap({ map }: { map: TradePlanMap }) {
  const stack = byPriceDesc(map.chartLevels);
  const above = stack.filter((l) => map.price == null || (l.price || 0) >= map.price);
  const below = stack.filter((l) => map.price != null && (l.price || 0) < map.price);
  const chartLines = map.chartLevels.filter((l) => l.onChart);

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-3">
        <section className="panel p-2">
          <TradePlanChart bars={map.bars} levels={chartLines} timeframe={map.timeframe} />
        </section>
        <div className="space-y-3">
          <section className="panel p-3">
            <h2 className="text-[11px] tracking-[0.16em] text-bull mb-1">BULLISH ROADMAP ↑</h2>
            {above.map((l) => (
              <LevelRow key={l.id} level={l} compact />
            ))}
          </section>
          <section className="panel p-3">
            <h2 className="text-[11px] tracking-[0.16em] text-bear mb-1">BEARISH ROADMAP ↓</h2>
            {below.map((l) => (
              <LevelRow key={l.id} level={l} compact />
            ))}
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <section className="panel p-3">
          <h2 className="text-sm font-semibold mb-1">The big picture</h2>
          <p className="text-[12px] text-slate-300 leading-relaxed">{map.bigPicture}</p>
          <div className="text-[11px] text-slate-500 mt-2">
            {map.structure.label} · {map.structure.detail}
          </div>
        </section>
        <section className="panel p-3" data-testid="trade-plan-levels">
          <h2 className="text-sm font-semibold mb-1">Key levels summary</h2>
          {map.keyLevelsSummary.map((l) => (
            <LevelRow key={`k-${l.id}`} level={l} compact />
          ))}
        </section>
        <section className="panel p-3" data-testid="trade-plan-actions">
          <h2 className="text-sm font-semibold mb-1">Trade plan</h2>
          <div className="text-[11px] text-bull mb-1">Bullish plan</div>
          <ul className="text-[12px] text-slate-300 space-y-1 list-disc pl-4 mb-2">
            {map.tradePlan.bullish.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="text-[11px] text-bear mb-1">Bearish plan</div>
          <ul className="text-[12px] text-slate-300 space-y-1 list-disc pl-4">
            {map.tradePlan.bearish.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <section className="panel p-3">
          <h2 className="text-sm font-semibold mb-1">RSI</h2>
          <div className="text-[12px] text-slate-300">
            RSI(14) {map.rsi.rsi14?.toFixed(2) ?? "—"} · RSI(7) {map.rsi.rsi7?.toFixed(2) ?? "—"}
          </div>
          <Spark values={map.rsi.series} color="#c084fc" mid={50} />
          <p className="text-[12px] text-slate-400 mt-1">{map.rsi.note}</p>
        </section>
        <section className="panel p-3">
          <h2 className="text-sm font-semibold mb-1">MACD</h2>
          <div className="text-[12px] text-slate-300">
            MACD(12,26,9) {map.macd.line?.toFixed(3) ?? "—"} / {map.macd.signal?.toFixed(3) ?? "—"} · hist {map.macd.hist?.toFixed(3) ?? "—"}
          </div>
          <Spark values={map.macd.histSeries} color={ (map.macd.hist || 0) >= 0 ? "#4ade80" : "#fb7185"} mid={0} />
          <div className="text-[11px] text-slate-500">Fast MACD(6,13,5) hist {map.macd.fastHist?.toFixed(3) ?? "—"}</div>
          <p className="text-[12px] text-slate-400 mt-1">{map.macd.note}</p>
        </section>
        <section className="panel p-3" data-testid="trade-plan-watch">
          <h2 className="text-sm font-semibold mb-1">What to watch</h2>
          <ul className="space-y-1.5 text-[12px]">
            {map.whatToWatch.map((w) => (
              <li key={w.text} className={w.tone === "BULLISH" ? "text-bull" : w.tone === "BEARISH" ? "text-bear" : "text-warn"}>
                {w.tone === "BULLISH" ? "★" : w.tone === "BEARISH" ? "!" : "·"} {w.text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function DecisionLadder({ map }: { map: TradePlanMap }) {
  const zoneLabel: Record<string, string> = { ABOVE: "BULLISH ABOVE", PIVOT: "PIVOT ZONE", BELOW: "BEARISH BELOW" };
  const zoneRow: Record<string, string> = {
    ABOVE: "bg-bull/5",
    PIVOT: "bg-warn/5",
    BELOW: "bg-bear/5",
  };

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-3">
        <section className="panel overflow-hidden" data-testid="trade-plan-ladder">
          <div className="px-3 py-2 border-b border-line text-[11px] tracking-[0.16em] text-slate-500">4H DECISION LADDER</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[560px]">
              <thead className="text-slate-500">
                <tr>
                  {["Zone", "Level", "Price", "What it means"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {map.ladder.map((l) => (
                  <tr key={l.id} className={`border-t border-line/20 ${zoneRow[l.zone || ""] || ""}`}>
                    <td className="px-3 py-2 text-[10px] tracking-[0.12em] text-slate-500">{l.zone ? zoneLabel[l.zone] : "—"}</td>
                    <td className="px-3 py-2 text-slate-300">{l.label}</td>
                    <td className="px-3 py-2">
                      <Price n={l.price} />
                    </td>
                    <td className="px-3 py-2 text-slate-400">{l.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="space-y-3">
          <section className="panel p-3">
            <h2 className="text-sm font-semibold mb-1">How to use this ladder</h2>
            <ol className="list-decimal pl-4 text-[12px] text-slate-300 space-y-1">
              {map.howToUse.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>
          <section className="panel p-3">
            <h2 className="text-sm font-semibold mb-1">Current read</h2>
            <ul className="text-[12px] text-slate-300 space-y-1">
              {map.currentRead.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <section className="panel p-2">
        <TradePlanChart bars={map.bars} levels={map.ladder.filter((l) => l.onChart !== false)} timeframe={map.timeframe} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="panel p-3">
          <h2 className="text-[11px] tracking-[0.16em] text-bull mb-2">BULLISH SCENARIO</h2>
          <ol className="list-decimal pl-4 text-[12px] text-slate-300 space-y-1">
            {map.bullishScenario.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
        <section className="panel p-3">
          <h2 className="text-[11px] tracking-[0.16em] text-bear mb-2">BEARISH SCENARIO</h2>
          <ol className="list-decimal pl-4 text-[12px] text-slate-300 space-y-1">
            {map.bearishScenario.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="panel p-3">
          <h2 className="text-sm font-semibold mb-2">Bullish option ideas</h2>
          {map.bullishOptions.map((o) => (
            <div key={o.title} className={`py-1.5 border-b border-line/20 text-[12px] ${o.available ? "" : "opacity-50"}`}>
              <div>
                {o.title}{" "}
                <span className="text-slate-500">
                  · {o.risk} {o.available ? "REWARD / RISK" : "· not listed"}
                </span>
              </div>
              <div className="text-slate-400">{o.detail}</div>
            </div>
          ))}
        </section>
        <section className="panel p-3">
          <h2 className="text-sm font-semibold mb-2">Bearish option ideas</h2>
          {map.bearishOptions.map((o) => (
            <div key={o.title} className={`py-1.5 border-b border-line/20 text-[12px] ${o.available ? "" : "opacity-50"}`}>
              <div>
                {o.title} <span className="text-slate-500">· {o.risk} {o.available ? "REWARD / RISK" : "· not listed"}</span>
              </div>
              <div className="text-slate-400">{o.detail}</div>
            </div>
          ))}
        </section>
      </div>

      <section className="panel p-3">
        <h2 className="text-sm font-semibold mb-1">Key reminders</h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[12px] text-slate-400">
          {map.reminders.map((r) => (
            <li key={r}>✓ {r}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
