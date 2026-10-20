"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { compact, pct, usd } from "@/lib/format";
import { SCALP_TIMEFRAMES, type ScalpChartTimeframe, type ScalpCondition, type ScalpTimeframe } from "@/lib/scalp";
import { useTerminal } from "@/components/layout/AppShell";
import { TickerSearch } from "@/components/search/TickerSearch";
import { DirectionText, VerdictBadge } from "./VerdictBadge";
import { ScalpChart } from "./ScalpChart";
import { TickerSessionStrip } from "@/components/market/TickerSessionStrip";

function WhyRow({ item }: { item: ScalpCondition }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left py-1.5 border-b border-white/5 last:border-0" data-testid={`scalp-why-${item.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-slate-300">{item.label}</span>
        <span className="flex items-center gap-2">
          <DirectionText direction={item.direction} />
          <VerdictBadge verdict={item.verdict} />
        </span>
      </div>
      {open && (
        <div className="mt-1 text-[11px] text-slate-400 leading-relaxed">
          {item.why}
          {item.timestamp ? <div className="text-slate-600 mt-1">Candle: {item.timestamp}</div> : null}
          {item.forming ? <div className="text-warn">LIVE / FORMING — not treated as a confirmed close.</div> : null}
        </div>
      )}
    </button>
  );
}

export function ScalpAnalyzer() {
  const { symbol, setSymbol, autoRefresh } = useTerminal();
  const [tf, setTf] = useState<ScalpTimeframe>("15m");
  const [chartTf, setChartTf] = useState<ScalpChartTimeframe>("15m");
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.scalp(symbol, tf),
    queryFn: ({ signal }) => api.scalp(symbol, tf, signal),
    refetchInterval: autoRefresh ? 30_000 : false,
    placeholderData: (prev) => prev,
  });
  const analysis = data?.data;
  const ready = analysis && analysis.ticker === symbol.toUpperCase();

  const snapshot = useMemo(() => {
    if (!ready) return [];
    const q = analysis.quote;
    return [
      { k: "Price", v: usd(q.price) },
      { k: "Change", v: `${q.change != null ? (q.change > 0 ? "+" : "") + q.change.toFixed(2) : "—"} (${pct(q.change_percent)})` },
      { k: "Volume", v: compact(q.volume) },
      { k: "RVOL", v: analysis.snapshot.rvol != null ? analysis.snapshot.rvol.toFixed(2) : "—" },
      { k: "VWAP", v: usd(analysis.snapshot.vwap) },
      { k: "ATR (14)", v: usd(analysis.snapshot.atr) },
      { k: "Prev close", v: usd(analysis.extendedHours?.previousRegularClose) },
      { k: "Session", v: analysis.session.replaceAll("_", " ") },
      { k: "Market", v: analysis.market },
    ];
  }, [analysis, ready]);

  return (
    <div className="p-4 space-y-4 pb-16" data-testid="scalp-analyzer">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scalp Analyzer</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Intraday scalping analysis for 5–30 minute trades. Get a clear YES / NO / NEUTRAL on key conditions with supporting evidence.
          </p>
        </div>
        <p className="text-[11px] text-slate-500 max-w-sm">Scalping is riskful. Use this analysis as a tool, not a recommendation.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <TickerSearch value={symbol} onSelect={setSymbol} label="Search ticker" />
        </div>
        <div className="flex gap-1" data-testid="scalp-timeframes">
          {SCALP_TIMEFRAMES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setTf(item);
                setChartTf(item);
              }}
              className={`px-3 py-1.5 rounded-md border text-sm ${tf === item ? "border-accent bg-accent/15 text-white" : "border-line text-slate-400"}`}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>
        {ready && (
          <div className="text-[11px] text-slate-500">
            Last Updated: {analysis.last_updated_est} · {analysis.data_status}
            {isFetching ? " · refreshing…" : ""}
          </div>
        )}
      </div>

      {isLoading && !ready && <div className="panel p-10 text-center text-slate-400">Fetching live market data and calculating scalp conditions…</div>}
      {error && !ready && (
        <div className="panel p-6 text-bear text-sm">DATA UNAVAILABLE — {(error as Error).message}. Values are never invented.</div>
      )}

      {ready && (
        <>
          <TickerSessionStrip symbol={analysis.ticker} />
          {analysis.extendedHours && (
            <div className="panel px-3 py-2 text-[11px] text-slate-400" data-testid="scalp-extended-context">
              <div className="text-[10px] tracking-[0.18em] text-slate-500 mb-1">SCALP CONTEXT</div>
              Overnight H {usd(analysis.extendedHours.sessions.overnight.high)} · L {usd(analysis.extendedHours.sessions.overnight.low)} · {analysis.extendedHours.sessions.overnight.availability.replaceAll("_", " ")}
              {" · "}Premarket H {usd(analysis.extendedHours.sessions.preMarket.high)} · L {usd(analysis.extendedHours.sessions.preMarket.low)} · {analysis.extendedHours.sessions.preMarket.availability.replaceAll("_", " ")}
              {" · "}Prev close {usd(analysis.extendedHours.previousRegularClose)}
            </div>
          )}
          <div className="panel px-3 py-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3" data-testid="scalp-snapshot">
            <div className="col-span-2">
              <div className="text-lg font-semibold">{analysis.ticker}</div>
              <div className="text-[11px] text-slate-500 truncate">{analysis.name}</div>
            </div>
            {snapshot.map((row) => (
              <div key={row.k}>
                <div className="text-[10px] tracking-[0.14em] text-slate-500">{row.k}</div>
                <div className="text-sm tick text-white">{row.v}</div>
              </div>
            ))}
          </div>

          <div className="panel px-3 py-3" data-testid="scalp-market-context">
            <div className="text-[10px] tracking-[0.18em] text-slate-500 mb-2">MARKET CONTEXT</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[analysis.marketContext.spy, analysis.marketContext.qqq, analysis.marketContext.sector, analysis.marketContext.vix, analysis.marketContext.alignment].map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-slate-300">{c.label}</span>
                  <span className="flex items-center gap-1">
                    <DirectionText direction={c.direction} />
                    <VerdictBadge verdict={c.verdict} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-4">
            <ScalpChart data={analysis} chartTf={chartTf} onChartTf={setChartTf} />
            <div className="panel p-4 space-y-3" data-testid="scalp-state">
              <div className="flex items-center justify-between">
                <div className="text-[10px] tracking-[0.18em] text-slate-500">SCALP STATE</div>
                <div className="text-sm font-semibold text-white">Overall Setup: {analysis.overallState.replaceAll("_", " ")}</div>
              </div>
              <div className="text-[11px] text-slate-400">Trade state: {analysis.tradeState.replaceAll("_", " ")}</div>
              {analysis.checklist.slice(0, 8).map((c) => (
                <WhyRow key={c.id} item={c} />
              ))}
              <div className="flex flex-wrap gap-1 pt-2 text-[10px] text-slate-500">
                {["CONFIRMED", "SETUP FORMING", "WAIT", "NO TRADE", "INSUFFICIENT DATA"].map((s) => (
                  <span key={s} className={`px-2 py-0.5 rounded border ${analysis.overallState.replaceAll("_", " ") === s ? "border-accent text-white" : "border-line"}`}>{s}</span>
                ))}
              </div>
              {analysis.evidenceScore != null && <div className="text-[11px] text-slate-500">Setup Evidence Score: {analysis.evidenceScore}/100 — not a buy/sell label.</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="panel p-4" data-testid="scalp-mtf">
              <div className="text-[10px] tracking-[0.18em] text-slate-500 mb-2">MULTI-TIMEFRAME ANALYSIS</div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-normal pb-1">Timeframe</th>
                    <th className="text-left font-normal pb-1">Structure</th>
                    <th className="text-left font-normal pb-1">Trend</th>
                    <th className="text-left font-normal pb-1">State</th>
                  </tr>
                </thead>
                <tbody>
                  {SCALP_TIMEFRAMES.map((item) => {
                    const block = analysis.timeframes[item];
                    return (
                      <tr key={item} className="border-t border-white/5">
                        <td className="py-1.5">{item.toUpperCase()}</td>
                        <td>{block.structure.direction === "BULLISH" ? "HH + HL" : block.structure.direction === "BEARISH" ? "LH + LL" : "Range"}</td>
                        <td><DirectionText direction={block.trend.direction} /></td>
                        <td><VerdictBadge verdict={block.trend.verdict} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2"><WhyRow item={analysis.mtf.alignment} /></div>
            </div>

            <div className="panel p-4" data-testid="scalp-levels">
              <div className="text-[10px] tracking-[0.18em] text-slate-500 mb-2">KEY LEVELS</div>
              <div className="space-y-1">
                {analysis.keyLevels.map((lv) => (
                  <div key={lv.id} className="flex justify-between text-[12px] border-b border-white/5 py-1">
                    <span className="text-slate-400">{lv.name}</span>
                    <span className="tick text-slate-200">{lv.price != null ? usd(lv.price) : "—"} · {lv.status.replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4" data-testid="scalp-momentum">
              <div className="text-[10px] tracking-[0.18em] text-slate-500 mb-2">TECHNICAL INDICATORS</div>
              <div className="text-[12px] space-y-1 text-slate-300">
                <div>RSI (14) {analysis.momentum.rsi != null ? analysis.momentum.rsi.toFixed(1) : "—"} · {analysis.momentum.rsiDirection}</div>
                <WhyRow item={analysis.momentum.macd} />
                <WhyRow item={analysis.momentum.emaStack} />
                <WhyRow item={analysis.volume.confirmation} />
                <WhyRow item={analysis.vwap.above} />
                <div>ATR {usd(analysis.atr.value)} · Move/ATR {analysis.atr.moveOverAtr != null ? analysis.atr.moveOverAtr.toFixed(2) : "—"}</div>
              </div>
            </div>

            <div className="panel p-4" data-testid="scalp-risk">
              <div className="text-[10px] tracking-[0.18em] text-slate-500 mb-2">TRADE SETUP</div>
              <div className="text-[12px] space-y-1 text-slate-300">
                <div>Entry {usd(analysis.riskReward.entry)}</div>
                <div>Stop {usd(analysis.riskReward.stop)}</div>
                <div className="text-[11px] text-slate-500">{analysis.riskReward.stopBasis}</div>
                <div>T1 {usd(analysis.riskReward.t1)}</div>
                <div>T2 {usd(analysis.riskReward.t2)}</div>
                <div>T3 {usd(analysis.riskReward.t3)}</div>
                <div>Risk {usd(analysis.riskReward.risk)} · R:R {analysis.riskReward.rr != null ? `${analysis.riskReward.rr.toFixed(1)}:1` : "—"}</div>
                <WhyRow item={analysis.riskReward.validation} />
                <WhyRow item={analysis.liquidity.adequate} />
                <WhyRow item={analysis.liquidity.spread} />
              </div>
            </div>

            <div className="panel p-4" data-testid="scalp-news">
              <div className="text-[10px] tracking-[0.18em] text-slate-500 mb-2">RECENT NEWS & CATALYSTS</div>
              <WhyRow item={analysis.catalyst.present} />
              <div className="text-[11px] text-slate-500 mt-1">Type: {analysis.catalyst.type} · {analysis.catalyst.direction}</div>
              <div className="mt-2 space-y-2">
                {analysis.catalyst.items.map((n) => (
                  <div key={n.headline} className="text-[12px] text-slate-300">{n.headline}<div className="text-[10px] text-slate-500">{n.source}</div></div>
                ))}
                {!analysis.catalyst.items.length && <div className="text-sm text-slate-500">No live headlines for this ticker.</div>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {SCALP_TIMEFRAMES.map((item) => {
              const block = analysis.timeframes[item];
              return (
                <div key={item} className="panel p-4" data-testid={`scalp-tf-${item}`}>
                  <div className="text-[10px] tracking-[0.18em] text-slate-500 mb-2">{item.toUpperCase()} BREAKOUT / RETEST {block.forming ? "· LIVE/FORMING" : ""}</div>
                  <div className="text-[12px] text-slate-300 mb-2">Breakout: {block.breakout.status.replaceAll("_", " ")}</div>
                  <WhyRow item={block.breakout.priceCrossed} />
                  <WhyRow item={block.breakout.closedBeyond} />
                  <WhyRow item={block.breakout.volume} />
                  <WhyRow item={block.breakout.followThrough} />
                  <div className="text-[12px] text-slate-300 mt-2 mb-1">Retest: {block.retest.status}</div>
                  <WhyRow item={block.retest.occurring} />
                  <WhyRow item={block.retest.held} />
                  <WhyRow item={block.retest.confirmed} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
