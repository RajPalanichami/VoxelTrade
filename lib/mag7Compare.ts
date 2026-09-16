import type { CompareCell, CompareTickerCard } from "./compare";
import { MAG7_COLORS } from "./mag7";

export const MAG7_COMPARE_SECTORS: Record<string, string> = {
  AAPL: "Consumer Tech",
  MSFT: "Software",
  GOOGL: "Internet",
  AMZN: "E-commerce",
  NVDA: "Semiconductors",
  META: "Communication",
  TSLA: "Auto",
};

export const MAG7_COMPARE_TIMEFRAMES = ["15m", "30m", "1h", "4h", "1d", "1w", "1M"] as const;
export type Mag7CompareTimeframe = (typeof MAG7_COMPARE_TIMEFRAMES)[number];

export const MAG7_COMPARE_TF_LABELS: Record<Mag7CompareTimeframe, string> = {
  "15m": "15 Minutes",
  "30m": "30 Minutes",
  "1h": "1 Hour",
  "4h": "4 Hours",
  "1d": "Daily",
  "1w": "Weekly",
  "1M": "Monthly",
};

export const BASKET_COMPARE_MAX = 10;

export const BASKET_COMPARE_PALETTE = [
  "#4ade80",
  "#60a5fa",
  "#38bdf8",
  "#fb923c",
  "#a78bfa",
  "#94a3b8",
  "#f87171",
  "#fbbf24",
  "#34d399",
  "#f472b6",
];

export const MAG7_COMPARE_UNIVERSE = [
  ["AAPL", "Apple"],
  ["MSFT", "Microsoft"],
  ["GOOGL", "Alphabet"],
  ["AMZN", "Amazon"],
  ["NVDA", "NVIDIA"],
  ["META", "Meta Platforms"],
  ["TSLA", "Tesla"],
] as const;

export function colorForTicker(symbol: string, index = 0) {
  return MAG7_COLORS[symbol] || BASKET_COMPARE_PALETTE[index % BASKET_COMPARE_PALETTE.length];
}

export function tickerColors(symbols: string[]): Record<string, string> {
  return Object.fromEntries(symbols.map((symbol, index) => [symbol, colorForTicker(symbol, index)]));
}

export type Mag7CompareStock = CompareTickerCard & {
  price: number | null;
  tfReturn: number | null;
  ret5: number | null;
  rsi14: number | null;
  macd: number | null;
  adx: number | null;
  rvol: number | null;
  volume: number | null;
  atrPct: number | null;
  support: number | null;
  resistance: number | null;
  trendLabel: string;
  momentumLabel: string;
  volatilityLabel: string;
};

export type Mag7CompareIndicator = {
  id: string;
  category: string;
  name: string;
  calculation: string;
  values: Record<string, CompareCell>;
};

export type Mag7ComparePayload = {
  timeframe: Mag7CompareTimeframe;
  timeframeLabel: string;
  as_of: string;
  as_of_et: string;
  timezone: string;
  stocks: Mag7CompareStock[];
  strongest: Mag7CompareStock | null;
  weakest: Mag7CompareStock | null;
  indicators: Mag7CompareIndicator[];
  chart: Record<string, { time: number; value: number }[]>;
  legend: Record<string, number | null>;
  averages: { score: number | null; rsi14: number | null; tfReturn: number | null; rvol: number | null };
  dataQuality: Record<string, { status: string; candles: number; missing: number; latest: string }>;
  weightsNote: string;
  missing: string[];
  requested: string[];
};
