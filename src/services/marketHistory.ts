import { CACHE_TTL } from "@/src/config/env";
import {
  assembleMarketHistory,
  cashSessionSettled,
  sessionDateFromTimestamp,
  type HistoryPoint,
  type MarketHistoryPayload,
} from "@/src/engines/marketHistory";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { singleFlight } from "@/src/lib/singleFlight";
import { isoDateEastern } from "@/src/lib/easternTime";
import { analysis } from "@/src/services/analysis";
import type { OHLCVBar } from "@/src/types/domain";

const SYMBOLS = {
  vix: "^VIX",
  brent: "BZ=F",
  spy: "SPY",
} as const;

async function loadDaily(symbol: string): Promise<{ points: HistoryPoint[]; source: string | null; error: string | null }> {
  try {
    const [bars, source] = await analysis.bars(symbol, "1d");
    return { points: bars.map(pointFromBar).filter((point): point is HistoryPoint => point != null), source, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Market data unavailable";
    return { points: [], source: null, error: message };
  }
}

function pointFromBar(bar: OHLCVBar): HistoryPoint | null {
  const date = sessionDateFromTimestamp(bar.timestamp);
  if (!date || !Number.isFinite(bar.close) || bar.close <= 0) return null;
  return {
    date,
    close: bar.close,
    volume: Number.isFinite(bar.volume) && bar.volume > 0 ? bar.volume : null,
    timestamp: bar.timestamp.toISOString(),
  };
}

export async function buildMarketHistory(now = new Date()): Promise<MarketHistoryPayload> {
  const key = `market-history:v1:${isoDateEastern(now)}:${cashSessionSettled(isoDateEastern(now), now) ? "settled" : "open"}`;
  const hit = cacheGet<MarketHistoryPayload>(key);
  if (hit) return hit;
  return singleFlight(key, async () => {
    const again = cacheGet<MarketHistoryPayload>(key);
    if (again) return again;
    const [vix, brent, spy] = await Promise.all([loadDaily(SYMBOLS.vix), loadDaily(SYMBOLS.brent), loadDaily(SYMBOLS.spy)]);
    const payload = assembleMarketHistory({
      now,
      vix: vix.points,
      brent: brent.points,
      spy: spy.points,
      errors: { vix: vix.error, brent: brent.error, spy: spy.error },
      sources: { vix: vix.source, brent: brent.source, spy: spy.source },
    });
    const hasData = payload.rows.length > 0 || payload.cards.vix.close != null || payload.cards.brent.close != null || payload.cards.spy.close != null;
    cacheSet(key, payload, hasData ? CACHE_TTL["1d"] : 30);
    return payload;
  });
}
