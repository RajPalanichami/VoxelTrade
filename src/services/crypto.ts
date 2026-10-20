import { CACHE_TTL } from "@/src/config/env";
import type {
  CryptoAsset,
  CryptoCandle,
  CryptoChartTimeframe,
  CryptoMarketRange,
  CryptoNewsItem,
  CryptoOverview,
  CryptoPeriodChange,
} from "@/lib/crypto";
import { CRYPTO_CHART_TIMEFRAMES, CRYPTO_MARKET_RANGES } from "@/lib/crypto";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";
import { formatEstDateTime } from "@/src/lib/easternTime";
import { barsToFrame } from "@/src/engines/indicators";
import {
  altcoinSeason,
  buildScanner,
  computeBreadth,
  computeRotation,
  cryptoGauge,
  dominanceChange24h,
  factualSummary,
  marketStructure,
  oiInterpretation,
  periodChange,
  relativeStrength,
  ytdChange,
} from "@/src/engines/cryptoAnalytics";
import { freshnessFromTimestamps, unavailableFreshness } from "@/src/engines/cryptoFreshness";
import { normalizeCryptoSymbol, yahooCryptoSymbol } from "@/src/engines/cryptoSymbols";
import { fetchBinanceDerivatives, fetchBinanceKlines, fetchBinanceTicker } from "@/src/providers/binance";
import {
  fetchCoinGeckoCategories,
  fetchCoinGeckoCoin,
  fetchCoinGeckoGlobal,
  fetchCoinGeckoMarketChart,
  fetchCoinGeckoMarkets,
  fetchCoinGeckoSearch,
} from "@/src/providers/coinGecko";
import { fetchCoinLoreGlobal, fetchCoinLoreMarkets } from "@/src/providers/coinLore";
import { fetchCryptoFearGreed } from "@/src/providers/cryptoSentiment";
import { fetchBtcOnchain } from "@/src/providers/cryptoOnchain";
import { fetchDefiLlamaStables } from "@/src/providers/defiLlama";
import { analysis } from "@/src/services/analysis";
import { headlineCategory } from "@/src/providers/base";

const RANGE_DAYS: Record<CryptoMarketRange, string> = {
  "1D": "1",
  "7D": "7",
  "1M": "30",
  "3M": "90",
  "6M": "180",
  "1Y": "365",
  "3Y": "max",
  "5Y": "max",
  "MAX": "max",
};

export function normalizeCryptoTimeframe(value: string): CryptoChartTimeframe {
  const v = value.trim();
  if (v === "1M") return "1M";
  const lower = v.toLowerCase().replace(/\s+/g, "");
  const aliases: Record<string, CryptoChartTimeframe> = {
    "5m": "5m",
    "5min": "5m",
    "5minutes": "5m",
    "15m": "15m",
    "15min": "15m",
    "15minutes": "15m",
    "30m": "30m",
    "30min": "30m",
    "30minutes": "30m",
    "1h": "1h",
    "1hour": "1h",
    "4h": "4h",
    "4hour": "4h",
    "1d": "1d",
    daily: "1d",
    "1w": "1w",
    weekly: "1w",
    "1m": "1M",
    monthly: "1M",
  };
  const tf = aliases[lower];
  if (!tf || !CRYPTO_CHART_TIMEFRAMES.includes(tf)) {
    throw new HttpError(400, `Unsupported crypto timeframe '${value}'. Use: ${CRYPTO_CHART_TIMEFRAMES.join(", ")}`);
  }
  return tf;
}

export function normalizeCryptoRange(value: string): CryptoMarketRange {
  const v = value.trim().toUpperCase() as CryptoMarketRange;
  if (!CRYPTO_MARKET_RANGES.includes(v)) {
    throw new HttpError(400, `Unsupported range '${value}'. Use: ${CRYPTO_MARKET_RANGES.join(", ")}`);
  }
  return v;
}

async function settled<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function yahooQuote(symbol: string) {
  try {
    return await analysis.quote(yahooCryptoSymbol(symbol));
  } catch {
    return null;
  }
}

function classifyNews(title: string): string {
  const t = title.toLowerCase();
  const mapping: [string, string][] = [
    ["bitcoin", "Bitcoin"],
    ["btc", "Bitcoin"],
    ["ethereum", "Ethereum"],
    ["ether", "Ethereum"],
    ["etf", "ETF"],
    ["sec", "Regulation"],
    ["regulat", "Regulation"],
    ["defi", "DeFi"],
    ["stable", "Stablecoins"],
    ["hack", "Security"],
    ["exploit", "Security"],
    ["privacy", "Privacy"],
    ["binance", "Exchange"],
    ["coinbase", "Exchange"],
    ["mine", "Mining"],
    ["fed", "Macro"],
    ["rate", "Macro"],
    ["ai ", "AI"],
  ];
  for (const [needle, cat] of mapping) {
    if (t.includes(needle)) return cat;
  }
  return headlineCategory(title);
}

function newsAsset(title: string) {
  const t = title.toLowerCase();
  if (t.includes("bitcoin") || t.includes("btc")) return "BTC";
  if (t.includes("ethereum") || t.includes("ether") || /\beth\b/.test(t)) return "ETH";
  return "CRYPTO";
}

export async function buildCryptoOverview(): Promise<CryptoOverview> {
  const cached = cacheGet<CryptoOverview>("crypto:overview");
  if (cached) return cached;
  const lastGood = cacheGet<CryptoOverview>("crypto:overview:last");
  const received = new Date();
  const [geckoGlobal, geckoMarkets, loreGlobal, loreMarkets, stables, sentiment, onchain, sectors, btcTicker, ethTicker] = await Promise.all([
    settled(fetchCoinGeckoGlobal),
    settled(() => fetchCoinGeckoMarkets(100)),
    settled(fetchCoinLoreGlobal),
    settled(() => fetchCoinLoreMarkets(100)),
    fetchDefiLlamaStables(),
    fetchCryptoFearGreed(),
    fetchBtcOnchain(),
    settled(fetchCoinGeckoCategories),
    settled(() => fetchBinanceTicker("BTC")),
    settled(() => fetchBinanceTicker("ETH")),
  ]);
  const globalRes = geckoGlobal?.global.totalMarketCap != null ? geckoGlobal : loreGlobal;
  const marketsRes = geckoMarkets && geckoMarkets.length >= 20 ? geckoMarkets : loreMarkets;
  const marketSource = geckoMarkets && geckoMarkets.length >= 20 ? "CoinGecko" : loreMarkets?.length ? "CoinLore" : "fallback";

  let assets = marketsRes?.length ? marketsRes : lastGood?.assets || [];
  if (!assets.length) {
    const [btcY, ethY] = await Promise.all([yahooQuote("BTC"), yahooQuote("ETH")]);
    assets = [btcY, ethY]
      .filter(Boolean)
      .map((q, i) => ({
        id: i === 0 ? "bitcoin" : "ethereum",
        symbol: i === 0 ? "BTC" : "ETH",
        name: q!.name || (i === 0 ? "Bitcoin" : "Ethereum"),
        price: q!.price,
        marketCap: q!.market_cap ?? null,
        volume24h: q!.volume ?? null,
        volumeChange24h: null,
        marketCapChange24h: null,
        change1h: null,
        change24h: q!.change_percent ?? null,
        change7d: null,
        change14d: null,
        change30d: null,
        change200d: null,
        change1y: null,
        circulatingSupply: null,
        totalSupply: null,
        maxSupply: i === 0 ? 21_000_000 : null,
        rank: i + 1,
        ath: null,
        athChange: null,
        atl: null,
        atlChange: null,
        high24h: q!.high ?? null,
        low24h: q!.low ?? null,
        sparkline: [],
        image: null,
        timestamp: q!.freshness?.timestamp || received.toISOString(),
      }));
  }

  const btc = assets.find((a) => a.symbol === "BTC") || null;
  const eth = assets.find((a) => a.symbol === "ETH") || null;
  if (btc && btcTicker) {
    btc.price = btcTicker.price;
    btc.change24h = btcTicker.change24h ?? btc.change24h;
    btc.high24h = btcTicker.high24h ?? btc.high24h;
    btc.low24h = btcTicker.low24h ?? btc.low24h;
  }
  if (eth && ethTicker) {
    eth.price = ethTicker.price;
    eth.change24h = ethTicker.change24h ?? eth.change24h;
  }

  const fallbackGlobal = lastGood?.global;
  const global = globalRes?.global || fallbackGlobal || {
    totalMarketCap: null,
    totalVolume24h: null,
    marketCapChange24h: null,
    volumeChange24h: null,
    btcDominance: null,
    btcDominanceChange24h: null,
    ethDominance: null,
    ethDominanceChange24h: null,
    stablecoinDominance: null,
    activeAssets: assets.length || null,
    markets: null,
    btcMarketCap: btc?.marketCap ?? null,
    ethMarketCap: eth?.marketCap ?? null,
    altcoinMarketCap: null,
    total2: null,
    total3: null,
    methodology: "Global snapshot unavailable; residual TOTAL2/TOTAL3 not computed.",
    updatedAt: null,
  };
  global.btcDominanceChange24h = dominanceChange24h(global.btcDominance, btc?.marketCapChange24h ?? btc?.change24h ?? null, global.marketCapChange24h);
  global.ethDominanceChange24h = dominanceChange24h(global.ethDominance, eth?.marketCapChange24h ?? eth?.change24h ?? null, global.marketCapChange24h);

  const [btcChart, btcBarsRaw, derivs, news] = await Promise.all([
    settled(() => fetchCoinGeckoMarketChart("bitcoin", "365")),
    settled(() => fetchBinanceKlines("BTC", "1d", 220)),
    Promise.all(["BTC", "ETH", "SOL"].map((s) => settled(() => fetchBinanceDerivatives(s)))),
    settled(loadCryptoNews),
  ]);
  let btcBars = btcBarsRaw;
  if (!btcBars?.length) {
    try {
      const [ybars] = await analysis.bars("BTC-USD", "1d", 220);
      btcBars = ybars.map((b) => ({
        time: Math.floor(b.timestamp.getTime() / 1000),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));
    } catch {
      btcBars = null;
    }
  }

  const capSeries = btcChart?.marketCaps || [];
  const globalChanges: CryptoPeriodChange = {
    h24: global.marketCapChange24h,
    d7: periodChange(capSeries, 7),
    d30: periodChange(capSeries, 30),
    d90: periodChange(capSeries, 90),
    ytd: ytdChange(capSeries),
    y1: periodChange(capSeries, 365),
  };

  const frame = btcBars?.length
    ? barsToFrame(
        btcBars.map((b) => ({
          timestamp: new Date(b.time * 1000),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
        })),
      )
    : null;
  const btcStructure = marketStructure(frame);
  const top50 = computeBreadth(assets, "TOP_50");
  const top100 = computeBreadth(assets, "TOP_100");
  const rotation = computeRotation(assets, global);
  const scanner = buildScanner(assets, btc, eth);
  const top50Beat = shareBeating(assets.filter((a) => (a.rank || 99) <= 50 && a.symbol !== "BTC"), btc);
  const top100Beat = shareBeating(assets.filter((a) => a.symbol !== "BTC"), btc);
  const ethBtc = btc?.change24h != null && eth?.change24h != null ? eth.change24h - btc.change24h : null;
  const season = altcoinSeason({
    btcDominance: global.btcDominance,
    ethBtc,
    top50BeatBtc: top50Beat,
    top100BeatBtc: top100Beat,
    altBreadth: top100.advancingPct,
  });

  const derivativeRows = (derivs || [])
    .filter(Boolean)
    .map((row) => {
      const asset = assets.find((a) => a.symbol === row!.symbol);
      return {
        ...row!,
        interpretation: oiInterpretation(asset?.change24h ?? null, null),
      };
    });

  const gauge = cryptoGauge({
    btcChange24h: btc?.change24h ?? null,
    btcTrendUp: btcStructure ? btcStructure.trend === "UPTREND" : null,
    btcDominance: global.btcDominance,
    ethChange24h: eth?.change24h ?? null,
    altBreadth: top100.advancingPct,
    totalChange24h: global.marketCapChange24h,
    volumeChange24h: global.volumeChange24h,
    stableChange: stables.change7d,
    funding: derivativeRows.find((d) => d.symbol === "BTC")?.fundingRate ?? null,
    sentiment: sentiment.value,
  });

  const newsItems = news || [];
  const leaders = {
    "24h": rankBy(assets, (a) => a.change24h, true).slice(0, 8),
    "7d": rankBy(assets, (a) => a.change7d, true).slice(0, 8),
    "30d": rankBy(assets, (a) => a.change30d, true).slice(0, 8),
    volume: rankBy(assets, (a) => a.volume24h, true).slice(0, 8),
    rsBtc: rankBy(assets.filter((a) => a.symbol !== "BTC"), (a) => relativeStrength(a, btc, "change7d"), true).slice(0, 8),
  };
  const losers = {
    "24h": rankBy(assets, (a) => a.change24h, false).slice(0, 8),
    "7d": rankBy(assets, (a) => a.change7d, false).slice(0, 8),
    "30d": rankBy(assets, (a) => a.change30d, false).slice(0, 8),
  };

  const utc = received.toISOString();
  const overview: CryptoOverview = {
    clock: { timezone: "UTC", utc, et: formatEstDateTime(received), model: "CRYPTO_24_7" },
    global,
    globalChanges,
    btc,
    eth,
    btcReference: {
      referencePrice: btc?.price ?? null,
      exchangePrice: btcTicker?.price ?? null,
      exchange: btcTicker ? "Binance" : null,
      high24h: btcTicker?.high24h ?? btc?.high24h ?? null,
      low24h: btcTicker?.low24h ?? btc?.low24h ?? null,
      volume24h: btcTicker?.volume ?? btc?.volume24h ?? null,
    },
    btcStructure,
    assets,
    leaders,
    losers,
    breadth: { top50, top100 },
    rotation,
    sectors: sectors?.length ? sectors : lastGood?.sectors || [],
    stablecoins: stables,
    derivatives: derivativeRows,
    liquidations: ["1H", "4H", "12H", "24H", "7D"].map((window) => ({
      window: window as "1H" | "4H" | "12H" | "24H" | "7D",
      long: null,
      short: null,
      total: null,
      available: false,
    })),
    onchain,
    etf: {
      available: false,
      note: "Spot Bitcoin ETF flow files are not exposed by a documented free JSON API compatible with this stack. Values are not invented.",
      source: "unavailable",
      timestamp: null,
    },
    whales: {
      available: false,
      note: "Whale-alert identity feeds are paid. Public Blockchain.com charts do not identify wallet owners.",
      source: "unavailable",
    },
    sentiment,
    altseason: season,
    news: newsItems,
    scanner,
    gauge,
    summary: factualSummary({
      global,
      btc,
      eth,
      breadth: top100,
      rotation,
      gauge,
      sentimentLabel: sentiment.label,
      newsHeadlines: newsItems.map((n) => n.headline),
    }),
    attribution: [
      "Market data: CoinGecko / CoinLore",
      "Live exchange prices: Binance",
      "Stablecoins: DeFiLlama",
      "Crypto Fear & Greed: Alternative.me",
      "On-chain charts: Blockchain.com",
    ],
    freshness: {
      global: freshnessFromTimestamps({
        source: globalRes?.source || "unavailable",
        providerTimestamp: global.updatedAt,
        receivedTimestamp: received,
        available: Boolean(globalRes),
      }),
      btc: freshnessFromTimestamps({
        source: btcTicker ? "Binance" : btc ? "CoinGecko" : "unavailable",
        providerTimestamp: btcTicker?.timestamp || btc?.timestamp,
        receivedTimestamp: received,
        available: Boolean(btc?.price),
      }),
      markets: freshnessFromTimestamps({
        source: marketSource,
        receivedTimestamp: received,
        available: assets.length > 0,
      }),
      stablecoins: stables.freshness,
      sentiment: sentiment.freshness,
      onchain: onchain.some((m) => m.available)
        ? freshnessFromTimestamps({ source: "Blockchain.com", receivedTimestamp: received })
        : unavailableFreshness("Blockchain.com"),
    },
    sources: ["CoinGecko", "CoinLore", "Binance", "DeFiLlama", "Alternative.me", "Blockchain.com", "Yahoo Finance"],
  };
  const complete = overview.assets.length >= 20 && overview.global.totalMarketCap != null;
  if (complete) {
    cacheSet("crypto:overview", overview, CACHE_TTL.cryptoOverview);
    cacheSet("crypto:overview:last", overview, 1800);
    return overview;
  }
  if (lastGood && lastGood.assets.length >= 20 && lastGood.global.totalMarketCap != null) {
    const merged = {
      ...lastGood,
      btc: overview.btc || lastGood.btc,
      eth: overview.eth || lastGood.eth,
      clock: overview.clock,
      freshness: {
        ...lastGood.freshness,
        markets: { ...lastGood.freshness.markets, state: "STALE" as const },
      },
    };
    cacheSet("crypto:overview", merged, 20);
    return merged;
  }
  cacheSet("crypto:overview", overview, 15);
  return overview;
}

function rankBy(assets: CryptoAsset[], fn: (a: CryptoAsset) => number | null, desc: boolean) {
  return [...assets]
    .filter((a) => fn(a) != null)
    .sort((a, b) => {
      const av = fn(a) ?? 0;
      const bv = fn(b) ?? 0;
      return desc ? bv - av : av - bv;
    });
}

function shareBeating(assets: CryptoAsset[], btc: CryptoAsset | null) {
  const bench = btc?.change7d;
  if (bench == null || !assets.length) return null;
  const n = assets.filter((a) => a.change7d != null && a.change7d > bench).length;
  return (n / assets.length) * 100;
}

export async function listCryptoAssets(limit: number) {
  if (![10, 20, 50, 100].includes(limit)) throw new HttpError(400, "limit must be 10, 20, 50, or 100");
  const overview = await buildCryptoOverview();
  return { assets: overview.assets.slice(0, limit), freshness: overview.freshness.markets };
}

export async function searchCrypto(query: string) {
  const q = query.trim();
  if (!q) throw new HttpError(400, "Missing search query");
  try {
    return await fetchCoinGeckoSearch(q);
  } catch {
    const overview = await buildCryptoOverview();
    const needle = q.toLowerCase();
    return overview.assets
      .filter((a) => a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle) || a.id.includes(needle))
      .map((a) => ({ id: a.id, symbol: a.symbol, name: a.name, rank: a.rank, image: a.image }));
  }
}

export async function getCryptoAsset(symbolOrId: string) {
  const overview = await buildCryptoOverview();
  const key = symbolOrId.trim().toLowerCase();
  const hit =
    overview.assets.find((a) => a.id === key || a.symbol.toLowerCase() === normalizeCryptoSymbol(symbolOrId).toLowerCase()) ||
    (await settled(() => fetchCoinGeckoCoin(key)));
  if (!hit) throw new HttpError(404, `Unknown crypto asset '${symbolOrId}'`);
  return hit;
}

export async function getCryptoHistory(symbolOrId: string, timeframe: string): Promise<{
  symbol: string;
  timeframe: CryptoChartTimeframe;
  bars: CryptoCandle[];
  source: string;
}> {
  const tf = normalizeCryptoTimeframe(timeframe);
  const asset = await getCryptoAsset(symbolOrId);
  const binance = await settled(() => fetchBinanceKlines(asset.symbol, tf, 400));
  if (binance?.length) return { symbol: asset.symbol, timeframe: tf, bars: binance, source: "Binance" };
  const yahooTf = tf === "15m" || tf === "1w" || tf === "1M" ? (tf === "15m" ? "5m" : tf === "1w" ? "1d" : "1d") : tf;
  try {
    const [bars] = await analysis.bars(yahooCryptoSymbol(asset.symbol), yahooTf === "5m" || yahooTf === "30m" || yahooTf === "1h" || yahooTf === "4h" || yahooTf === "1d" ? yahooTf : "1d");
    return {
      symbol: asset.symbol,
      timeframe: tf,
      bars: bars.map((b) => ({
        time: Math.floor(b.timestamp.getTime() / 1000),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
      source: "Yahoo Finance",
    };
  } catch {
    throw new HttpError(502, `Historical candles unavailable for ${asset.symbol} ${tf}`);
  }
}

export async function getCryptoMarketChart(range: string) {
  const rng = normalizeCryptoRange(range);
  const days = RANGE_DAYS[rng];
  const chart = await settled(() => fetchCoinGeckoMarketChart("bitcoin", days));
  return {
    range: rng,
    series: chart?.marketCaps || [],
    prices: chart?.prices || [],
    note:
      rng === "3Y" || rng === "5Y" || rng === "MAX"
        ? "CoinGecko Demo historical charts are limited to about 365 days. Longer ranges show the available series only."
        : "Bitcoin market-cap history from CoinGecko. Total-market history is not a separate Demo endpoint; KPI TOTAL uses /global.",
    source: chart ? "CoinGecko" : "unavailable",
  };
}

export async function getCryptoQuotes(symbols: string[]) {
  const unique = [...new Set(symbols.map(normalizeCryptoSymbol).filter(Boolean))].slice(0, 25);
  const quotes = await Promise.all(
    unique.map(async (symbol) => {
      const live = await settled(() => fetchBinanceTicker(symbol));
      if (live) return live;
      const y = await yahooQuote(symbol);
      if (!y) return null;
      return {
        symbol,
        exchange: y.exchange || "Yahoo",
        price: y.price,
        bid: null,
        ask: null,
        volume: y.volume ?? null,
        change24h: y.change_percent ?? null,
        high24h: y.high ?? null,
        low24h: y.low ?? null,
        timestamp: y.freshness?.timestamp || new Date().toISOString(),
        receivedTimestamp: new Date().toISOString(),
        source: "Yahoo Finance",
      };
    }),
  );
  return quotes.filter(Boolean);
}

async function loadCryptoNews(): Promise<CryptoNewsItem[]> {
  const items: CryptoNewsItem[] = [];
  for (const symbol of ["BTC-USD", "ETH-USD", "bitcoin", "crypto"]) {
    try {
      const rows = ((await analysis.first("fetchNews", symbol)) as Record<string, unknown>[]) || [];
      for (const row of rows) {
        const headline = String(row.headline || row.title || "");
        if (!headline) continue;
        items.push({
          id: String(row.id || headline.slice(0, 40)),
          headline,
          source: String(row.source || "news"),
          url: String(row.url || ""),
          timestamp: typeof row.published_at === "string" ? row.published_at : null,
          asset: newsAsset(headline),
          category: classifyNews(headline),
        });
      }
    } catch {
      /* continue */
    }
  }
  const seen = new Set<string>();
  return items.filter((n) => {
    const key = n.headline.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}
