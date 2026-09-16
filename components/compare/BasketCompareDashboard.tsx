"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Trophy } from "lucide-react";
import {
  MAG7_COMPARE_SECTORS,
  MAG7_COMPARE_TF_LABELS,
  MAG7_COMPARE_TIMEFRAMES,
  tickerColors,
  type Mag7ComparePayload,
  type Mag7CompareStock,
  type Mag7CompareTimeframe,
} from "@/lib/mag7Compare";
import { pct, usd } from "@/lib/format";
import { Mag7CompareChart } from "@/components/mag7/Mag7CompareChart";

function tone(signal: string) {
  if (signal.includes("BULLISH")) return "text-bull";
  if (signal.includes("BEARISH")) return "text-bear";
  if (signal === "OVEREXTENDED") return "text-warn";
  return "text-slate-300";
}

function num(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export type BasketCompareCopy = {
  title: string;
  subtitle: string;
  loading: (label: string) => string;
  overview: string;
  detailed: string;
  strongestInsight: (stock: Mag7CompareStock, label: string) => string;
  weakestInsight: (stock: Mag7CompareStock, label: string) => string;
  averageInsight: (avg: string) => string;
  metrics: string;
  sectorTitle: string;
  showSectors: boolean;
  testId: string;
  chartTestId: string;
  qualityTestId: string;
  rowTestId: (symbol: string) => string;
};

export function BasketCompareDashboard({
  copy,
  tf,
  onTfChange,
  payload,
  isLoading,
  isFetching,
  error,
  headerExtra,
  empty,
}: {
  copy: BasketCompareCopy;
  tf: Mag7CompareTimeframe;
  onTfChange: (tf: Mag7CompareTimeframe) => void;
  payload?: Mag7ComparePayload;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  headerExtra?: ReactNode;
  empty?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const p = payload;
  const label = MAG7_COMPARE_TF_LABELS[tf];
  const colors = useMemo(() => tickerColors((p?.stocks || []).map((s) => s.symbol)), [p]);
  const categories = useMemo(() => ["All", ...Array.from(new Set((p?.indicators || []).map((i) => i.category)))], [p]);
  const rows = useMemo(() => {
    if (!p) return [];
    return p.indicators.filter((r) => {
      if (cat !== "All" && r.category !== cat) return false;
      if (!q) return true;
      const needle = q.toLowerCase();
      return r.name.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle);
    });
  }, [p, q, cat]);

  return (
    <div className="w-full p-3 sm:p-4 space-y-4 pb-12" data-testid={copy.testId}>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-sm text-slate-400 max-w-3xl mt-1">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500">
            Timeframe
            <select
              aria-label="Timeframe"
              className="block mt-1 bg-panel2 border border-line rounded px-3 py-2 text-sm text-white min-w-[160px]"
              value={tf}
              onChange={(e) => onTfChange(e.target.value as Mag7CompareTimeframe)}
            >
              {MAG7_COMPARE_TIMEFRAMES.map((id) => (
                <option key={id} value={id}>
                  {MAG7_COMPARE_TF_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
          {p && (
            <div className="text-[11px] text-slate-500 pb-2">
              Last updated {p.as_of_et} {p.timezone}
              {isFetching ? " · refreshing…" : ""}
            </div>
          )}
        </div>
      </div>

      {headerExtra}

      {empty}
      {isLoading && <div className="panel p-10 text-center text-slate-400">{copy.loading(label)}</div>}
      {error && <div className="panel p-4 text-bear text-sm">DATA UNAVAILABLE — {error.message}. Values are never invented.</div>}

      {p && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Highlight
              title={`Strongest performer · ${label}`}
              stock={p.strongest}
              accent="bull"
              icon={<Trophy className="h-4 w-4 text-bull" />}
            />
            <Highlight
              title={`Weakest performer · ${label}`}
              stock={p.weakest}
              accent="bear"
              icon={<AlertTriangle className="h-4 w-4 text-bear" />}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="panel p-4">
              <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-3">
                {copy.overview} · {label.toUpperCase()}
              </div>
              <div className="flex items-end gap-2 h-48">
                {p.stocks.map((s) => {
                  const h = s.score == null ? 8 : Math.max(8, s.score);
                  return (
                    <div key={s.symbol} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="text-[11px] tick text-slate-300">{s.score ?? "—"}</div>
                      <div className="w-full rounded-t bg-white/10 overflow-hidden flex items-end h-36">
                        <div className="w-full rounded-t" style={{ height: `${h}%`, background: colors[s.symbol] || "#94a3b8" }} />
                      </div>
                      <div className="text-[11px] text-slate-400 truncate w-full text-center">{s.symbol}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Mag7CompareChart series={p.chart} legend={p.legend} label={label} colors={colors} testId={copy.chartTestId} />
          </div>

          <div className="panel overflow-hidden">
            <div className="px-4 py-3 text-[11px] tracking-[0.18em] text-slate-500">
              {copy.detailed} · {label.toUpperCase()}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="text-slate-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">#</th>
                    <th className="text-left px-3 py-2">Stock</th>
                    <th className="text-right px-3 py-2">Price</th>
                    <th className="text-right px-3 py-2">{label} chg</th>
                    <th className="text-right px-3 py-2">5-bar</th>
                    <th className="text-right px-3 py-2">Score</th>
                    <th className="text-right px-3 py-2">Signal</th>
                    <th className="text-right px-3 py-2">Trend</th>
                    <th className="text-right px-3 py-2">Momentum</th>
                    <th className="text-right px-3 py-2">RSI(14)</th>
                    <th className="text-right px-3 py-2">MACD</th>
                    <th className="text-right px-3 py-2">RVOL</th>
                    <th className="text-right px-3 py-2">Volatility</th>
                    <th className="text-right px-3 py-2">Support</th>
                    <th className="text-right px-3 py-2">Resistance</th>
                  </tr>
                </thead>
                <tbody>
                  {p.stocks.map((s, i) => (
                    <tr key={s.symbol} className="border-t border-line" data-testid={copy.rowTestId(s.symbol)}>
                      <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colors[s.symbol] }} />
                          <div>
                            <div className="font-semibold">{s.symbol}</div>
                            <div className="text-[11px] text-slate-500">{s.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tick">{usd(s.price)}</td>
                      <td className={`px-3 py-2 text-right tick ${(s.tfReturn || 0) >= 0 ? "text-bull" : "text-bear"}`}>{pct(s.tfReturn)}</td>
                      <td className={`px-3 py-2 text-right tick ${(s.ret5 || 0) >= 0 ? "text-bull" : "text-bear"}`}>{pct(s.ret5)}</td>
                      <td className="px-3 py-2 text-right tick">{s.score ?? "—"}</td>
                      <td className={`px-3 py-2 text-right text-xs ${tone(s.signal)}`}>{s.signal}</td>
                      <td className="px-3 py-2 text-right text-xs">{s.trendLabel}</td>
                      <td className="px-3 py-2 text-right text-xs">{s.momentumLabel}</td>
                      <td className="px-3 py-2 text-right tick">{num(s.rsi14)}</td>
                      <td className="px-3 py-2 text-right tick">{num(s.macd, 3)}</td>
                      <td className="px-3 py-2 text-right tick">{num(s.rvol)}</td>
                      <td className="px-3 py-2 text-right text-xs">{s.volatilityLabel}</td>
                      <td className="px-3 py-2 text-right tick">{usd(s.support)}</td>
                      <td className="px-3 py-2 text-right tick">{usd(s.resistance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="panel p-4">
              <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-2">KEY INSIGHTS</div>
              <ul className="text-sm text-slate-300 space-y-2 list-disc pl-4">
                {p.strongest && <li>{copy.strongestInsight(p.strongest, label)}</li>}
                {p.weakest && p.weakest.symbol !== p.strongest?.symbol && <li>{copy.weakestInsight(p.weakest, label)}</li>}
                <li>{copy.averageInsight(p.averages.score != null ? p.averages.score.toFixed(1) : "N/A")}</li>
                {p.missing.length > 0 && <li>Missing or insufficient names: {p.missing.join(", ")}. Those rows were not invented.</li>}
              </ul>
              <p className="text-xs text-slate-500 mt-3">{p.weightsNote}</p>
            </div>
            <div className="panel p-4">
              <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-2">
                {copy.sectorTitle} · {label.toUpperCase()}
              </div>
              {p.stocks.map((s) => (
                <Metric
                  key={s.symbol}
                  label={copy.showSectors ? `${MAG7_COMPARE_SECTORS[s.symbol] || "Equity"} (${s.symbol})` : s.symbol}
                  value={pct(s.tfReturn)}
                  tone={(s.tfReturn || 0) >= 0 ? "bull" : "bear"}
                />
              ))}
            </div>
            <div className="panel p-4">
              <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-2">{copy.metrics}</div>
              <Metric label={`Avg ${label} return`} value={pct(p.averages.tfReturn)} />
              <Metric label="Avg RSI(14)" value={num(p.averages.rsi14)} />
              <Metric label="Avg relative volume" value={num(p.averages.rvol)} />
              <Metric label="Avg overall score" value={p.averages.score != null ? p.averages.score.toFixed(1) : "—"} />
            </div>
            <div className="panel p-4">
              <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-2">TOP GAINERS / LOSERS · {label.toUpperCase()}</div>
              <Movers stocks={p.stocks} />
            </div>
          </div>

          <div className="panel p-4" data-testid={copy.qualityTestId}>
            <div className="text-[11px] tracking-[0.18em] text-slate-500 mb-2">DATA QUALITY</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-2">
              {Object.entries(p.dataQuality).map(([sym, quality]) => (
                <div key={sym} className="flex justify-between gap-2 text-sm py-0.5">
                  <span className="text-slate-400">{sym}</span>
                  <span className="tick text-right">
                    {quality.status} · {quality.candles.toLocaleString()} bars
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-4 space-y-3">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">TICKER COMPARISON ENGINE · {p.indicators.length} PARAMETERS</div>
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
            </div>
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead className="text-slate-500 text-xs sticky top-0 bg-panel">
                  <tr>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-left px-3 py-2">Indicator</th>
                    {p.stocks.map((s) => (
                      <th key={s.symbol} className="text-right px-3 py-2">
                        {s.symbol}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="px-3 py-1.5 text-slate-400">{r.category}</td>
                      <td className="px-3 py-1.5">{r.name}</td>
                      {p.stocks.map((s) => (
                        <td key={s.symbol} className={`px-3 py-1.5 text-right tick ${tone(r.values[s.symbol]?.signal || "")}`}>
                          {r.values[s.symbol]?.display || "INSUFFICIENT DATA"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-slate-500">
              {rows.length} of {p.indicators.length} indicators shown.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Movers({ stocks }: { stocks: Mag7CompareStock[] }) {
  const ranked = [...stocks].filter((s) => s.tfReturn != null).sort((a, b) => (b.tfReturn || 0) - (a.tfReturn || 0));
  const gainers = ranked.slice(0, 3);
  const losers = ranked.slice(-3).reverse();
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-[11px] text-bull mb-1">Top gainers</div>
        {gainers.map((s) => (
          <Metric key={s.symbol} label={s.symbol} value={pct(s.tfReturn)} tone="bull" />
        ))}
        {!gainers.length && <div className="text-xs text-slate-500">INSUFFICIENT DATA</div>}
      </div>
      <div>
        <div className="text-[11px] text-bear mb-1">Top losers</div>
        {losers.map((s) => (
          <Metric key={s.symbol} label={s.symbol} value={pct(s.tfReturn)} tone="bear" />
        ))}
        {!losers.length && <div className="text-xs text-slate-500">INSUFFICIENT DATA</div>}
      </div>
    </div>
  );
}

function Highlight({
  title,
  stock,
  accent,
  icon,
}: {
  title: string;
  stock: Mag7ComparePayload["strongest"];
  accent: "bull" | "bear";
  icon?: ReactNode;
}) {
  if (!stock) {
    return (
      <div className="panel p-4">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-slate-500">
          {icon}
          {title}
        </div>
        <div className="text-slate-400 mt-2">INSUFFICIENT DATA</div>
      </div>
    );
  }
  return (
    <div className={`panel p-4 border ${accent === "bull" ? "border-bull/30" : "border-bear/30"}`}>
      <div className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-slate-500">
        {icon}
        {title}
      </div>
      <div className="flex items-end justify-between gap-3 mt-2">
        <div>
          <div className="text-2xl font-semibold">{stock.symbol}</div>
          <div className="text-xs text-slate-500">{stock.name}</div>
          <div className={`text-sm mt-1 ${tone(stock.signal)}`}>{stock.signal}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tick">
            {stock.score ?? "—"}
            <span className="text-sm text-slate-500"> / 100</span>
          </div>
          <div className="text-sm">{usd(stock.price)}</div>
          <div className={`text-sm ${(stock.tfReturn || 0) >= 0 ? "text-bull" : "text-bear"}`}>{pct(stock.tfReturn)}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div>
          Trend <span className="tick">{stock.trendLabel}</span>
        </div>
        <div>
          Momentum <span className="tick">{stock.momentumLabel}</span>
        </div>
        <div>
          Conf. <span className="tick">{stock.confidence ?? "—"}%</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone: t }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1">
      <span className="text-slate-500">{label}</span>
      <span className={`tick ${t === "bull" ? "text-bull" : t === "bear" ? "text-bear" : ""}`}>{value}</span>
    </div>
  );
}
