import { CACHE_TTL } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";
import { toFrame } from "@/src/providers/base";
import { analysis } from "@/src/services/analysis";
import { getTickerMarketContext } from "@/src/services/marketContext";
import { fetchChain } from "@/src/services/options";
import { calculateLevels } from "@/src/engines/supportResistance";
import { assembleTradePlan } from "@/src/engines/tradePlanEngine";
import { isTradePlanTimeframe, type TradePlanMap, type TradePlanTimeframe } from "@/lib/tradePlan";

async function settled<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export function normalizeTradePlanTimeframe(value: string | null | undefined): TradePlanTimeframe {
  const raw = String(value || "1h").trim().toLowerCase().replace(/\s+/g, "");
  const aliases: Record<string, TradePlanTimeframe> = {
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
  };
  const tf = aliases[raw];
  if (!tf || !isTradePlanTimeframe(tf)) {
    throw new HttpError(400, "Unsupported timeframe. Use: 15m, 30m, 1h, 4h");
  }
  return tf;
}

export async function buildTradePlan(symbol: string, timeframe: TradePlanTimeframe): Promise<TradePlanMap> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !/^[A-Z][A-Z0-9.\-]{0,11}$/.test(ticker)) {
    throw new HttpError(400, "Invalid ticker. Use a symbol such as NVDA or AAPL.");
  }
  const key = `tradeplan:v4:${ticker}:${timeframe}`;
  const hit = cacheGet<TradePlanMap>(key);
  if (hit) return hit;

  const quote = await analysis.quote(ticker);
  const [ind, bars, source] = await analysis.indicators(ticker, timeframe);
  const frame = toFrame(bars);
  const price = quote.price || ind.last_close || 0;
  const levels = calculateLevels(frame, ind, price);
  const [context, chain] = await Promise.all([
    settled(() => getTickerMarketContext(ticker)),
    timeframe === "4h" ? settled(() => fetchChain(ticker)) : Promise.resolve(null),
  ]);

  const map = assembleTradePlan({
    symbol: ticker,
    name: quote.name || ticker,
    timeframe,
    quote: { ...quote, freshness: { ...quote.freshness, source: source || quote.freshness.source } },
    bars,
    frame,
    indicators: ind,
    levels,
    context,
    optionChain: chain
      ? {
          expiration: String(chain.expiration || ""),
          calls: (chain.calls as Array<{ strike: number }>) || [],
          puts: (chain.puts as Array<{ strike: number }>) || [],
        }
      : null,
  });
  cacheSet(key, map, CACHE_TTL.tradePlan || 45);
  return map;
}
