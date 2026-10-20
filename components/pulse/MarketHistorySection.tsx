"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import {
  SIGNAL_HELP,
  sortMarketHistoryRows,
  type Direction,
  type MarketHistoryPayload,
  type MarketHistoryRow,
  type MarketHistorySortKey,
} from "@/src/engines/marketHistory";

const COLUMNS: { key: string; label: string; title: string; sort?: MarketHistorySortKey }[] = [
  { key: "date", label: "Date", title: "Session date in America/New_York", sort: "date" },
  { key: "plain", label: "VIX Close", title: "CBOE VIX daily close" },
  { key: "vixChange", label: "VIX Change", title: "Point change versus the previous VIX observation", sort: "vixChange" },
  { key: "plain-vix-pct", label: "VIX %", title: "Percentage change versus the previous VIX observation" },
  { key: "plain-brent", label: "Brent", title: "Brent futures price, USD per barrel" },
  { key: "brentChange", label: "Brent Change", title: "USD per barrel versus the previous Brent observation", sort: "brentChange" },
  { key: "plain-brent-pct", label: "Brent %", title: "Percentage change versus the previous Brent observation" },
  { key: "plain-spy", label: "SPY Close", title: "Unadjusted SPY daily close, USD" },
  { key: "spyChange", label: "SPY Change", title: "Dollar change versus the previous SPY session", sort: "spyChange" },
  { key: "plain-spy-pct", label: "SPY %", title: "Percentage change versus the previous SPY session" },
  { key: "spyVolume", label: "SPY Volume", title: "Actual shares traded", sort: "spyVolume" },
  { key: "averageVolume", label: "Avg Volume", title: "Mean of the previous 20 completed SPY sessions", sort: "averageVolume" },
  { key: "relativeVolume", label: "Rel Volume", title: "Daily volume divided by the prior 20-session average", sort: "relativeVolume" },
  { key: "plain-vol-pct", label: "Vol %", title: "Volume change versus the previous SPY session" },
  { key: "plain-price", label: "Price Trend", title: "SPY price direction. Separate from volume." },
  { key: "plain-volume", label: "Volume Trend", title: "Share-volume direction. Not buying or selling pressure." },
  { key: "plain-signal", label: "Market Signal", title: "Observed combination for this date. Not a forecast." },
];

export function MarketHistorySection() {
  const query = useQuery({
    queryKey: keys.marketHistory,
    queryFn: ({ signal }) => api.marketHistory(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const payload = query.data?.data;

  return (
    <section className="panel overflow-hidden" data-testid="market-history" aria-labelledby="market-history-title">
      <div className="px-4 py-3 border-b border-line flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="market-history-title" className="text-[11px] tracking-[0.18em] text-slate-500">
            30-DAY MARKET HISTORY
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Completed daily VIX, Brent futures, and SPY sessions for the last 30 calendar days. Volume arrows describe trading activity, not buying or selling pressure.
          </p>
        </div>
        {payload && (
          <div className="text-[11px] text-slate-500" data-testid="market-history-updated">
            {payload.stale ? "Stale" : "Delayed"} daily data
            {payload.cards.spy.date ? ` · completed session ${formatDate(payload.cards.spy.date)}` : ""}
          </div>
        )}
      </div>

      {query.isLoading && !payload && <HistorySkeleton />}
      {query.error && !payload && (
        <div className="p-4 text-sm text-bear" data-testid="market-history-unavailable" role="alert">
          30-day history is unavailable — {(query.error as Error).message}. Other overview sections are unchanged, and missing values are not invented.
        </div>
      )}
      {payload && <HistoryBody payload={payload} />}
    </section>
  );
}

function HistoryBody({ payload }: { payload: MarketHistoryPayload }) {
  const [sort, setSort] = useState<{ key: MarketHistorySortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const rows = useMemo(() => sortMarketHistoryRows(payload.rows, sort.key, sort.dir), [payload.rows, sort]);
  const failures = (["vix", "brent", "spy"] as const).filter((id) => payload.instruments[id].error);

  return (
    <div className="p-4 space-y-4">
      {payload.pendingSession && (
        <p className="text-xs text-slate-400" data-testid="market-history-pending">
          The {formatDate(payload.pendingSession)} session is still open or not an official close, so the table keeps the last completed session. Partial volume and intraday lasts are not shown as the daily close.
        </p>
      )}
      {payload.stale && (
        <p className="text-xs text-warn" data-testid="market-history-stale">
          The newest completed session is more than five calendar days old.
        </p>
      )}
      {failures.map((id) => (
        <p key={id} className="text-xs text-bear" role="status">
          {payload.instruments[id].name} unavailable — {payload.instruments[id].error}
        </p>
      ))}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SummaryCard
          testId="history-card-vix"
          title="VIX"
          subtitle="CBOE Volatility Index"
          help="A rising VIX generally indicates greater expected near-term S&P 500 volatility. It does not automatically mean stock prices must fall."
          tone="vix"
          summary={payload.cards.vix}
          unit="pts"
          benchmark={payload.instruments.vix.benchmark}
        />
        <SummaryCard
          testId="history-card-brent"
          title="Brent"
          subtitle="Crude oil futures"
          help={payload.instruments.brent.benchmark}
          tone="vix"
          summary={payload.cards.brent}
          unit="USD/bbl"
          benchmark={payload.instruments.brent.benchmark}
        />
        <SpyCard payload={payload} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400" data-testid="market-history-empty">
          No completed sessions were published in this 30-calendar-day window.
        </p>
      ) : (
        <div className="overflow-x-auto" data-testid="market-history-scroll">
          <table className="w-full text-xs min-w-[1080px]" data-testid="market-history-table">
            <thead className="text-[10px] tracking-wide text-slate-500 border-b border-line">
              <tr>
                {COLUMNS.map((column) => {
                  const sortKey = column.sort;
                  const active = sortKey != null && sort.key === sortKey;
                  const alignLeft = sortKey === "date" || column.label === "Price Trend" || column.label === "Volume Trend" || column.label === "Market Signal";
                  return (
                    <th
                      key={column.label}
                      scope="col"
                      className={`px-2 py-2 whitespace-nowrap ${alignLeft ? "text-left" : "text-right"}`}
                      aria-sort={sortKey ? (active ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                      title={column.title}
                    >
                      {sortKey ? (
                        <button
                          type="button"
                          className="hover:text-white"
                          aria-pressed={active}
                          aria-label={`Sort by ${column.label}`}
                          data-testid={`history-sort-${sortKey}`}
                          onClick={() =>
                            setSort((current) =>
                              current.key === sortKey ? { key: sortKey, dir: current.dir === "desc" ? "asc" : "desc" } : { key: sortKey, dir: "desc" },
                            )
                          }
                        >
                          {column.label}
                          {active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
                        </button>
                      ) : (
                        column.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <HistoryRow key={row.date} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-5 text-slate-500">
        {payload.rules.session} {payload.rules.change} {payload.rules.averageVolume} A price move under {payload.rules.priceFlatPercent}% and a volume move under {payload.rules.volumeFlatPercent}% are shown as unchanged. Dates use America/New_York. {payload.instruments.brent.benchmark} {payload.instruments.spy.benchmark}
      </p>
    </div>
  );
}

function HistoryRow({ row }: { row: MarketHistoryRow }) {
  return (
    <tr className="border-b border-white/5" data-testid={`history-row-${row.date}`}>
      <th scope="row" className="text-left px-2 py-2 text-slate-200 font-medium whitespace-nowrap">
        {formatDate(row.date)}
      </th>
      <td className="px-2 py-2 text-right tick">{num(row.vix.close)}</td>
      <td className={`px-2 py-2 text-right tick ${tone(row.vix.direction, "vix")}`}>{signed(row.vix.change)}</td>
      <td className={`px-2 py-2 text-right tick ${tone(row.vix.direction, "vix")}`}>{pct(row.vix.changePercent, row.vix.direction, "vix")}</td>
      <td className="px-2 py-2 text-right tick">{num(row.brent.close)}</td>
      <td className={`px-2 py-2 text-right tick ${tone(row.brent.direction, "vix")}`}>{signed(row.brent.change)}</td>
      <td className={`px-2 py-2 text-right tick ${tone(row.brent.direction, "vix")}`}>{pct(row.brent.changePercent, row.brent.direction, "vix")}</td>
      <td className="px-2 py-2 text-right tick">{num(row.spy.close)}</td>
      <td className={`px-2 py-2 text-right tick ${tone(row.spy.direction, "price")}`}>{signed(row.spy.change)}</td>
      <td className={`px-2 py-2 text-right tick ${tone(row.spy.direction, "price")}`}>{pct(row.spy.changePercent, row.spy.direction, "price")}</td>
      <td className="px-2 py-2 text-right tick" title={row.spy.volume == null ? "Volume unavailable" : `${Math.round(row.spy.volume).toLocaleString("en-US")} shares`}>
        {shares(row.spy.volume)}
      </td>
      <td className="px-2 py-2 text-right tick" title={row.spy.averageVolume == null ? "20 prior sessions were not available" : `${Math.round(row.spy.averageVolume).toLocaleString("en-US")} shares`}>
        {shares(row.spy.averageVolume)}
      </td>
      <td className="px-2 py-2 text-right tick">{row.spy.relativeVolume == null ? "—" : `${row.spy.relativeVolume.toFixed(2)}×`}</td>
      <td className={`px-2 py-2 text-right tick ${tone(row.spy.volumeDirection, "volume")}`}>{pct(row.spy.volumeChangePercent, row.spy.volumeDirection, "volume")}</td>
      <td className="px-2 py-2 whitespace-nowrap">
        <Trend direction={row.spy.direction} tone="price" kind="price" percent={row.spy.changePercent} />
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <Trend direction={row.spy.volumeDirection} tone="volume" kind="volume" percent={row.spy.volumeChangePercent} />
      </td>
      <td className="px-2 py-2 min-w-[220px]">
        <span title={row.signalDetail}>{row.signal}</span>
        {row.spy.aboveAverage === false && <span className="block text-[10px] text-slate-500">Below 20-session average</span>}
        {row.spy.aboveAverage === true && <span className="block text-[10px] text-slate-500">Above 20-session average</span>}
        <span className="sr-only">{row.participation}. {SIGNAL_HELP[row.category] || row.signalDetail}</span>
      </td>
    </tr>
  );
}

function SummaryCard({
  testId,
  title,
  subtitle,
  help,
  tone: cardTone,
  summary,
  unit,
  benchmark,
}: {
  testId: string;
  title: string;
  subtitle: string;
  help: string;
  tone: "vix" | "price";
  summary: MarketHistoryPayload["cards"]["vix"];
  unit: string;
  benchmark: string;
}) {
  return (
    <article className="rounded border border-line p-3" data-testid={testId} title={benchmark}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] tracking-[0.16em] text-slate-500">{title}</div>
          <div className="text-xs text-slate-400">{subtitle}</div>
        </div>
        <button type="button" className="text-[11px] text-slate-500 underline decoration-dotted" aria-label={`${title} explanation`} title={help}>
          Why this moves
        </button>
      </div>
      <div className={`mt-2 text-2xl tick ${tone(summary.direction, cardTone)}`}>{num(summary.close)}</div>
      <div className="text-[11px] text-slate-500">{unit} · {summary.date ? formatDate(summary.date) : "No completed session"}</div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Previous</dt>
        <dd className="text-right tick">{num(summary.previous)}</dd>
        <dt className="text-slate-500">Change</dt>
        <dd className={`text-right tick ${tone(summary.direction, cardTone)}`}>{signed(summary.change)}</dd>
        <dt className="text-slate-500">Change %</dt>
        <dd className={`text-right tick ${tone(summary.direction, cardTone)}`}>{pct(summary.changePercent, summary.direction, cardTone)}</dd>
        <dt className="text-slate-500">Direction</dt>
        <dd className="text-right"><Trend direction={summary.direction} tone={cardTone} kind="price" percent={summary.changePercent} /></dd>
      </dl>
      <div className="mt-2 text-[11px] text-slate-500">Vendor bar time {formatStamp(summary.timestamp)}</div>
    </article>
  );
}

function SpyCard({ payload }: { payload: MarketHistoryPayload }) {
  const summary = payload.cards.spy;
  return (
    <article className="rounded border border-line p-3" data-testid="history-card-spy" title={payload.instruments.spy.benchmark}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] tracking-[0.16em] text-slate-500">SPY</div>
          <div className="text-xs text-slate-400">State Street SPDR S&P 500 ETF Trust</div>
        </div>
        <button
          type="button"
          className="text-[11px] text-slate-500 underline decoration-dotted"
          aria-label="SPY volume explanation"
          title="Price direction and volume direction are separate. Higher volume means more shares traded than the previous session. It does not identify buying or selling pressure."
        >
          Volume is activity
        </button>
      </div>
      <div className={`mt-2 text-2xl tick ${tone(summary.direction, "price")}`}>{summary.close == null ? "—" : `$${num(summary.close)}`}</div>
      <div className="text-[11px] text-slate-500">USD · {summary.date ? formatDate(summary.date) : "No completed session"}</div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Previous close</dt>
        <dd className="text-right tick">{summary.previous == null ? "—" : `$${num(summary.previous)}`}</dd>
        <dt className="text-slate-500">Price change</dt>
        <dd className={`text-right tick ${tone(summary.direction, "price")}`}>{signed(summary.change)} ({pct(summary.changePercent, summary.direction, "price")})</dd>
        <dt className="text-slate-500">Volume</dt>
        <dd className="text-right tick">{shares(summary.volume)}</dd>
        <dt className="text-slate-500">20-session avg</dt>
        <dd className="text-right tick">{shares(summary.averageVolume)}</dd>
        <dt className="text-slate-500">Price</dt>
        <dd className="text-right"><Trend direction={summary.direction} tone="price" kind="price" percent={summary.changePercent} /></dd>
        <dt className="text-slate-500">Volume</dt>
        <dd className="text-right"><Trend direction={summary.volumeDirection} tone="volume" kind="volume" percent={summary.volumeChangePercent} /></dd>
      </dl>
      <div className="mt-2 text-[11px] text-slate-500">
        {summary.relativeVolume == null ? "Relative volume unavailable" : `${summary.relativeVolume.toFixed(2)}× the prior 20-session average`}
        {" · Vendor bar time "}
        {formatStamp(summary.timestamp)}
      </div>
    </article>
  );
}

function Trend({
  direction,
  tone: trendTone,
  kind,
  percent,
}: {
  direction: Direction;
  tone: "vix" | "price" | "volume";
  kind: "price" | "volume";
  percent: number | null;
}) {
  const glyph = direction === "up" ? "↑" : direction === "down" ? "↓" : direction === "flat" ? "→" : "—";
  const word = direction === "up" ? (kind === "volume" ? "volume increased" : "up") : direction === "down" ? (kind === "volume" ? "volume decreased" : "down") : direction === "flat" ? (kind === "volume" ? "volume unchanged" : "unchanged") : "unavailable";
  const printed = percent == null ? "" : ` ${percent > 0 ? "+" : ""}${percent.toFixed(kind === "volume" ? 1 : 2)}%`;
  return (
    <span className={tone(direction, trendTone)} aria-label={`${word}${printed ? `, ${printed.trim()}` : ""}`}>
      {glyph}
      {kind === "volume" ? printed || " —" : ` ${word}`}
    </span>
  );
}

function HistorySkeleton() {
  return (
    <div className="p-4 space-y-3" data-testid="market-history-loading" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-36 rounded bg-white/5 animate-pulse" />
        ))}
      </div>
      <div className="h-48 rounded bg-white/5 animate-pulse" />
      <p className="text-xs text-slate-500">Loading completed daily history…</p>
    </div>
  );
}

function tone(direction: Direction, kind: "vix" | "price" | "volume") {
  if (direction === "up") return kind === "vix" ? "text-bear" : "text-bull";
  if (direction === "down") return kind === "vix" ? "text-bull" : "text-bear";
  return "text-slate-400";
}

function num(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const body = num(Math.abs(value));
  if (value > 0) return `+${body}`;
  if (value < 0) return `-${body}`;
  return body;
}

function pct(value: number | null | undefined, direction: Direction, kind: "vix" | "price" | "volume") {
  if (value == null || !Number.isFinite(value) || direction === "missing") return "—";
  const digits = kind === "volume" ? 1 : 2;
  const body = `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
  return body;
}

function shares(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatStamp(iso: string | null) {
  if (!iso) return "Timestamp unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
