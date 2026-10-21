import { CACHE_TTL, INDEX_SYMBOLS } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";
import { analysis } from "@/src/services/analysis";
import { getTickerMarketContext } from "@/src/services/marketContext";
import { buildMarketEvents } from "@/src/services/marketEvents";
import { calculateLevels } from "@/src/engines/supportResistance";
import { assembleStockDecision, mtfFromIndicators } from "@/src/engines/stockDecisionEngine";
import { compactTfScore } from "@/src/engines/stockDecisionScore";
import { computeAll, last, slope, structureFlags } from "@/src/engines/indicators";
import { resampleToMonthly } from "@/src/engines/chartPatterns";
import { toFrame } from "@/src/providers/base";
import {
  STOCK_DECISION_TIMEFRAMES,
  isStockDecisionTimeframe,
  type StockDecisionMap,
  type StockDecisionTimeframe,
} from "@/lib/stockDecision";
import type { Indicators, OHLCVBar } from "@/src/types/domain";
import { emptyIndicators } from "@/src/types/domain";

async function settled<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function indicatorsFromBars(bars: OHLCVBar[]): Indicators {
  const df = toFrame(bars);
  const framed = computeAll(df);
  const lastRow = framed.rows[framed.rows.length - 1];
  const prev = framed.rows.length > 1 ? framed.rows[framed.rows.length - 2] : lastRow;
  const num = (row: typeof lastRow, col: string) => {
    const v = row[col];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return emptyIndicators({
    ema9: last(framed.get("ema9")),
    ema20: last(framed.get("ema20")),
    ema21: last(framed.get("ema21")),
    ema50: last(framed.get("ema50")),
    ema200: last(framed.get("ema200")),
    ema9_slope: slope(framed.get("ema9")),
    ema20_slope: slope(framed.get("ema20")),
    ema21_slope: slope(framed.get("ema21")),
    ema50_slope: slope(framed.get("ema50")),
    ema200_slope: slope(framed.get("ema200")),
    rsi: last(framed.get("rsi")),
    rsi_prev: num(prev, "rsi"),
    macd: last(framed.get("macd")),
    macd_signal: last(framed.get("macd_signal")),
    macd_hist: last(framed.get("macd_hist")),
    macd_hist_prev: num(prev, "macd_hist"),
    vwap: last(framed.get("vwap")),
    atr: last(framed.get("atr")),
    volume_sma20: last(framed.get("volume_sma20")),
    volume_ratio: last(framed.get("volume_ratio")),
    last_volume: Number(lastRow?.volume),
    last_close: Number(lastRow?.close),
    last_high: Number(lastRow?.high),
    last_low: Number(lastRow?.low),
    ...structureFlags(framed.get("high"), framed.get("low")),
  });
}

function resampleToWeekly(bars: OHLCVBar[]): OHLCVBar[] {
  const buckets = new Map<string, OHLCVBar[]>();
  for (const bar of bars) {
    const d = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = day.getUTCDay();
    day.setUTCDate(day.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const key = day.toISOString().slice(0, 10);
    const list = buckets.get(key) || [];
    list.push(bar);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, list]) => {
      const first = list[0];
      const lastBar = list[list.length - 1];
      return {
        ...lastBar,
        timestamp: lastBar.timestamp,
        open: first.open,
        high: Math.max(...list.map((b) => b.high)),
        low: Math.min(...list.map((b) => b.low)),
        close: lastBar.close,
        volume: list.reduce((sum, b) => sum + b.volume, 0),
        timeframe: "1w",
      };
    });
}

async function loadDecisionPack(ticker: string, timeframe: StockDecisionTimeframe): Promise<[Indicators, OHLCVBar[], string]> {
  const packKey = `stockdecision:pack:v1:${ticker}:${timeframe}`;
  const cached = cacheGet<[Indicators, OHLCVBar[], string]>(packKey);
  if (cached) return cached;
  if (timeframe === "1M") {
    const [daily, source] = await analysis.bars(ticker, "1d", 1400);
    const monthly = resampleToMonthly(daily).map((bar) => ({ ...bar, symbol: ticker, timeframe: "1M" }));
    if (monthly.length < 12) throw new HttpError(422, "Unable to retrieve enough market data for the selected timeframe.");
    const pack: [Indicators, OHLCVBar[], string] = [indicatorsFromBars(monthly), monthly, source];
    cacheSet(packKey, pack, CACHE_TTL.stockDecision || 45);
    return pack;
  }
  const [ind, bars, source] = await analysis.indicators(ticker, timeframe);
  const pack: [Indicators, OHLCVBar[], string] = [ind, bars, source];
  cacheSet(packKey, pack, CACHE_TTL.stockDecision || 45);
  return pack;
}

export function normalizeStockDecisionTimeframe(value: string | null | undefined): StockDecisionTimeframe {
  const trimmed = String(value || "1d").trim();
  if (trimmed === "1M" || /^(1mo|1month|monthly)$/i.test(trimmed)) return "1M";
  const raw = trimmed.toLowerCase().replace(/\s+/g, "");
  const aliases: Record<string, StockDecisionTimeframe> = {
    "5m": "5m",
    "5min": "5m",
    "15m": "15m",
    "15min": "15m",
    "15minutes": "15m",
    "30m": "30m",
    "30min": "30m",
    "1h": "1h",
    "1hr": "1h",
    "1hour": "1h",
    "60m": "1h",
    "4h": "4h",
    "4hr": "4h",
    "4hour": "4h",
    "1d": "1d",
    daily: "1d",
    "1w": "1w",
    weekly: "1w",
    "1wk": "1w",
  };
  const tf = aliases[raw];
  if (!tf || !isStockDecisionTimeframe(tf)) {
    throw new HttpError(400, "Unsupported timeframe. Use: 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M");
  }
  return tf;
}

function eventRiskFrom(events: Awaited<ReturnType<typeof buildMarketEvents>> | null) {
  const upcoming = (events?.events || []).filter((e) => e.status === "upcoming" && (e.impact === "High" || e.impact === "Critical"));
  if (!upcoming.length) {
    return { label: "NORMAL", detail: "No high-impact US event is flagged on the current calendar snapshot. Event risk is not used to invent a trade." };
  }
  const first = upcoming[0];
  return {
    label: first.impact === "Critical" ? "HIGH" : "HIGH",
    detail: `${first.name} is upcoming (${first.dateLabel} ${first.timeLabel}). Event risk is flagged; it does not automatically invalidate structure.`,
  };
}

export async function buildStockDecision(symbol: string, timeframe: StockDecisionTimeframe): Promise<StockDecisionMap> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !/^[A-Z][A-Z0-9.\-]{0,11}$/.test(ticker)) {
    throw new HttpError(400, "Invalid ticker. Use a symbol such as META or NVDA.");
  }
  const key = `stockdecision:v2:${ticker}:${timeframe}`;
  const hit = cacheGet<StockDecisionMap>(key);
  if (hit) return hit;

  const quote = await analysis.quote(ticker);
  const [ind, bars, source] = await loadDecisionPack(ticker, timeframe);
  const price = quote.price || ind.last_close || 0;
  const levels = calculateLevels(toFrame(bars), ind, price);

  const mtfTargets = STOCK_DECISION_TIMEFRAMES.filter((tf) => tf !== timeframe && tf !== "1M" && tf !== "1w");
  const [context, events, dailyPack, spy, qqq, iwm, vix, fundamentals, ...mtfPacks] = await Promise.all([
    settled(() => getTickerMarketContext(ticker)),
    settled(() => buildMarketEvents()),
    settled(async (): Promise<[Indicators, OHLCVBar[], string]> => {
      if (timeframe === "1d") return [ind, bars, source];
      const [dailyInd, dailyBars, dailySource] = await analysis.indicators(ticker, "1d");
      return [dailyInd, dailyBars, dailySource];
    }),
    settled(() => analysis.quote("SPY")),
    settled(() => analysis.quote(INDEX_SYMBOLS.qqq)),
    settled(() => analysis.quote("IWM")),
    settled(() => analysis.quote(INDEX_SYMBOLS.vix)),
    settled(() => analysis.first("fetchFundamentals", ticker)),
    ...mtfTargets.map((tf) => settled(() => loadDecisionPack(ticker, tf))),
  ]);

  const dailyBars = dailyPack?.[1] || (timeframe === "1d" ? bars : []);
  const weeklyBars = dailyBars.length ? resampleToWeekly(dailyBars).map((bar) => ({ ...bar, symbol: ticker, timeframe: "1w" })) : [];
  const weeklyInd = weeklyBars.length >= 20 ? indicatorsFromBars(weeklyBars) : timeframe === "1w" ? ind : null;
  const monthlyBars = dailyBars.length ? resampleToMonthly(dailyBars).map((bar) => ({ ...bar, symbol: ticker, timeframe: "1M" })) : [];
  const monthlyInd = monthlyBars.length >= 12 ? indicatorsFromBars(monthlyBars) : null;
  const packFor = (tf: StockDecisionTimeframe): Indicators | null => {
    if (tf === timeframe) return ind;
    if (tf === "1w") return weeklyInd;
    if (tf === "1M") return monthlyInd;
    const idx = mtfTargets.indexOf(tf);
    return idx >= 0 ? mtfPacks[idx]?.[0] || null : null;
  };
  const mtf = STOCK_DECISION_TIMEFRAMES.map((tf) => mtfFromIndicators(tf, packFor(tf)));
  const mtfScores = STOCK_DECISION_TIMEFRAMES.map((tf) => compactTfScore(tf, packFor(tf), packFor(tf)?.last_close ?? (tf === timeframe ? price : null)));
  const sharesRaw = (fundamentals as { shares?: unknown } | null)?.shares;
  const floatShares = typeof sharesRaw === "number" && Number.isFinite(sharesRaw) && sharesRaw > 0 ? sharesRaw : null;

  const map = assembleStockDecision({
    symbol: ticker,
    name: quote.name || ticker,
    timeframe,
    quote: { ...quote, freshness: { ...quote.freshness, source: source || quote.freshness.source } },
    bars,
    indicators: ind,
    levels,
    context,
    dailyBars,
    market: {
      spy: spy?.change_percent ?? null,
      qqq: qqq?.change_percent ?? null,
      iwm: iwm?.change_percent ?? null,
      vix: vix?.price ?? null,
    },
    mtf,
    mtfScores,
    floatShares,
    eventRisk: eventRiskFrom(events),
  });
  cacheSet(key, map, CACHE_TTL.stockDecision || 45);
  return map;
}
