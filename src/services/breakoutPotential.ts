import { CACHE_TTL } from "@/src/config/env";
import { resampleToMonthly } from "@/src/engines/chartPatterns";
import {
  analyzeBreakoutTicker,
  assessMarketRegime,
  sectorForTicker,
  snapshotTimeframe,
  type BreakoutDetail,
  type BreakoutRow,
  type MarketRegime,
} from "@/src/engines/breakoutPotential";
import { resampleToMinutes } from "@/src/engines/opportunityEngine";
import { HttpError } from "@/src/lib/errors";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { isRegularHours, resampleBars, toFrame } from "@/src/providers/base";
import { analysis } from "@/src/services/analysis";
import { listWatchlist } from "@/src/repositories/store";
import { SECTORS } from "@/src/data/sectors";
import { UNIVERSE } from "@/src/data/universe";
import type { OHLCVBar, Quote } from "@/src/types/domain";
import {
  BREAKOUT_MAX_TICKERS,
  DEFAULT_BREAKOUT_SETTINGS,
  DEFAULT_BREAKOUT_UNIVERSE,
  mergeBreakoutSettings,
  parseBreakoutTickers,
  type BreakoutLifecycleTimeframe,
  type BreakoutScanTimeframe,
  type BreakoutSettings,
  type BreakoutUniverseSource,
} from "@/lib/breakoutPotential";

export type BreakoutScannerPayload = {
  source: BreakoutUniverseSource;
  tickers: string[];
  timeframe: BreakoutScanTimeframe;
  lifecycleTimeframe: BreakoutLifecycleTimeframe;
  settings: BreakoutSettings;
  marketStatus: { state: "OPEN" | "CLOSED"; note: string };
  lastUpdated: string;
  dataStatus: "LIVE" | "STALE" | "UNAVAILABLE";
  regime: MarketRegime;
  rows: BreakoutRow[];
  selected: BreakoutDetail | null;
};

function frameToBars(symbol: string, timeframe: string, frame: ReturnType<typeof toFrame>): OHLCVBar[] {
  return frame.rows.map((r) => ({
    symbol,
    timestamp: r.timestamp,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
    timeframe,
    source: "resample",
  }));
}

async function mapPool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) || 1 }, () => worker()));
  return out;
}

async function safeBars(symbol: string, timeframe: string, outputsize = 240): Promise<OHLCVBar[]> {
  try {
    const [bars] = await analysis.bars(symbol, timeframe, outputsize);
    return bars;
  } catch {
    return [];
  }
}

async function safeQuote(symbol: string): Promise<Quote | null> {
  try {
    return await analysis.quote(symbol);
  } catch {
    return null;
  }
}

function closesOf(bars: OHLCVBar[]) {
  return bars.map((b) => b.close);
}

export function listBreakoutUniverses() {
  return {
    default: [...DEFAULT_BREAKOUT_UNIVERSE],
    etf: UNIVERSE.filter((r) => r.type === "ETF").map((r) => r.symbol),
    sectors: Object.values(SECTORS).map((s) => ({ slug: s.slug, name: s.name, etf: s.etf, tickers: s.members.map(([sym]) => sym) })),
    watchlist: listWatchlist().map((w) => w.symbol),
  };
}

export function resolveBreakoutUniverse(input: {
  source?: BreakoutUniverseSource;
  tickers?: unknown;
  sector?: string;
}): { source: BreakoutUniverseSource; tickers: string[]; errors: string[] } {
  const source = input.source || (input.tickers != null ? "custom" : "default");
  if (source === "default") return { source, tickers: [...DEFAULT_BREAKOUT_UNIVERSE], errors: [] };
  if (source === "etf") return { source, tickers: UNIVERSE.filter((r) => r.type === "ETF").map((r) => r.symbol).slice(0, BREAKOUT_MAX_TICKERS), errors: [] };
  if (source === "watchlist") {
    const tickers = listWatchlist().map((w) => w.symbol).slice(0, BREAKOUT_MAX_TICKERS);
    return { source, tickers, errors: tickers.length ? [] : ["Watchlist is empty."] };
  }
  if (source === "sector") {
    const slug = String(input.sector || "").toLowerCase();
    const meta = SECTORS[slug];
    if (!meta) return { source, tickers: [], errors: [`Unknown sector '${slug || "(missing)"}'.`] };
    return { source, tickers: meta.members.map(([sym]) => sym), errors: [] };
  }
  const parsed = parseBreakoutTickers(input.tickers);
  if (!parsed.tickers.length) return { source, tickers: [], errors: parsed.errors.length ? parsed.errors : ["Add at least one ticker."] };
  return { source: source === "search" ? "search" : "custom", tickers: parsed.tickers, errors: parsed.errors };
}

function lookback(tf: string, detail: boolean) {
  if (tf === "5m") return detail ? 160 : 80;
  if (tf === "15m") return detail ? 180 : 100;
  if (tf === "30m") return detail ? 200 : 120;
  if (tf === "1h") return detail ? 180 : 120;
  if (tf === "4h") return 180;
  if (tf === "1w") return 260;
  if (tf === "1M") return 180;
  return detail ? 400 : 280;
}

async function loadBars(symbol: string, primary: string, lifecycle: string, detail: boolean) {
  const needIntraday = ["5m", "15m", "30m", "1h", "4h"].includes(primary) || ["1h", "4h"].includes(lifecycle) || detail;
  const [daily, m30, m15, m5] = await Promise.all([
    safeBars(symbol, "1d", lookback("1d", detail)),
    needIntraday ? safeBars(symbol, "30m", lookback("30m", detail)) : Promise.resolve([] as OHLCVBar[]),
    needIntraday && (detail || primary === "15m" || primary === "1h") ? safeBars(symbol, "15m", lookback("15m", detail)) : Promise.resolve([] as OHLCVBar[]),
    (detail || primary === "5m") ? safeBars(symbol, "5m", lookback("5m", detail)) : Promise.resolve([] as OHLCVBar[]),
  ]);
  const weekly = daily.length ? frameToBars(symbol, "1w", resampleBars(toFrame(daily), "W-FRI")) : [];
  const monthly = daily.length ? resampleToMonthly(daily).map((b) => ({ ...b, symbol, timeframe: "1M" as const })) : [];
  const h4 = m30.length ? frameToBars(symbol, "4h", resampleBars(toFrame(m30), "4h")) : m15.length ? resampleToMinutes(m15, 240, "4h") : [];
  const h1 = m15.length ? resampleToMinutes(m15, 60, "1h") : m30.length ? resampleToMinutes(m30, 60, "1h") : [];
  return {
    "5m": m5,
    "15m": m15,
    "30m": m30,
    "1h": h1,
    "4h": h4,
    "1d": daily,
    "1w": weekly,
    "1M": monthly,
  };
}

export async function buildBreakoutScanner(input?: {
  source?: BreakoutUniverseSource;
  tickers?: unknown;
  sector?: string;
  timeframe?: string;
  lifecycleTimeframe?: string;
  settings?: Partial<BreakoutSettings>;
  selected?: string;
}): Promise<BreakoutScannerPayload> {
  const resolved = resolveBreakoutUniverse({ source: input?.source, tickers: input?.tickers, sector: input?.sector });
  if (!resolved.tickers.length) throw new HttpError(400, resolved.errors[0] || "Add at least one ticker.");
  const timeframe = (BREAKOUT_SCAN.has(input?.timeframe || "") ? input?.timeframe : "1d") as BreakoutScanTimeframe;
  const lifecycleTimeframe = (BREAKOUT_LIFE.has(input?.lifecycleTimeframe || "") ? input?.lifecycleTimeframe : lifecycleFromScan(timeframe)) as BreakoutLifecycleTimeframe;
  const settings = mergeBreakoutSettings({ ...DEFAULT_BREAKOUT_SETTINGS, ...input?.settings });
  const selectedSymbol = input?.selected ? parseBreakoutTickers(input.selected).tickers[0] || null : resolved.tickers[0] || null;

  const cacheKey = `breakout:v1:${resolved.source}:${resolved.tickers.join(",")}:${timeframe}:${lifecycleTimeframe}:${selectedSymbol}:${JSON.stringify(settings)}`;
  const ttl = isRegularHours() ? 50 : 180;
  const hit = cacheGet<BreakoutScannerPayload>(cacheKey);
  if (hit) return hit;

  const [spyDaily, qqqDaily, iwmDaily, vixDaily] = await Promise.all([
    safeBars("SPY", "1d", 260),
    safeBars("QQQ", "1d", 260),
    safeBars("IWM", "1d", 260),
    safeBars("^VIX", "1d", 260),
  ]);
  const sectorEtfs = [...new Set(resolved.tickers.map((t) => sectorForTicker(t).etf).filter(Boolean))];
  const sectorDaily = new Map<string, number[]>();
  await mapPool(sectorEtfs, 4, async (etf) => {
    sectorDaily.set(etf, closesOf(await safeBars(etf, "1d", 260)));
  });
  const regime = assessMarketRegime({
    spy: snapshotTimeframe(spyDaily),
    qqq: snapshotTimeframe(qqqDaily),
    iwm: snapshotTimeframe(iwmDaily),
    vix: snapshotTimeframe(vixDaily),
  });

  const rows = await mapPool(resolved.tickers, 5, async (symbol) => {
    try {
      const [quote, bars] = await Promise.all([safeQuote(symbol), loadBars(symbol, timeframe, lifecycleTimeframe, false)]);
      if (settings.minPrice && (quote?.price ?? 0) < settings.minPrice) {
        return analyzeBreakoutTicker({ symbol, quote, bars: {}, primary: timeframe, lifecycle: lifecycleTimeframe, regime, settings, error: "Below minimum price filter", lite: true }).row;
      }
      if (settings.maxPrice && quote?.price && quote.price > settings.maxPrice) {
        return analyzeBreakoutTicker({ symbol, quote, bars: {}, primary: timeframe, lifecycle: lifecycleTimeframe, regime, settings, error: "Above maximum price filter", lite: true }).row;
      }
      return analyzeBreakoutTicker({
        symbol,
        quote,
        bars,
        primary: timeframe,
        lifecycle: lifecycleTimeframe,
        spyDaily: closesOf(spyDaily),
        qqqDaily: closesOf(qqqDaily),
        sectorDaily: sectorDaily.get(sectorForTicker(symbol, quote?.sector).etf) || [],
        regime,
        settings,
        lite: true,
      }).row;
    } catch (err) {
      return analyzeBreakoutTicker({
        symbol,
        bars: {},
        primary: timeframe,
        lifecycle: lifecycleTimeframe,
        regime,
        settings,
        error: err instanceof Error ? err.message : "DATA_UNAVAILABLE",
        lite: true,
      }).row;
    }
  });

  let selected: BreakoutDetail | null = null;
  if (selectedSymbol) {
    try {
      const [quote, bars] = await Promise.all([safeQuote(selectedSymbol), loadBars(selectedSymbol, timeframe, lifecycleTimeframe, true)]);
      selected = analyzeBreakoutTicker({
        symbol: selectedSymbol,
        quote,
        bars,
        primary: timeframe,
        lifecycle: lifecycleTimeframe,
        spyDaily: closesOf(spyDaily),
        qqqDaily: closesOf(qqqDaily),
        sectorDaily: sectorDaily.get(sectorForTicker(selectedSymbol, quote?.sector).etf) || [],
        regime,
        settings,
        lite: false,
      }).detail;
    } catch {
      selected = analyzeBreakoutTicker({
        symbol: selectedSymbol,
        bars: {},
        primary: timeframe,
        lifecycle: lifecycleTimeframe,
        regime,
        settings,
        error: "DATA_UNAVAILABLE",
      }).detail;
    }
  }

  const filtered = rows.filter((r) => (r.score ?? 0) >= settings.minScore);
  const stale = filtered.every((r) => r.state === "INSUFFICIENT_DATA");
  const payload: BreakoutScannerPayload = {
    source: resolved.source,
    tickers: resolved.tickers,
    timeframe,
    lifecycleTimeframe,
    settings,
    marketStatus: { state: isRegularHours() ? "OPEN" : "CLOSED", note: "Using latest available market data" },
    lastUpdated: new Date().toISOString(),
    dataStatus: stale ? "UNAVAILABLE" : "LIVE",
    regime,
    rows: filtered.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    selected,
  };
  cacheSet(cacheKey, payload, ttl);
  void CACHE_TTL;
  return payload;
}

const BREAKOUT_SCAN = new Set(["5m", "15m", "30m", "1h", "4h", "1d", "1w"]);
const BREAKOUT_LIFE = new Set(["1h", "4h", "1d", "1w", "1M"]);

function lifecycleFromScan(tf: string): BreakoutLifecycleTimeframe {
  if (tf === "1w") return "1w";
  if (tf === "4h") return "4h";
  if (tf === "1h" || tf === "30m" || tf === "15m" || tf === "5m") return "1h";
  return "1d";
}
