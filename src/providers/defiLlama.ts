import { cacheGet, cacheSet } from "@/src/lib/cache";
import { httpGetJson, toFloat } from "@/src/lib/http";
import type { CryptoStableOverview, CryptoStablecoin } from "@/lib/crypto";
import { freshnessFromTimestamps, unavailableFreshness } from "@/src/engines/cryptoFreshness";

const STABLE = "https://stablecoins.llama.fi";

type LlamaPegged = {
  id?: string;
  name?: string;
  symbol?: string;
  gecko_id?: string;
  circulating?: { peggedUSD?: number };
  circulatingPrevWeek?: { peggedUSD?: number };
  circulatingPrevMonth?: { peggedUSD?: number };
};

export async function fetchDefiLlamaStables(): Promise<CryptoStableOverview> {
  const key = "llama:stables";
  const hit = cacheGet<CryptoStableOverview>(key);
  if (hit) return hit;
  try {
    const body = await httpGetJson<{ peggedAssets?: LlamaPegged[] }>(`${STABLE}/stablecoins`, { includePrices: "true" });
    const received = new Date();
    const coins: CryptoStablecoin[] = (body.peggedAssets || [])
      .map((row) => {
        const circulating = toFloat(row.circulating?.peggedUSD);
        const week = toFloat(row.circulatingPrevWeek?.peggedUSD);
        const month = toFloat(row.circulatingPrevMonth?.peggedUSD);
        return {
          id: String(row.gecko_id || row.id || row.symbol || ""),
          symbol: String(row.symbol || "").toUpperCase(),
          name: String(row.name || row.symbol || ""),
          circulating,
          marketCap: circulating,
          change7d: circulating != null && week ? ((circulating / week - 1) * 100) : null,
          change30d: circulating != null && month ? ((circulating / month - 1) * 100) : null,
        };
      })
      .filter((c) => c.symbol)
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    const total = coins.reduce((s, c) => s + (c.marketCap || 0), 0) || null;
    const prevWeek = (body.peggedAssets || []).reduce((s, r) => s + (toFloat(r.circulatingPrevWeek?.peggedUSD) || 0), 0);
    const prevMonth = (body.peggedAssets || []).reduce((s, r) => s + (toFloat(r.circulatingPrevMonth?.peggedUSD) || 0), 0);
    const overview: CryptoStableOverview = {
      totalMarketCap: total,
      change7d: total && prevWeek ? ((total / prevWeek - 1) * 100) : null,
      change30d: total && prevMonth ? ((total / prevMonth - 1) * 100) : null,
      change90d: null,
      coins: coins.slice(0, 12),
      source: "DeFiLlama",
      freshness: freshnessFromTimestamps({ source: "DeFiLlama", receivedTimestamp: received }),
    };
    cacheSet(key, overview, 180);
    return overview;
  } catch {
    return {
      totalMarketCap: null,
      change7d: null,
      change30d: null,
      change90d: null,
      coins: [],
      source: "DeFiLlama",
      freshness: unavailableFreshness("DeFiLlama"),
    };
  }
}
