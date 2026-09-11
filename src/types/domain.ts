export type DataStatus = "LIVE" | "DELAYED" | "EOD" | "STALE" | "UNAVAILABLE";
export type SignalLabel = "STRONG_BUY" | "BUY" | "WAIT" | "WEAK" | "SELL" | "NO_TRADE";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type StatusTone = "BULLISH" | "BEARISH" | "NEUTRAL" | "CAUTION";

export interface Freshness {
  source: string;
  timestamp: string;
  data_status: DataStatus;
  latency_ms: number;
  algorithm_version?: string;
}

export interface OHLCVBar {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: string;
  source: string;
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
  currency: string;
  market_state: string;
  freshness: Freshness;
}

export interface Indicators {
  ema9?: number | null;
  ema20?: number | null;
  ema21?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  ema9_slope?: number | null;
  ema20_slope?: number | null;
  ema21_slope?: number | null;
  ema50_slope?: number | null;
  ema200_slope?: number | null;
  rsi?: number | null;
  rsi_prev?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_hist?: number | null;
  macd_hist_prev?: number | null;
  vwap?: number | null;
  atr?: number | null;
  bb_upper?: number | null;
  bb_mid?: number | null;
  bb_lower?: number | null;
  volume_sma20?: number | null;
  volume_ratio?: number | null;
  last_volume?: number | null;
  last_close?: number | null;
  last_high?: number | null;
  last_low?: number | null;
  higher_highs: boolean;
  higher_lows: boolean;
  lower_highs: boolean;
  lower_lows: boolean;
}

export interface SRLevels {
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
  ema20?: number | null;
  ema50?: number | null;
  support_zones: [number, number][];
  resistance_zones: [number, number][];
  methods_used: string[];
}

export interface SignalEvidence {
  id: number;
  name: string;
  status: StatusTone;
  raw_score: number;
  weight: number;
  weighted_score: number;
  details: string;
  evidence: Record<string, unknown>;
}

export interface TradingPlan {
  bias: Bias;
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

export interface SignalResult {
  symbol: string;
  timeframe: string;
  timeframe_label: string;
  score: number;
  signal: SignalLabel;
  confidence: Confidence;
  bullish_signals: number;
  neutral_signals: number;
  bearish_signals: number;
  categories: SignalEvidence[];
  explanation: string;
  hard_filters: string[];
  alignment?: string | null;
  alignment_bullish?: number | null;
  alignment_total?: number | null;
  data_timestamp: string;
  algorithm_version: string;
  freshness: Freshness;
}

export interface Envelope<T> {
  data: T;
  source: string;
  timestamp: string;
  dataStatus: DataStatus;
  latencyMs: number;
  algorithmVersion: string;
}

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export function emptyIndicators(partial: Partial<Indicators> = {}): Indicators {
  return {
    higher_highs: false,
    higher_lows: false,
    lower_highs: false,
    lower_lows: false,
    ...partial,
  };
}

export function emptyLevels(partial: Partial<SRLevels> = {}): SRLevels {
  return {
    support_zones: [],
    resistance_zones: [],
    methods_used: [],
    ...partial,
  };
}

export function emptyPlan(partial: Partial<TradingPlan> = {}): TradingPlan {
  return {
    bias: "NEUTRAL",
    setup: "",
    trade_allowed: false,
    notes: [],
    ...partial,
  };
}

export function serializeQuote(q: Quote): Record<string, unknown> {
  return {
    ...q,
    freshness: q.freshness,
  };
}
