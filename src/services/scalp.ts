import { SECTOR_ETF, CACHE_TTL } from "@/src/config/env";
import { isScalpTimeframe, type ScalpAnalysis, type ScalpTimeframe } from "@/lib/scalp";
import { buildScalpAnalysis } from "@/src/engines/scalpEngine";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";
import { headlineCategory, headlineSentiment } from "@/src/providers/base";
import { analysis } from "@/src/services/analysis";
import { getTickerMarketContext } from "@/src/services/marketContext";
import type { TickerMarketContext } from "@/lib/extendedHours";
import type { OHLCVBar, Quote } from "@/src/types/domain";

const LIVE_KEY = (symbol: string, tf: string) => `scalp:v3:${symbol}:${tf}`;

function sectorEtf(sector?: string | null) {
  if (!sector) return "XLK";
  return SECTOR_ETF[sector] || SECTOR_ETF[sector.replace(/ Sector$/i, "")] || "XLK";
}

async function safeQuote(symbol: string): Promise<Quote | null> {
  try {
    return await analysis.quote(symbol);
  } catch {
    return null;
  }
}

async function safeBars(symbol: string, tf: string, size = 320): Promise<OHLCVBar[]> {
  try {
    const [bars] = await analysis.bars(symbol, tf, size);
    return bars;
  } catch {
    return [];
  }
}

export function normalizeScalpTimeframe(value: string): ScalpTimeframe {
  const v = value.toLowerCase().replace(/\s+/g, "").replace("min", "m").replace("utes", "");
  const mapped = v === "5" ? "5m" : v === "15" ? "15m" : v === "30" ? "30m" : v;
  if (!isScalpTimeframe(mapped)) throw new HttpError(400, `Unsupported scalp timeframe '${value}'. Use: 5m, 15m, 30m`);
  return mapped;
}

export async function buildScalpAnalyzer(symbol: string, timeframe: string = "15m"): Promise<ScalpAnalysis> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !/^[A-Z][A-Z0-9.]{0,6}$/.test(ticker)) throw new HttpError(400, "A valid ticker is required.");
  const primary = normalizeScalpTimeframe(timeframe);
  const cached = cacheGet<ScalpAnalysis>(LIVE_KEY(ticker, primary));
  if (cached?.ticker === ticker) return cached;

  const t0 = Date.now();
  const quote = await analysis.quote(ticker);
  let marketContext: TickerMarketContext | null = null;
  try {
    marketContext = await getTickerMarketContext(ticker);
  } catch {
    marketContext = null;
  }
  const [b5, b15, b30, b1h, b1d, spy, qqq, vix, sectorQ, newsRaw] = await Promise.all([
    safeBars(ticker, "5m"),
    safeBars(ticker, "15m"),
    safeBars(ticker, "30m"),
    safeBars(ticker, "1h", 200),
    safeBars(ticker, "1d", 80),
    safeQuote("SPY"),
    safeQuote("QQQ"),
    safeQuote("^VIX"),
    safeQuote(sectorEtf(quote.sector)),
    analysis.first("fetchNews", ticker).catch(() => []) as Promise<Record<string, unknown>[]>,
  ]);

  const news = (Array.isArray(newsRaw) ? newsRaw : []).slice(0, 8).map((item) => ({
    headline: String(item.title || item.headline || ""),
    source: String(item.source || item.publisher || "news"),
    publishedAt: item.publishedAt ? String(item.publishedAt) : item.datetime ? String(item.datetime) : null,
    sentiment: headlineSentiment(String(item.title || item.headline || "")),
    category: headlineCategory(String(item.title || item.headline || "")),
  })).filter((n) => n.headline);

  const data = buildScalpAnalysis({
    ticker,
    name: quote.name,
    primary,
    quote,
    bars: { "5m": b5, "15m": b15, "30m": b30, "1h": b1h, "1d": b1d },
    context: { spy, qqq, vix, sector: sectorQ, sectorName: quote.sector || sectorQ?.name || "Sector" },
    news,
    source: quote.freshness?.source || "composite",
    marketContext,
  });
  data.timestamp = new Date().toISOString();
  (data as ScalpAnalysis & { latency_ms?: number }).latency_ms = Date.now() - t0;
  cacheSet(LIVE_KEY(ticker, primary), data, CACHE_TTL["5m"] || 20);
  return data;
}
