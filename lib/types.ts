export type Timeframe = "5m" | "30m" | "1h" | "4h" | "1d";

export const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "5m", label: "5 Minutes" },
  { id: "30m", label: "30 Minutes" },
  { id: "1h", label: "1 Hour" },
  { id: "4h", label: "4 Hours" },
  { id: "1d", label: "Daily" },
];

export type DataStatus = "LIVE" | "DELAYED" | "EOD" | "STALE" | "UNAVAILABLE";

export interface Envelope<T> {
  data: T;
  source: string;
  timestamp: string;
  dataStatus: DataStatus;
  latencyMs: number;
  algorithmVersion: string;
}

export interface AnalysisBundle {
  quote: Quote;
  indicators: Indicators;
  levels: Levels;
  signal: Signal;
  long_plan: Plan;
  short_plan: Plan;
  bars: Candle[];
  fundamentals: Record<string, unknown> | null;
  earnings: Record<string, unknown> | null;
  rates: Record<string, unknown> | null;
  news: NewsItem[];
  market: MarketOverview | null;
  multi_timeframe: Record<string, MtfRow>;
  freshness: Freshness;
  timeframe_label?: string;
}

export interface Quote {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  price: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  previous_close?: number | null;
  change?: number | null;
  change_percent?: number | null;
  volume?: number | null;
  average_volume?: number | null;
  volume_ratio?: number | null;
  market_cap?: number | null;
  pe?: number | null;
  forward_pe?: number | null;
  beta?: number | null;
  week52_low?: number | null;
  week52_high?: number | null;
  market_state: string;
  freshness: Freshness;
}

export interface Freshness {
  source: string;
  timestamp: string;
  data_status: DataStatus;
  latency_ms: number;
  algorithm_version?: string;
}

export interface Indicators {
  ema9?: number | null;
  ema20?: number | null;
  ema21?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  rsi?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_hist?: number | null;
  vwap?: number | null;
  atr?: number | null;
  volume_ratio?: number | null;
  last_close?: number | null;
  higher_highs?: boolean;
  higher_lows?: boolean;
}

export interface Levels {
  pivot?: number | null;
  s1?: number | null;
  s2?: number | null;
  s3?: number | null;
  r1?: number | null;
  r2?: number | null;
  r3?: number | null;
  swing_high?: number | null;
  swing_low?: number | null;
  vwap?: number | null;
  support_zones?: [number, number][];
  resistance_zones?: [number, number][];
  methods_used?: string[];
}

export interface Category {
  id: number;
  name: string;
  status: "BULLISH" | "BEARISH" | "NEUTRAL" | "CAUTION";
  raw_score: number;
  weight: number;
  weighted_score: number;
  details: string;
  evidence: Record<string, unknown>;
}

export interface Signal {
  symbol: string;
  timeframe: string;
  timeframe_label: string;
  score: number;
  signal: string;
  confidence: string;
  bullish_signals: number;
  neutral_signals: number;
  bearish_signals: number;
  categories: Category[];
  explanation: string;
  hard_filters: string[];
  alignment?: string | null;
  alignment_bullish?: number | null;
  alignment_total?: number | null;
  data_timestamp: string;
  algorithm_version: string;
  freshness: Freshness;
}

export interface Plan {
  bias: string;
  setup: string;
  entry_low?: number | null;
  entry_high?: number | null;
  ideal_entry?: number | null;
  stop?: number | null;
  invalidation?: number | null;
  target1?: number | null;
  target2?: number | null;
  target3?: number | null;
  risk?: number | null;
  reward?: number | null;
  risk_reward?: number | null;
  trade_allowed: boolean;
  block_reason?: string | null;
  notes: string[];
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  id?: string;
  headline: string;
  source?: string;
  url?: string;
  published_at?: string;
  sentiment?: string;
  category?: string;
}

export interface MtfRow {
  trend?: string;
  rsi?: number | null;
  macd?: string;
  vwap?: string;
  volume?: string;
  score?: number;
  signal?: string;
  error?: string;
}

export interface MarketOverview {
  spx?: number | null;
  spx_change_pct?: number | null;
  ndx?: number | null;
  ndx_change_pct?: number | null;
  dji?: number | null;
  dji_change_pct?: number | null;
  vix?: number | null;
  vix_change_pct?: number | null;
  qqq?: number | null;
  qqq_change_pct?: number | null;
  sectors?: Record<string, { etf: string; price: number; change_percent?: number | null }>;
  treasury?: { yield?: number; change_1d?: number; trend_20d?: string; source?: string } | null;
}

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}
