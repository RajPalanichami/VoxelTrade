export type CryptoFreshnessState = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE";

export type CryptoStructureStatus =
  | "FORMING"
  | "BREAKOUT_PENDING"
  | "BREAKOUT_CONFIRMED"
  | "RETEST_PENDING"
  | "RETEST_CONFIRMED"
  | "FAILED"
  | "INVALIDATED"
  | "COMPLETED";

export type CryptoGaugeLabel = "RISK-ON" | "NEUTRAL" | "RISK-OFF";
export type AltcoinSeasonLabel = "BTC Season" | "Transition" | "Altcoin Rotation" | "Altcoin Season";
export type CryptoChartTimeframe = "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1M";
export type CryptoMarketRange = "1D" | "7D" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "MAX";
export type CryptoRankLimit = 10 | 20 | 50 | 100;

export const CRYPTO_CHART_TIMEFRAMES: CryptoChartTimeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"];
export const CRYPTO_MARKET_RANGES: CryptoMarketRange[] = ["1D", "7D", "1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"];
export const CRYPTO_RANK_LIMITS: CryptoRankLimit[] = [10, 20, 50, 100];

export interface CryptoFreshness {
  state: CryptoFreshnessState;
  source: string;
  providerTimestamp: string | null;
  receivedTimestamp: string;
  ageSeconds: number;
}

export interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  volumeChange24h: number | null;
  marketCapChange24h: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  change14d: number | null;
  change30d: number | null;
  change200d: number | null;
  change1y: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  rank: number | null;
  ath: number | null;
  athChange: number | null;
  atl: number | null;
  atlChange: number | null;
  high24h: number | null;
  low24h: number | null;
  sparkline: number[];
  image: string | null;
  timestamp: string | null;
}

export interface CryptoQuote {
  symbol: string;
  exchange: string;
  price: number;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  timestamp: string;
  receivedTimestamp: string;
  source: string;
}

export interface CryptoCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CryptoSeriesPoint {
  time: number;
  value: number;
}

export interface CryptoGlobal {
  totalMarketCap: number | null;
  totalVolume24h: number | null;
  marketCapChange24h: number | null;
  volumeChange24h: number | null;
  btcDominance: number | null;
  btcDominanceChange24h: number | null;
  ethDominance: number | null;
  ethDominanceChange24h: number | null;
  stablecoinDominance: number | null;
  activeAssets: number | null;
  markets: number | null;
  btcMarketCap: number | null;
  ethMarketCap: number | null;
  altcoinMarketCap: number | null;
  total2: number | null;
  total3: number | null;
  methodology: string;
  updatedAt: string | null;
}

export interface CryptoPeriodChange {
  h24: number | null;
  d7: number | null;
  d30: number | null;
  d90: number | null;
  ytd: number | null;
  y1: number | null;
}

export interface CryptoStructure {
  trend: "UPTREND" | "DOWNTREND" | "RANGE" | "INSUFFICIENT_DATA";
  higherHigh: boolean;
  higherLow: boolean;
  lowerHigh: boolean;
  lowerLow: boolean;
  support: number | null;
  resistance: number | null;
  atr: number | null;
  volatility: number | null;
  rsi: number | null;
  macd: number | null;
  ema20: number | null;
  ema50: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  vwap: number | null;
  status: CryptoStructureStatus;
  explanation: string;
}

export interface CryptoBreadth {
  universe: "TOP_50" | "TOP_100";
  advancing: number;
  declining: number;
  unchanged: number;
  advancingPct: number | null;
  decliningPct: number | null;
  above20Dma: number | null;
  above50Dma: number | null;
  above200Dma: number | null;
  above20DmaPct: number | null;
  above50DmaPct: number | null;
  above200DmaPct: number | null;
  dmaSource: string;
  dmaAvailable: boolean;
}

export interface CryptoRotation {
  price: { label: string; change24h: number | null }[];
  volume: { label: string; volume24h: number | null; share: number | null }[];
  marketCap: { label: string; marketCap: number | null; share: number | null }[];
  note: string;
}

export interface CryptoSector {
  id: string;
  name: string;
  marketCap: number | null;
  change24h: number | null;
  change7d: number | null;
  volume24h: number | null;
  topGainer: string | null;
  topLoser: string | null;
}

export interface CryptoStablecoin {
  id: string;
  symbol: string;
  name: string;
  circulating: number | null;
  marketCap: number | null;
  change7d: number | null;
  change30d: number | null;
}

export interface CryptoStableOverview {
  totalMarketCap: number | null;
  change7d: number | null;
  change30d: number | null;
  change90d: number | null;
  coins: CryptoStablecoin[];
  source: string;
  freshness: CryptoFreshness;
}

export interface CryptoDerivativeRow {
  symbol: string;
  openInterest: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  basis: number | null;
  volume24h: number | null;
  interpretation: string | null;
  source: string;
}

export interface CryptoLiquidationWindow {
  window: "1H" | "4H" | "12H" | "24H" | "7D";
  long: number | null;
  short: number | null;
  total: number | null;
  available: boolean;
}

export interface CryptoOnchainMetric {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  change: number | null;
  available: boolean;
  note?: string;
}

export interface CryptoNewsItem {
  id: string;
  headline: string;
  source: string;
  url: string;
  timestamp: string | null;
  asset: string;
  category: string;
}

export interface CryptoScannerRow {
  symbol: string;
  name: string;
  id: string;
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  rsBtc: number | null;
  rsEth: number | null;
  rsi: number | null;
  volumeSurge: boolean;
  sector: string | null;
}

export interface CryptoGaugeInput {
  label: string;
  value: string;
  score: number;
}

export interface CryptoGauge {
  label: CryptoGaugeLabel;
  score: number;
  inputs: CryptoGaugeInput[];
  explanation: string;
}

export interface CryptoOverview {
  clock: { timezone: string; utc: string; et: string; model: "CRYPTO_24_7" };
  global: CryptoGlobal;
  globalChanges: CryptoPeriodChange;
  btc: CryptoAsset | null;
  eth: CryptoAsset | null;
  btcReference: {
    referencePrice: number | null;
    exchangePrice: number | null;
    exchange: string | null;
    high24h: number | null;
    low24h: number | null;
    volume24h: number | null;
  };
  btcStructure: CryptoStructure | null;
  assets: CryptoAsset[];
  leaders: Record<string, CryptoAsset[]>;
  losers: Record<string, CryptoAsset[]>;
  breadth: { top50: CryptoBreadth; top100: CryptoBreadth };
  rotation: CryptoRotation;
  sectors: CryptoSector[];
  stablecoins: CryptoStableOverview;
  derivatives: CryptoDerivativeRow[];
  liquidations: CryptoLiquidationWindow[];
  onchain: CryptoOnchainMetric[];
  etf: { available: boolean; note: string; source: string; timestamp: string | null };
  whales: { available: boolean; note: string; source: string };
  sentiment: {
    value: number | null;
    label: string | null;
    history: { time: number; value: number }[];
    source: string;
    freshness: CryptoFreshness;
  };
  altseason: { label: AltcoinSeasonLabel; score: number | null; methodology: string; inputs: string[] };
  news: CryptoNewsItem[];
  scanner: CryptoScannerRow[];
  gauge: CryptoGauge;
  summary: string[];
  attribution: string[];
  freshness: Record<string, CryptoFreshness>;
  sources: string[];
}

export function cryptoPrice(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 8 })}`;
}
