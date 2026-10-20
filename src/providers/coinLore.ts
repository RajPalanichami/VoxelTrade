import { cacheGet, cacheSet } from "@/src/lib/cache";
import { httpGetJson, toFloat } from "@/src/lib/http";
import type { CryptoAsset, CryptoGlobal } from "@/lib/crypto";
import { normalizeCryptoSymbol } from "@/src/engines/cryptoSymbols";

const BASE = "https://api.coinlore.net/api";

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit) return hit;
  const data = await fn();
  cacheSet(key, data, ttl);
  return data;
}

export async function fetchCoinLoreGlobal(): Promise<{ global: CryptoGlobal; source: string }> {
  const rows = await cached("cl:global", 60, () => httpGetJson<Array<Record<string, unknown>>>(`${BASE}/global/`));
  const d = Array.isArray(rows) ? rows[0] : null;
  if (!d) throw new Error("CoinLore global payload empty");
  const total = toFloat(d.total_mcap);
  const btcDom = toFloat(d.btc_d);
  const ethDom = toFloat(d.eth_d);
  const btcCap = total != null && btcDom != null ? total * (btcDom / 100) : null;
  const ethCap = total != null && ethDom != null ? total * (ethDom / 100) : null;
  const total2 = total != null && btcCap != null ? total - btcCap : null;
  const total3 = total2 != null && ethCap != null ? total2 - ethCap : null;
  return {
    source: "CoinLore",
    global: {
      totalMarketCap: total,
      totalVolume24h: toFloat(d.total_volume),
      marketCapChange24h: toFloat(d.mcap_change),
      volumeChange24h: toFloat(d.volume_change),
      btcDominance: btcDom,
      btcDominanceChange24h: null,
      ethDominance: ethDom,
      ethDominanceChange24h: null,
      stablecoinDominance: null,
      activeAssets: toFloat(d.coins_count),
      markets: toFloat(d.active_markets),
      btcMarketCap: btcCap,
      ethMarketCap: ethCap,
      altcoinMarketCap: total2,
      total2,
      total3,
      methodology:
        "TOTAL is CoinLore global USD market cap. TOTAL2 = TOTAL − BTC market cap (BTC share × TOTAL). TOTAL3 = TOTAL2 − ETH market cap.",
      updatedAt: new Date().toISOString(),
    },
  };
}

export function mapCoinLoreTicker(row: Record<string, unknown>): CryptoAsset | null {
  const symbol = normalizeCryptoSymbol(String(row.symbol || ""));
  const price = toFloat(row.price_usd);
  if (!symbol || price == null || price <= 0) return null;
  return {
    id: String(row.nameid || row.id || symbol.toLowerCase()),
    symbol,
    name: String(row.name || symbol),
    price,
    marketCap: toFloat(row.market_cap_usd),
    volume24h: toFloat(row.volume24),
    volumeChange24h: null,
    marketCapChange24h: toFloat(row.percent_change_24h),
    change1h: toFloat(row.percent_change_1h),
    change24h: toFloat(row.percent_change_24h),
    change7d: toFloat(row.percent_change_7d),
    change14d: null,
    change30d: null,
    change200d: null,
    change1y: null,
    circulatingSupply: toFloat(row.csupply),
    totalSupply: toFloat(row.tsupply),
    maxSupply: toFloat(row.msupply),
    rank: toFloat(row.rank),
    ath: null,
    athChange: null,
    atl: null,
    atlChange: null,
    high24h: null,
    low24h: null,
    sparkline: [],
    image: row.nameid ? `https://c1.coinlore.com/img/25x25/${row.nameid}.png` : null,
    timestamp: new Date().toISOString(),
  };
}

export async function fetchCoinLoreMarkets(limit = 100): Promise<CryptoAsset[]> {
  const per = Math.min(100, Math.max(10, limit));
  const body = await cached("cl:tickers:" + per, 60, () =>
    httpGetJson<{ data?: Array<Record<string, unknown>> }>(`${BASE}/tickers/`, { start: 0, limit: per }),
  );
  const rows = body.data || [];
  return rows.map(mapCoinLoreTicker).filter((r): r is CryptoAsset => r != null);
}
