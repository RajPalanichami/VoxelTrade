export function parseCompareTicker(raw: string, label = "Ticker"): { symbol: string } | { error: string } {
  const symbol = String(raw || "").toUpperCase().trim();
  if (!symbol) return { error: `${label} is required.` };
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) {
    return { error: `Invalid ticker '${String(raw).trim()}'. Enter a supported stock or ETF symbol.` };
  }
  return { symbol };
}

export const COMPARE_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;
export type CompareTimeframe = (typeof COMPARE_TIMEFRAMES)[number];

export const COMPARE_PERIODS = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "MAX"] as const;
export type ComparePeriod = (typeof COMPARE_PERIODS)[number];

export const COMPARE_TF_LABELS: Record<CompareTimeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "4h": "4H",
  "1d": "Daily",
  "1w": "Weekly",
};

export const CATEGORY_WEIGHTS = {
  Trend: 0.25,
  Momentum: 0.2,
  Volume: 0.15,
  Structure: 0.15,
  Volatility: 0.1,
  "Support/Resistance": 0.1,
  Patterns: 0.05,
} as const;

export type CompareCategory = keyof typeof CATEGORY_WEIGHTS | "Relative Strength";

export type CompareSignal =
  | "STRONG BULLISH"
  | "BULLISH"
  | "MODERATELY BULLISH"
  | "NEUTRAL"
  | "MIXED"
  | "OVEREXTENDED"
  | "MODERATELY BEARISH"
  | "BEARISH"
  | "STRONG BEARISH"
  | "INSUFFICIENT DATA";

export type CompareRelative = string;

export type CompareIndicatorRow = {
  id: string;
  category: string;
  name: string;
  description: string;
  calculation: string;
  requiredPeriods: number;
  t1: CompareCell;
  t2: CompareCell;
  relative: CompareRelative;
};

export type CompareCell = {
  value: number | string | null;
  display: string;
  signal: CompareSignal;
  interpretation: string;
  confidence: number | null;
  validBars: number;
};

export type CompareTickerCard = {
  symbol: string;
  name: string;
  signal: CompareSignal;
  score: number | null;
  confidence: number | null;
  categories: Record<string, number | null>;
  scoreBreakdown: { category: string; score: number | null; weight: number }[];
  distribution: Record<string, number>;
  error: string | null;
};

export type ComparePayload = {
  ticker1: CompareTickerCard;
  ticker2: CompareTickerCard;
  timeframe: CompareTimeframe;
  period: ComparePeriod;
  as_of: string;
  as_of_et: string;
  timezone: string;
  indicators: CompareIndicatorRow[];
  relative: { label: string; t1: string; t2: string }[];
  multiTimeframe: { tf: CompareTimeframe; t1: CompareSignal; t2: CompareSignal }[];
  alignment: { t1: string; t2: string };
  chart: {
    t1: { time: number; close: number; ema20: number | null; ema50: number | null; ema200: number | null; volume: number; rsi: number | null; macd: number | null }[];
    t2: { time: number; close: number; ema20: number | null; ema50: number | null; ema200: number | null; volume: number; rsi: number | null; macd: number | null }[];
  };
  dataQuality: {
    t1: { status: string; candles: number; missing: number; latest: string };
    t2: { status: string; candles: number; missing: number; latest: string };
  };
  weightsNote: string;
};
