export type Mag7Range = "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y";
export type Mag7Timeframe = "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y";

export type Mag7Stock = {
  symbol: string;
  name: string;
  price: number;
  change?: number | null;
  change_percent?: number | null;
  spark: number[];
  source?: string;
  strength: number;
  risk_score: number;
  signal: string;
  rank: number;
  why: string;
  momentum_label: string;
  timeframe_used?: string;
  components: {
    trend: number;
    momentum: number;
    volume: number;
    volatility: number;
    performance: number;
  };
  trend: {
    points: number;
    alignment: string;
    price_gt_ema20: boolean;
    price_gt_ema50: boolean;
    price_gt_ema200: boolean;
  };
  momentum: {
    points: number;
    rsi?: number | null;
    rsi_label?: string;
    macd_label?: string;
    roc?: number | null;
    rs_spy?: number | null;
    rs_qqq?: number | null;
    rs_ndx?: number | null;
    rs_mag7?: number | null;
  };
  volume: {
    points: number;
    relative_volume?: number | null;
    volume?: number | null;
    avg_volume_20?: number | null;
    confirm: string;
  };
  volatility: {
    points: number;
    atr?: number | null;
    atr_pct?: number | null;
    hv20?: number | null;
    hv30?: number | null;
    hv60?: number | null;
    trend?: string;
    label?: string;
  };
  performance: Record<string, number | null | undefined>;
  emas: { ema20?: number | null; ema50?: number | null; ema100?: number | null; ema200?: number | null };
  crosses: string[];
};

export type Mag7Payload = {
  stocks: Mag7Stock[];
  leaderboard: {
    rank: number;
    symbol: string;
    name: string;
    strength: number;
    risk: number;
    signal: string;
    trend: string;
    momentum: string;
    volume: string;
    volatility: string;
    perf_1m?: number | null;
  }[];
  categories: Record<string, string | null>;
  series: Record<string, { time: number; value: number }[]>;
  legend: Record<string, number | null>;
  range: Mag7Range;
  timeframe: string;
  context: Record<string, { symbol: string; name?: string; price?: number | null; change_percent?: number | null }>;
  market_status: string;
  headline: string;
  updated: string;
  missing: string[];
};

export const MAG7_COLORS: Record<string, string> = {
  NVDA: "#4ade80",
  META: "#60a5fa",
  MSFT: "#38bdf8",
  AMZN: "#fb923c",
  GOOGL: "#a78bfa",
  AAPL: "#94a3b8",
  TSLA: "#f87171",
};

export const PERF_RANGES: Mag7Range[] = ["1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"];
export const INTRADAY: Mag7Timeframe[] = ["5m", "15m", "30m", "1h", "4h"];
export const SWING: Mag7Timeframe[] = ["1d", "1w"];
export const LONG: Mag7Timeframe[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y"];
