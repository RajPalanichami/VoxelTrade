export const STOCK_DECISION_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"] as const;
export type StockDecisionTimeframe = (typeof STOCK_DECISION_TIMEFRAMES)[number];

export const STOCK_DECISION_TF_LABEL: Record<StockDecisionTimeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
  "1M": "1M",
};

export const STOCK_DECISION_TF_ROLE: Record<StockDecisionTimeframe, string> = {
  "5m": "Intraday scalp decision",
  "15m": "Short-term intraday decision",
  "30m": "Intraday swing decision",
  "1h": "Short-term swing decision",
  "4h": "Swing decision",
  "1d": "Primary / default trading decision",
  "1w": "Medium / long-term trend",
  "1M": "Macro / long-term trend",
};

export const STOCK_DECISION_UNIVERSE = [
  "NVDA", "TSM", "AVGO", "MU", "AMD", "ASML", "AMAT", "ARM", "MRVL", "LRCX",
  "AAPL", "MSFT", "GOOGL", "AMZN", "META", "PLTR", "ORCL", "ANET", "ADBE", "DELL",
] as const;

export const STOCK_DECISION_ACTIONS = ["BUY_SETUP", "WATCH", "WAIT", "NO_TRADE", "INSUFFICIENT_DATA"] as const;
export type StockDecisionAction = (typeof STOCK_DECISION_ACTIONS)[number];

export const STOCK_DECISION_SETUPS = [
  "BREAKOUT",
  "PULLBACK",
  "TREND_CONTINUATION",
  "REVERSAL",
  "RANGE",
  "MOMENTUM",
  "NO_SETUP",
] as const;
export type StockDecisionSetup = (typeof STOCK_DECISION_SETUPS)[number];

export type StockDecisionDirection = "BULLISH" | "BEARISH" | "NEUTRAL";
export type StockDecisionConfidence = "HIGH" | "MEDIUM" | "LOW";
export type StockDecisionStructure = "BULLISH" | "BEARISH" | "RANGE" | "TRANSITION" | "INSUFFICIENT_DATA";
export type DataAvailability = "LIVE" | "DELAYED" | "STALE" | "HISTORICAL" | "PARTIAL" | "ESTIMATED" | "UNAVAILABLE";
export type DataTier = 1 | 2 | 3 | 4 | 5;

export interface StockDecisionScore {
  id: string;
  label: string;
  value: number | null;
  why: string;
}

export interface StockDecisionLevel {
  label: string;
  price: number | null;
  strength: "MAJOR" | "STRONG" | "MODERATE" | "WATCH";
  why: string;
}

export interface StockDecisionMtfRow {
  timeframe: StockDecisionTimeframe;
  label: string;
  trend: string;
  structure: string;
  vwap: string;
  volume: string;
  orderFlow: string;
  available: boolean;
}

export interface StockDecisionWeekDay {
  date: string;
  close: number | null;
  changePct: number | null;
  volume: number | null;
  averageVolume: number | null;
  rvol: number | null;
  direction: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
  note: string;
}

export interface StockDecisionBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockDecisionMap {
  symbol: string;
  name: string;
  timeframe: StockDecisionTimeframe;
  timeframeLabel: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  session: string | null;
  freshness: { source: string; dataStatus: string; timestamp: string; ageLabel: string };
  dataTier: DataTier;
  dataQuality: {
    bars: DataAvailability;
    quote: DataAvailability;
    orderFlow: DataAvailability;
    orderBook: DataAvailability;
    timeAndSales: DataAvailability;
    historicalBook: DataAvailability;
    note: string;
  };
  marketState: StockDecisionStructure;
  currentSetup: string;
  orderFlowState: string;
  volumeState: string;
  breakoutState: string;
  action: StockDecisionAction;
  direction: StockDecisionDirection;
  confidence: StockDecisionConfidence;
  setup: StockDecisionSetup;
  why: string;
  reasons: string[];
  invalidations: string[];
  beginnerWhy: string;
  scores: StockDecisionScore[];
  structure: { label: StockDecisionStructure; hh: boolean; hl: boolean; lh: boolean; ll: boolean; detail: string };
  location: string;
  participation: string;
  volume: {
    last: number | null;
    average20: number | null;
    rvol: number | null;
    vs5: number | null;
    upVolume: number | null;
    downVolume: number | null;
    trend: string;
    matrix: string;
    interpretation: string;
  };
  orderFlow: {
    estimatedBuy: number | null;
    estimatedSell: number | null;
    delta: number | null;
    cvd: number | null;
    ratio: number | null;
    state: string;
    disclaimer: string;
    available: boolean;
  };
  orderBook: {
    available: false;
    reason: string;
    disclaimer: string;
  };
  vwap: {
    value: number | null;
    distancePct: number | null;
    state: string;
    note: string;
  };
  breakout: {
    status: string;
    resistance: number | null;
    price: number | null;
    closeConfirmed: boolean;
    volumeConfirmed: boolean;
    strength: number | null;
    note: string;
  };
  supports: StockDecisionLevel[];
  resistances: StockDecisionLevel[];
  mtf: StockDecisionMtfRow[];
  weekVolume: StockDecisionWeekDay[];
  whatChanged: { label: string; value: string }[];
  whatChangedNote: string;
  context: { spy: number | null; qqq: number | null; iwm: number | null; vix: number | null; vsQqq: number | null; vsSpy: number | null; note: string };
  eventRisk: { label: string; detail: string };
  sessions: {
    premarket: { price: number | null; high: number | null; low: number | null; volume: number | null; vwap: number | null; available: boolean };
    afterHours: { price: number | null; high: number | null; low: number | null; volume: number | null; vwap: number | null; available: boolean };
  };
  pattern: { name: string; bias: "BULLISH" | "BEARISH" | "NEUTRAL"; status: string; note: string };
  plan: {
    entryZone: string;
    confirmation: string;
    stop: string;
    target1: string;
    target2: string;
    target3: string;
    rr: number | null;
    rrNote: string;
    invalidation: string;
  };
  noTradeReasons: string[];
  overlays: { ema9: number | null; ema21: number | null; sma50: number | null; sma200: number | null; rsi: number | null; macdHist: number | null; atr: number | null };
  bars: StockDecisionBar[];
  deltaSeries: number[];
  cvdSeries: number[];
  methodology: string;
  summary: StockDecisionSummary;
}

export type FactorTone = "bullish" | "neutral" | "bearish" | "caution" | "nodata";
export type StockDecisionLabel =
  | "STRONG BULLISH"
  | "BULLISH"
  | "CAUTIOUSLY BULLISH"
  | "NEUTRAL"
  | "CAUTION"
  | "BEARISH"
  | "STRONG BEARISH"
  | "CONFLICTING";
export type StockDecisionTone = "Bullish" | "Neutral" | "Bearish" | "Caution";
export type DataQualityGrade = "Good" | "Partial" | "Poor";

export interface StockDecisionFactor {
  id: string;
  label: string;
  tone: FactorTone;
  stance: string;
  value: string;
  interpretation: string;
  raw: Record<string, string | number | boolean | null>;
  threshold: string;
  score: number | null;
  weight: number;
  contribution: number | null;
  calculation: string;
  explanation: string;
  available: boolean;
}

export interface StockDecisionMtfScore {
  timeframe: StockDecisionTimeframe;
  label: string;
  role: string;
  decision: StockDecisionTone;
  labelFull: StockDecisionLabel;
  score: number | null;
  available: boolean;
}

export interface StockDecisionSummary {
  decision: StockDecisionTone;
  label: StockDecisionLabel;
  score: number;
  confidence: StockDecisionConfidence;
  confidencePct: number;
  confidenceWhy: string;
  dataQuality: DataQualityGrade;
  dataQualityNote: string;
  timeframeRole: string;
  trendScore: number | null;
  momentumScore: number | null;
  volumeScore: number | null;
  structureScore: number | null;
  riskScore: number | null;
  marketScore: number | null;
  override: string | null;
  factors: StockDecisionFactor[];
  whyPlus: string[];
  whyMinus: string[];
  whyMissing: string[];
  headline: string;
  mtf: StockDecisionMtfScore[];
  mtfAligned: number;
  mtfAvailable: number;
  mtfAlignmentPct: number | null;
  mtfNote: string;
  float: {
    shares: number | null;
    averageVolume: number | null;
    currentVolume: number | null;
    turnover: number | null;
    percentile: number | null;
    note: string;
  };
}

export function isStockDecisionTimeframe(value: string): value is StockDecisionTimeframe {
  return (STOCK_DECISION_TIMEFRAMES as readonly string[]).includes(value);
}
