import type { CryptoCandle, CryptoQuote } from "@/lib/crypto";
import { getSettings } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { ProviderError } from "@/src/lib/errors";
import { httpGetJson, toFloat } from "@/src/lib/http";
import { normalizeBinanceTicker } from "@/src/engines/cryptoQuotes";
import { binanceSpotSymbol, normalizeCryptoSymbol } from "@/src/engines/cryptoSymbols";

export { normalizeBinanceTicker } from "@/src/engines/cryptoQuotes";

const SPOT = () => getSettings().binanceRestBaseUrl.replace(/\/$/, "");
const FUT = () => getSettings().binanceFuturesBaseUrl.replace(/\/$/, "");

const INTERVAL: Record<string, string> = {
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
  "1M": "1M",
};

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit) return hit;
  const data = await fn();
  cacheSet(key, data, ttl);
  return data;
}

export async function fetchBinanceTicker(symbol: string): Promise<CryptoQuote> {
  const pair = binanceSpotSymbol(symbol);
  if (!pair) throw new ProviderError("Binance", `No USDT pair for ${symbol}`);
  const raw = await cached(`bn:ticker:${pair}`, 8, () =>
    httpGetJson<Record<string, unknown>>(`${SPOT()}/api/v3/ticker/24hr`, { symbol: pair }),
  );
  const quote = normalizeBinanceTicker(raw);
  if (!quote) throw new ProviderError("Binance", `Rejected ticker for ${pair}`);
  return quote;
}

export async function fetchBinanceKlines(symbol: string, timeframe: string, limit = 300): Promise<CryptoCandle[]> {
  const pair = binanceSpotSymbol(symbol);
  const interval = INTERVAL[timeframe];
  if (!pair || !interval) throw new ProviderError("Binance", `Unsupported Binance history ${symbol} ${timeframe}`);
  const ttl = timeframe === "5m" || timeframe === "15m" ? 20 : timeframe === "1d" || timeframe === "1w" || timeframe === "1M" ? 180 : 45;
  const rows = await cached(`bn:klines:${pair}:${interval}:${limit}`, ttl, () =>
    httpGetJson<unknown[][]>(`${SPOT()}/api/v3/klines`, { symbol: pair, interval, limit }),
  );
  if (!Array.isArray(rows)) throw new ProviderError("Binance", "Klines payload malformed");
  return rows
    .map((row) => {
      const time = Math.floor(Number(row[0]) / 1000);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5]);
      if (![time, open, high, low, close].every(Number.isFinite) || close <= 0) return null;
      return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
    })
    .filter((r): r is CryptoCandle => r != null);
}

export async function fetchBinanceDerivatives(symbol: string) {
  const pair = binanceSpotSymbol(symbol);
  if (!pair) return null;
  try {
    const [oi, prem, ls] = await Promise.allSettled([
      cached(`bn:oi:${pair}`, 30, () => httpGetJson<{ openInterest?: string }>(`${FUT()}/fapi/v1/openInterest`, { symbol: pair })),
      cached(`bn:prem:${pair}`, 20, () =>
        httpGetJson<{ lastFundingRate?: string; markPrice?: string; indexPrice?: string }>(`${FUT()}/fapi/v1/premiumIndex`, { symbol: pair }),
      ),
      cached(`bn:ls:${pair}`, 60, () =>
        httpGetJson<Array<{ longShortRatio?: string }>>(`${FUT()}/futures/data/globalLongShortAccountRatio`, {
          symbol: pair,
          period: "1h",
          limit: 1,
        }),
      ),
    ]);
    const openInterest = oi.status === "fulfilled" ? toFloat(oi.value.openInterest) : null;
    const fundingRate = prem.status === "fulfilled" ? toFloat(prem.value.lastFundingRate) : null;
    const markPrice = prem.status === "fulfilled" ? toFloat(prem.value.markPrice) : null;
    const indexPrice = prem.status === "fulfilled" ? toFloat(prem.value.indexPrice) : null;
    const longShortRatio = ls.status === "fulfilled" ? toFloat(ls.value[0]?.longShortRatio) : null;
    const basis = markPrice != null && indexPrice ? ((markPrice / indexPrice - 1) * 100) : null;
    return {
      symbol: normalizeCryptoSymbol(symbol),
      openInterest,
      fundingRate,
      longShortRatio,
      markPrice,
      indexPrice,
      basis,
      volume24h: null,
      source: "Binance Futures",
    };
  } catch {
    return null;
  }
}
