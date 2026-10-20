import { CACHE_TTL } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { fetchFearGreedIndex } from "@/src/providers/fearGreed";
import type { MarketGaugeData } from "@/lib/fearGreed";

const LIVE_KEY = "market-gauge:v2";
const STALE_KEY = "market-gauge:last:v2";

export async function buildMarketGauge(): Promise<MarketGaugeData> {
  const hit = cacheGet<MarketGaugeData>(LIVE_KEY);
  if (hit?.current) return hit;
  try {
    const data = await fetchFearGreedIndex();
    const live: MarketGaugeData = { ...data, data_status: "LIVE", last_updated: new Date().toISOString() };
    cacheSet(LIVE_KEY, live, CACHE_TTL.macro);
    cacheSet(STALE_KEY, live, 86_400);
    return live;
  } catch (err) {
    const stale = cacheGet<MarketGaugeData>(STALE_KEY);
    if (stale?.current) {
      return {
        ...stale,
        data_status: "STALE",
        last_updated: stale.last_updated,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    return {
      current: { value: Number.NaN, classification: "Neutral", timestamp: new Date().toISOString() },
      source: "none",
      data_status: "UNAVAILABLE",
      last_updated: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function unavailableGauge(message = "Data temporarily unavailable"): MarketGaugeData {
  return {
    current: { value: Number.NaN, classification: "Neutral", timestamp: new Date().toISOString() },
    source: "none",
    data_status: "UNAVAILABLE",
    last_updated: new Date().toISOString(),
    error: message,
  };
}
