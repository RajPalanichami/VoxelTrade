export type Timeframe = "5m" | "30m" | "1h" | "4h" | "1d";
export type SwingTimeframe = "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
export type PatternTimeframe = "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1M";

export const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "5m", label: "5 Minutes" },
  { id: "30m", label: "30 Minutes" },
  { id: "1h", label: "1 Hour" },
  { id: "4h", label: "4 Hours" },
  { id: "1d", label: "Daily" },
];

export const SWING_TIMEFRAMES: { id: SwingTimeframe; label: string }[] = [
  { id: "15m", label: "15 Minutes" },
  { id: "30m", label: "30 Minutes" },
  { id: "1h", label: "1 Hour" },
  { id: "4h", label: "4 Hours" },
  { id: "1d", label: "Daily" },
  { id: "1w", label: "Weekly" },
];

export const PATTERN_TIMEFRAMES: { id: PatternTimeframe; label: string }[] = [
  { id: "5m", label: "5 Minutes" },
  { id: "15m", label: "15 Minutes" },
  { id: "30m", label: "30 Minutes" },
  { id: "1h", label: "1 Hour" },
  { id: "4h", label: "4 Hours" },
  { id: "1d", label: "Daily" },
  { id: "1w", label: "Weekly" },
  { id: "1M", label: "Monthly" },
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
  long_name?: string;
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
  currency?: string;
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

export type SwingSignal = "BULLISH" | "BEARISH" | "NEUTRAL" | "NO_TRADE";

export type SwingStrategyId =
  | "ellipse"
  | "swing-sr"
  | "fibonacci"
  | "liquidity-sweep"
  | "liquidity-analysis"
  | "swing-algo"
  | "big-trend"
  | "mtf-swing"
  | "weighted"
  | "target-isolator";

export interface SwingPlan {
  allowed: boolean;
  entry: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  riskReward: number | null;
  invalidation: number | null;
}

export interface SwingOverlayLine {
  price: number;
  color: string;
  title: string;
  style?: "solid" | "dashed";
}

export interface SwingMarker {
  time: number;
  price: number;
  kind: "high" | "low" | "sweep" | "signal";
}

export interface SwingOverlays {
  emas: boolean;
  fibonacci: boolean;
  supportResistance: boolean;
  liquidity: boolean;
  entryExit: boolean;
  targets: boolean;
  historical: boolean;
  lines: SwingOverlayLine[];
  markers: SwingMarker[];
}

export interface SwingStrategyResult {
  id: SwingStrategyId;
  name: string;
  score: number;
  signal: SwingSignal;
  plan: SwingPlan;
  overlays: SwingOverlays;
  why: string;
  whenEnter: string;
  whenExit: string;
  risks: string;
  scoreWhy: string;
  noTradeReason: string | null;
}

export interface SwingSummary {
  overallScore: number;
  overallSignal: SwingSignal;
  overallLabel: string;
  agreement: string;
  preferredEntryLow: number | null;
  preferredEntryHigh: number | null;
  preferredEntry: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  riskReward: number | null;
  summary: string;
  action: string;
}

export interface SwingAnalysis {
  symbol: string;
  timeframe: SwingTimeframe;
  timeframe_label: string;
  quote: Quote;
  indicators: Indicators;
  levels: Levels;
  bars: Candle[];
  strategies: SwingStrategyResult[];
  summary: SwingSummary;
  higher_timeframe: SwingTimeframe;
  higher_trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  freshness: Freshness;
}

export type PatternBias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type OverviewDecision = "BUY / ENTER" | "SELL / ENTER" | "WAIT" | "AVOID";
export type TradeDecision = "ENTER" | "ENTER SWING TRADE" | "WAIT FOR BREAKOUT" | "AVOID / NO TRADE";

export interface PatternEvidencePoint {
  timestamp: string;
  candleIndex: number;
  price: number;
  type: "SWING_HIGH" | "SWING_LOW";
  role: string;
}

export interface PatternSignalFactor {
  name: string;
  score: number;
  max: number;
  note: string;
}

export interface PatternSnapshot {
  timeframe: PatternTimeframe;
  timeframe_label: string;
  pattern_name: string;
  market_structure: string;
  structure_explanation: string;
  structure_conflict: string | null;
  bias: PatternBias;
  status: string;
  pattern_status: string;
  decision: OverviewDecision;
  trading_signal: string;
  signal_action: string;
  signal_score: number | null;
  entry_status: string;
  explanation: string;
  alternatives: { name: string; confidence: number }[];
  points: PatternEvidencePoint[];
  evidence: { label: string; value: string; ok: boolean | null }[];
  signal_factors: PatternSignalFactor[];
  neckline: number | null;
  support: number | null;
  resistance: number | null;
  breakout_note: string | null;
  wick_note: string | null;
  invalidation: string | null;
  confidence: number | null;
  volume_note: string | null;
}

export interface PatternTradePlan {
  style: "day" | "swing";
  style_label: string;
  timeframe: PatternTimeframe;
  timeframe_label: string;
  heading: string;
  pattern_name: string;
  bias: PatternBias;
  status: string;
  pattern_status: string;
  market_structure: string;
  entry: string | null;
  entry_zone: string | null;
  preferred_entry: string | null;
  stop: string | null;
  target_1: string | null;
  target_2: string | null;
  target_3: string | null;
  decision: TradeDecision;
  trading_signal: string;
  signal_action: string;
  signal_score: number | null;
  entry_status: string;
  explanation: string;
  alternatives: { name: string; confidence: number }[];
  points: PatternEvidencePoint[];
  evidence: { label: string; value: string; ok: boolean | null }[];
  signal_factors: PatternSignalFactor[];
  neckline: number | null;
  support: number | null;
  resistance: number | null;
  breakout_note: string | null;
  wick_note: string | null;
  invalidation: string | null;
  confidence: number | null;
  volume_note: string | null;
}

export interface ChartPatternAnalysis {
  symbol: string;
  name: string;
  price: number;
  change_percent: number | null;
  overview: {
    daily: PatternSnapshot;
    weekly: PatternSnapshot;
    monthly: PatternSnapshot;
  };
  trade: PatternTradePlan;
  mtf_summary: {
    status: string;
    explanation: string;
    short_term: string;
    intermediate_term: string;
    long_term: string;
  };
  freshness: Freshness;
}
