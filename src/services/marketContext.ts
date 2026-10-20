import { CACHE_TTL } from "@/src/config/env";
import { assembleTickerMarketContext, toSessionBars } from "@/src/engines/extendedHours";
import type { TickerMarketContext } from "@/lib/extendedHours";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";
import { analysis } from "@/src/services/analysis";
import { YFinanceProvider } from "@/src/providers/yfinance";
import type { OHLCVBar } from "@/src/types/domain";

const LIVE_KEY = (symbol: string) => `market-context:v1:${symbol}`;
const inflight = new Map<string, Promise<TickerMarketContext>>();

async function fetchExtendedBars(symbol: string): Promise<{ bars: OHLCVBar[]; source: string; failed: boolean }> {
  for (const provider of analysis.chain()) {
    if (!provider.fetchExtendedHoursBars) continue;
    try {
      const bars = await provider.fetchExtendedHoursBars(symbol, "1m");
      if (bars.length) return { bars, source: provider.name, failed: false };
    } catch {
      /* try next provider that actually implements extended hours */
    }
  }
  try {
    const yahoo = new YFinanceProvider();
    const bars = await yahoo.fetchExtendedHoursBars(symbol, "1m");
    return { bars, source: yahoo.name, failed: false };
  } catch {
    try {
      const yahoo = new YFinanceProvider();
      const bars = await yahoo.fetchExtendedHoursBars(symbol, "5m");
      return { bars, source: yahoo.name, failed: false };
    } catch {
      return { bars: [], source: "none", failed: true };
    }
  }
}

export async function getTickerMarketContext(symbol: string, now = new Date()): Promise<TickerMarketContext> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !/^[A-Z^][A-Z0-9.]{0,7}$/.test(ticker)) throw new HttpError(400, "A valid ticker is required.");
  const cached = cacheGet<TickerMarketContext>(LIVE_KEY(ticker));
  if (cached?.symbol === ticker) return cached;
  const pending = inflight.get(ticker);
  if (pending) return pending;

  const work = (async () => {
    let quotePrice: number | null = null;
    let quoteVolume: number | null = null;
    let name = ticker;
    let quoteAt = now;
    let source = "composite";
    try {
      const quote = await analysis.quote(ticker);
      quotePrice = quote.price;
      quoteVolume = quote.volume ?? null;
      name = quote.name || ticker;
      quoteAt = quote.freshness?.timestamp ? new Date(quote.freshness.timestamp) : now;
      source = quote.freshness?.source || source;
    } catch {
      /* regular quote failure is not fatal for session classification */
    }
    const [dailyResult, extended] = await Promise.all([
      analysis.bars(ticker, "1d", 40).catch(() => [[], "none", 0] as [OHLCVBar[], string, number]),
      fetchExtendedBars(ticker),
    ]);
    const data = assembleTickerMarketContext({
      symbol: ticker,
      name,
      quotePrice,
      quoteVolume,
      quoteAt,
      daily: toSessionBars(dailyResult[0] || []),
      extendedBars: toSessionBars(extended.bars),
      source: extended.failed ? source : extended.source || source,
      providerFailed: extended.failed,
      now,
    });
    cacheSet(LIVE_KEY(ticker), data, CACHE_TTL.marketContext || 15);
    return data;
  })();

  inflight.set(ticker, work);
  try {
    return await work;
  } finally {
    inflight.delete(ticker);
  }
}

export async function getMarketContextMap(symbols: string[]): Promise<Record<string, TickerMarketContext | null>> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (symbol) => {
      try {
        return [symbol, await getTickerMarketContext(symbol)] as const;
      } catch {
        return [symbol, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
