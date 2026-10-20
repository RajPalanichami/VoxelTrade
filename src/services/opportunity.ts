import { CACHE_TTL } from "@/src/config/env";
import {
  assessMarketRegime,
  analyzeOpportunityTicker,
  resampleToMinutes,
  sectorForTicker,
  snapshotTimeframe,
  summarizeStates,
  type MarketRegime,
  type OpportunityRow,
} from "@/src/engines/opportunityEngine";
import { HttpError } from "@/src/lib/errors";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { resampleBars, toFrame, isRegularHours } from "@/src/providers/base";
import { analysis } from "@/src/services/analysis";
import {
  appendOpportunityEvents,
  filterFreshOpportunityAlerts,
  getOpportunityStore,
  saveOpportunityStore,
} from "@/src/repositories/store";
import type { OHLCVBar, Quote } from "@/src/types/domain";
import {
  DEFAULT_OPPORTUNITY_SETTINGS,
  DEFAULT_OPPORTUNITY_UNIVERSE,
  mergeOpportunitySettings,
  parseOpportunityUniverse,
  isDefaultUniverse,
  type OpportunitySettings,
  type OpportunityTimeframe,
} from "@/lib/opportunity";

export type OpportunityPayload = {
  universe: { source: "default" | "custom"; tickers: string[]; count: number; max: number };
  settings: OpportunitySettings;
  marketStatus: { state: "OPEN" | "CLOSED"; note: string };
  lastUpdated: string;
  dataStatus: "LIVE" | "STALE" | "UNAVAILABLE";
  regime: MarketRegime;
  summary: ReturnType<typeof summarizeStates>;
  rows: OpportunityRow[];
  alerts: { symbol: string; type: string; message: string }[];
};

export function loadOpportunityPrefs() {
  const stored = getOpportunityStore();
  const settings = mergeOpportunitySettings(stored?.settings as Partial<OpportunitySettings> | undefined);
  if (!stored || !stored.tickers?.length || stored.source === "default") {
    return { source: "default" as const, tickers: [...DEFAULT_OPPORTUNITY_UNIVERSE], settings, events: stored?.events || [] };
  }
  const parsed = parseOpportunityUniverse(stored.tickers);
  const tickers = parsed.tickers.length ? parsed.tickers : [...DEFAULT_OPPORTUNITY_UNIVERSE];
  return {
    source: isDefaultUniverse(tickers) ? ("default" as const) : ("custom" as const),
    tickers,
    settings,
    events: stored.events || [],
  };
}

export function persistOpportunityUniverse(raw: unknown, settings?: Partial<OpportunitySettings>) {
  const parsed = parseOpportunityUniverse(raw);
  if (parsed.errors.length) throw new HttpError(400, parsed.errors[0]);
  if (!parsed.tickers.length) throw new HttpError(400, "Add at least one ticker to begin analysis.");
  const current = loadOpportunityPrefs();
  const nextSettings = mergeOpportunitySettings({ ...current.settings, ...settings });
  const source = isDefaultUniverse(parsed.tickers) ? "default" : "custom";
  return saveOpportunityStore({
    source,
    tickers: parsed.tickers,
    settings: nextSettings,
    events: current.events,
    alertsFired: getOpportunityStore()?.alertsFired,
  });
}

export function resetOpportunityUniverse() {
  const current = loadOpportunityPrefs();
  return saveOpportunityStore({
    source: "default",
    tickers: [...DEFAULT_OPPORTUNITY_UNIVERSE],
    settings: current.settings,
    events: current.events,
    alertsFired: getOpportunityStore()?.alertsFired,
  });
}

export function persistOpportunitySettings(raw: Partial<OpportunitySettings>) {
  const current = loadOpportunityPrefs();
  const settings = mergeOpportunitySettings({ ...current.settings, ...raw });
  return saveOpportunityStore({
    source: current.source,
    tickers: current.tickers,
    settings,
    events: current.events,
    alertsFired: getOpportunityStore()?.alertsFired,
  });
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

function closesOf(bars: OHLCVBar[]) {
  return bars.map((b) => b.close);
}

export async function validateOpportunityTickers(raw: unknown) {
  const parsed = parseOpportunityUniverse(raw);
  if (!parsed.tickers.length) {
    return { tickers: [] as string[], errors: parsed.errors.length ? parsed.errors : ["Add at least one ticker to begin analysis."] };
  }
  const extra: string[] = [...parsed.errors];
  const valid: string[] = [];
  await mapPool(parsed.tickers, 6, async (symbol) => {
    const quote = await safeQuote(symbol);
    if (!quote) extra.push(`Invalid or unsupported ticker: ${symbol}`);
    else valid.push(symbol);
  });
  return { tickers: valid, errors: extra };
}

export async function buildOpportunityMonitor(input?: {
  tickers?: unknown;
  settings?: Partial<OpportunitySettings>;
  persist?: boolean;
}): Promise<OpportunityPayload> {
  const prefs = loadOpportunityPrefs();
  let tickers = prefs.tickers;
  let source = prefs.source;
  if (input?.tickers != null) {
    const parsed = parseOpportunityUniverse(input.tickers);
    if (parsed.errors.length && !parsed.tickers.length) throw new HttpError(400, parsed.errors[0]);
    if (parsed.errors.some((e) => e.startsWith("Duplicate") || e.startsWith("Invalid") || e.startsWith("Maximum"))) {
      throw new HttpError(400, parsed.errors[0]);
    }
    tickers = parsed.tickers;
    source = isDefaultUniverse(tickers) ? "default" : "custom";
  }
  const settings = mergeOpportunitySettings({ ...prefs.settings, ...input?.settings });
  if (input?.persist) {
    saveOpportunityStore({ source, tickers, settings, events: prefs.events });
  }

  const cacheKey = `opportunity:v4:${tickers.join(",")}:${JSON.stringify(settings)}`;
  const ttl = isRegularHours() ? 45 : 180;
  const hit = cacheGet<OpportunityPayload>(cacheKey);
  if (hit) return hit;

  const t0 = Date.now();
  const benchSymbols = ["SPY", "QQQ", "IWM", "^VIX"];
  const sectorEtfs = [...new Set(tickers.map((t) => sectorForTicker(t).etf).filter(Boolean))];

  const [spyDaily, qqqDaily, iwmDaily, vixDaily] = await Promise.all([
    safeBars("SPY", "1d", 260),
    safeBars("QQQ", "1d", 260),
    safeBars("IWM", "1d", 260),
    safeBars("^VIX", "1d", 260),
  ]);
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

  const rows = await mapPool(tickers, 5, async (symbol) => {
    try {
      const [quote, daily, m30, m15, m5, news, earn] = await Promise.all([
        safeQuote(symbol),
        safeBars(symbol, "1d", 320),
        safeBars(symbol, "30m", 180),
        safeBars(symbol, "15m", 160),
        safeBars(symbol, "5m", 120),
        analysis.first("fetchNews", symbol).catch(() => []) as Promise<Record<string, unknown>[]>,
        analysis.first("fetchEarnings", symbol).catch(() => null) as Promise<Record<string, unknown> | null>,
      ]);
      const weekly = daily.length ? frameToBars(symbol, "1w", resampleBars(toFrame(daily), "W-FRI")) : [];
      const h4 = m30.length ? frameToBars(symbol, "4h", resampleBars(toFrame(m30), "4h")) : resampleToMinutes(m15, 240, "4h");
      const h1 = m15.length ? resampleToMinutes(m15, 60, "1h") : resampleToMinutes(m30, 60, "1h");
      const bars: Partial<Record<OpportunityTimeframe, OHLCVBar[]>> = {
        "1w": weekly,
        "1d": daily,
        "4h": h4,
        "1h": h1,
        "30m": m30,
        "15m": m15,
        "5m": m5,
      };
      const sector = sectorForTicker(symbol, quote?.sector);
      return analyzeOpportunityTicker({
        symbol,
        quote,
        bars,
        spyDaily: closesOf(spyDaily),
        qqqDaily: closesOf(qqqDaily),
        sectorDaily: sectorDaily.get(sector.etf) || [],
        news: news || [],
        earningsDays: typeof earn?.days_to_earnings === "number" ? earn.days_to_earnings : null,
        earningsDate: earn?.earnings_date ? String(earn.earnings_date) : null,
        regime,
        settings,
      });
    } catch (err) {
      return analyzeOpportunityTicker({
        symbol,
        bars: {},
        regime,
        settings,
        error: err instanceof Error ? err.message : "Data unavailable",
      });
    }
  });

  const previous = new Map(prefs.events.filter((e) => tickers.includes(e.symbol)).map((e) => [e.symbol, e.to]));
  const nextEvents = rows
    .filter((row) => previous.get(row.symbol) && previous.get(row.symbol) !== row.state)
    .map((row) => ({
      symbol: row.symbol,
      at: new Date().toISOString(),
      from: previous.get(row.symbol) || "DEVELOPING",
      to: row.state,
      note: row.setup,
    }));
  if (nextEvents.length) {
    try {
      appendOpportunityEvents(nextEvents);
    } catch {
      /* persistence is optional */
    }
  }

  const open = isRegularHours();
  const stale = rows.every((r) => r.state === "INSUFFICIENT DATA");
  const payload: OpportunityPayload = {
    universe: { source, tickers, count: tickers.length, max: 20 },
    settings,
    marketStatus: {
      state: open ? "OPEN" : "CLOSED",
      note: open ? "Using latest available market data" : "Using latest available market data",
    },
    lastUpdated: new Date().toISOString(),
    dataStatus: stale ? "UNAVAILABLE" : rows.some((r) => r.freshness.stale) ? "STALE" : "LIVE",
    regime,
    summary: summarizeStates(rows),
    rows,
    alerts: filterFreshOpportunityAlerts(rows.flatMap((r) => r.alerts.map((a) => ({ symbol: r.symbol, type: a.type, message: a.message, key: a.key })))),
  };
  cacheSet(cacheKey, payload, ttl);
  void t0;
  void benchSymbols;
  void CACHE_TTL;
  return payload;
}
