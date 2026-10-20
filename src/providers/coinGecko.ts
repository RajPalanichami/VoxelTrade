import { getSettings } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { httpGetJson, toFloat } from "@/src/lib/http";
import { ProviderError } from "@/src/lib/errors";
import type { CryptoAsset, CryptoGlobal, CryptoSector, CryptoSeriesPoint } from "@/lib/crypto";
import { normalizeCryptoSymbol } from "@/src/engines/cryptoSymbols";

const BASE = () => getSettings().coinGeckoBaseUrl.replace(/\/$/, "");

function headers() {
  const key = getSettings().coinGeckoApiKey;
  return key ? { "x-cg-demo-api-key": key } : undefined;
}

async function gecko<T>(path: string, params?: Record<string, string | number | undefined>, ttl = 45, cacheKey?: string): Promise<T> {
  const key = cacheKey || `cg:${path}:${JSON.stringify(params || {})}`;
  const hit = cacheGet<T>(key);
  if (hit) return hit;
  if (cacheGet<boolean>("cg:blocked")) {
    throw new ProviderError("CoinGecko", "Rate limited; using cached or fallback sources");
  }
  try {
    const data = await httpGetJson<T>(`${BASE()}${path}`, params, headers());
    cacheSet(key, data, ttl);
    return data;
  } catch (error) {
    if (String(error).includes("429")) cacheSet("cg:blocked", true, 120);
    throw error;
  }
}

export async function fetchCoinGeckoGlobal(): Promise<{ global: CryptoGlobal; source: string }> {
  const body = await gecko<{
    data?: {
      active_cryptocurrencies?: number;
      markets?: number;
      total_market_cap?: Record<string, number>;
      total_volume?: Record<string, number>;
      market_cap_percentage?: Record<string, number>;
      market_cap_change_percentage_24h_usd?: number;
      volume_change_percentage_24h_usd?: number;
      updated_at?: number;
    };
  }>("/global", undefined, 45, "cg:global");
  const d = body.data;
  if (!d) throw new ProviderError("CoinGecko", "Global payload missing data");
  const total = toFloat(d.total_market_cap?.usd);
  const btcDom = toFloat(d.market_cap_percentage?.btc);
  const ethDom = toFloat(d.market_cap_percentage?.eth);
  const btcCap = total != null && btcDom != null ? total * (btcDom / 100) : null;
  const ethCap = total != null && ethDom != null ? total * (ethDom / 100) : null;
  const total2 = total != null && btcCap != null ? total - btcCap : null;
  const total3 = total2 != null && ethCap != null ? total2 - ethCap : null;
  return {
    source: "CoinGecko",
    global: {
      totalMarketCap: total,
      totalVolume24h: toFloat(d.total_volume?.usd),
      marketCapChange24h: toFloat(d.market_cap_change_percentage_24h_usd),
      volumeChange24h: toFloat(d.volume_change_percentage_24h_usd),
      btcDominance: btcDom,
      btcDominanceChange24h: null,
      ethDominance: ethDom,
      ethDominanceChange24h: null,
      stablecoinDominance: toFloat(d.market_cap_percentage?.usdt),
      activeAssets: d.active_cryptocurrencies ?? null,
      markets: d.markets ?? null,
      btcMarketCap: btcCap,
      ethMarketCap: ethCap,
      altcoinMarketCap: total2,
      total2,
      total3,
      methodology:
        "TOTAL is CoinGecko global USD market cap. TOTAL2 = TOTAL − BTC market cap (BTC share × TOTAL). TOTAL3 = TOTAL2 − ETH market cap. These are documented residuals, not TradingView ticker feeds.",
      updatedAt: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : null,
    },
  };
}

type GeckoMarket = Record<string, unknown>;

export function mapCoinGeckoMarket(row: GeckoMarket): CryptoAsset | null {
  const id = String(row.id || "");
  const symbol = normalizeCryptoSymbol(String(row.symbol || ""));
  const price = toFloat(row.current_price);
  if (!id || !symbol) return null;
  const spark = (row.sparkline_in_7d as { price?: number[] } | undefined)?.price;
  return {
    id,
    symbol,
    name: String(row.name || symbol),
    price,
    marketCap: toFloat(row.market_cap),
    volume24h: toFloat(row.total_volume),
    volumeChange24h: null,
    marketCapChange24h: toFloat(row.market_cap_change_percentage_24h),
    change1h: toFloat(row.price_change_percentage_1h_in_currency),
    change24h: toFloat(row.price_change_percentage_24h_in_currency ?? row.price_change_percentage_24h),
    change7d: toFloat(row.price_change_percentage_7d_in_currency),
    change14d: toFloat(row.price_change_percentage_14d_in_currency),
    change30d: toFloat(row.price_change_percentage_30d_in_currency),
    change200d: toFloat(row.price_change_percentage_200d_in_currency),
    change1y: toFloat(row.price_change_percentage_1y_in_currency),
    circulatingSupply: toFloat(row.circulating_supply),
    totalSupply: toFloat(row.total_supply),
    maxSupply: toFloat(row.max_supply),
    rank: typeof row.market_cap_rank === "number" ? row.market_cap_rank : toFloat(row.market_cap_rank),
    ath: toFloat(row.ath),
    athChange: toFloat(row.ath_change_percentage),
    atl: toFloat(row.atl),
    atlChange: toFloat(row.atl_change_percentage),
    high24h: toFloat(row.high_24h),
    low24h: toFloat(row.low_24h),
    sparkline: Array.isArray(spark) ? spark.filter((n) => Number.isFinite(n)) : [],
    image: typeof row.image === "string" ? row.image : null,
    timestamp: typeof row.last_updated === "string" ? row.last_updated : null,
  };
}

export async function fetchCoinGeckoMarkets(limit = 100): Promise<CryptoAsset[]> {
  const per = Math.min(250, Math.max(10, limit));
  const rows = await gecko<GeckoMarket[]>(
    "/coins/markets",
    {
      vs_currency: "usd",
      order: "market_cap_desc",
      per_page: per,
      page: 1,
      sparkline: "true",
      price_change_percentage: "1h,24h,7d,14d,30d,200d,1y",
    },
    90,
    `cg:markets:${per}`,
  );
  if (!Array.isArray(rows)) throw new ProviderError("CoinGecko", "Markets payload was not a list");
  return rows.map(mapCoinGeckoMarket).filter((r): r is CryptoAsset => r != null);
}

export async function fetchCoinGeckoSearch(query: string) {
  const body = await gecko<{ coins?: Array<{ id: string; name: string; symbol: string; market_cap_rank?: number; thumb?: string }> }>(
    "/search",
    { query },
    120,
    `cg:search:${query.toLowerCase()}`,
  );
  return (body.coins || []).map((c) => ({
    id: c.id,
    name: c.name,
    symbol: normalizeCryptoSymbol(c.symbol),
    rank: c.market_cap_rank ?? null,
    image: c.thumb || null,
  }));
}

export async function fetchCoinGeckoMarketChart(id: string, days: string): Promise<{
  prices: CryptoSeriesPoint[];
  marketCaps: CryptoSeriesPoint[];
  volumes: CryptoSeriesPoint[];
}> {
  const ttl = days === "1" ? 60 : days === "max" ? 1800 : 300;
  const body = await gecko<{ prices?: number[][]; market_caps?: number[][]; total_volumes?: number[][] }>(
    `/coins/${encodeURIComponent(id)}/market_chart`,
    { vs_currency: "usd", days },
    ttl,
    `cg:chart:${id}:${days}`,
  );
  const map = (rows?: number[][]): CryptoSeriesPoint[] =>
    (rows || [])
      .map(([t, v]) => ({ time: Math.floor(Number(t) / 1000), value: Number(v) }))
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value > 0);
  return { prices: map(body.prices), marketCaps: map(body.market_caps), volumes: map(body.total_volumes) };
}

export async function fetchCoinGeckoCategories(): Promise<CryptoSector[]> {
  const rows = await gecko<Array<Record<string, unknown>>>("/coins/categories", undefined, 300, "cg:categories");
  if (!Array.isArray(rows)) return [];
  const labels: Record<string, string> = {
    "layer-1": "Layer 1",
    "layer-2": "Layer 2",
    "decentralized-finance-defi": "DeFi",
    "artificial-intelligence": "AI",
    "real-world-assets-rwa": "RWA",
    "privacy-coins": "Privacy",
    "meme-token": "Meme",
    gaming: "Gaming",
    depin: "DePIN",
    infrastructure: "Infrastructure",
    "decentralized-exchange-dex-token": "DEX",
    "decentralized-exchange": "DEX",
    "lending-borrowing": "Lending",
    oracle: "Oracle",
    oracles: "Oracle",
    stablecoins: "Stablecoins",
  };
  const wanted = Object.keys(labels);
  const named = rows
    .filter((r) => wanted.includes(String(r.id)))
    .map((r) => ({
      id: String(r.id),
      name: labels[String(r.id)] || String(r.name || r.id),
      marketCap: toFloat(r.market_cap),
      change24h: toFloat(r.market_cap_change_24h),
      change7d: toFloat(r.market_cap_change_7d ?? r.market_cap_change_percentage_7d),
      volume24h: toFloat(r.volume_24h),
      topGainer: null,
      topLoser: null,
    }));
  if (named.length) return named;
  return rows.slice(0, 12).map((r) => ({
    id: String(r.id || r.name || ""),
    name: String(r.name || r.id || "Sector"),
    marketCap: toFloat(r.market_cap),
    change24h: toFloat(r.market_cap_change_24h),
    change7d: toFloat(r.market_cap_change_7d ?? r.market_cap_change_percentage_7d),
    volume24h: toFloat(r.volume_24h),
    topGainer: null,
    topLoser: null,
  }));
}

export async function fetchCoinGeckoCoin(id: string): Promise<CryptoAsset | null> {
  const markets = await gecko<GeckoMarket[]>(
    "/coins/markets",
    {
      vs_currency: "usd",
      ids: id,
      sparkline: "true",
      price_change_percentage: "1h,24h,7d,14d,30d,200d,1y",
    },
    45,
    `cg:coin:${id}`,
  );
  if (!Array.isArray(markets) || !markets[0]) return null;
  return mapCoinGeckoMarket(markets[0]);
}
