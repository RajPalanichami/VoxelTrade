import type { AnalysisBundle, Candle, Category, DataStatus, Timeframe } from "./types";

export const BUYING_HORIZONS = ["LONG_TERM", "SWING", "DAY_TRADE", "SCALP"] as const;
export type BuyingHorizon = (typeof BUYING_HORIZONS)[number];

export const BUYING_HORIZON_LABEL: Record<BuyingHorizon, string> = {
  LONG_TERM: "Long Term",
  SWING: "Swing",
  DAY_TRADE: "Day Trade",
  SCALP: "Scalp",
};

export const BUYING_HORIZON_TIMEFRAME: Record<BuyingHorizon, Timeframe> = {
  LONG_TERM: "1d",
  SWING: "4h",
  DAY_TRADE: "30m",
  SCALP: "5m",
};

export const BUYING_STATES = [
  "LONG_SETUP",
  "WATCH",
  "WAIT",
  "NO_TRADE",
  "INSUFFICIENT_DATA",
  "BREAKOUT_PENDING",
  "BREAKOUT_CONFIRMED",
  "RETEST_PENDING",
  "RETEST_CONFIRMED",
  "FAILED",
  "INVALIDATED",
] as const;
export type BuyingState = (typeof BUYING_STATES)[number];

export type EvidenceTone = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNCONFIRMED";

export interface BuyingEvidence {
  id: string;
  label: string;
  tone: EvidenceTone;
  condition: string;
  current: string;
  expected: string;
  status: "MET" | "NOT_MET" | "UNKNOWN";
  explanation: string;
}

export interface BuyingLevel {
  label: string;
  price: number | null;
  why: string;
}

export interface RiskRewardInput {
  entry: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
}

export interface RiskRewardResult extends RiskRewardInput {
  risk: number | null;
  reward1: number | null;
  reward2: number | null;
  reward3: number | null;
  rr1: number | null;
  rr2: number | null;
  rr3: number | null;
  valid: boolean;
  note: string;
}

export interface PositionSizeInput {
  accountSize: number;
  riskPct: number;
  entry: number | null;
  stop: number | null;
}

export interface PositionSizeResult {
  maxDollarRisk: number | null;
  riskPerShare: number | null;
  maxShares: number | null;
  positionValue: number | null;
  portfolioExposurePct: number | null;
  valid: boolean;
  note: string;
}

export interface BuyingDecision {
  symbol: string;
  name: string;
  horizon: BuyingHorizon;
  timeframe: Timeframe;
  state: BuyingState;
  why: string;
  what: string;
  soWhat: string;
  whatNext: string[];
  whatChanges: { confirm: string[]; caution: string[]; invalidate: string[] };
  regime: string;
  trend: string;
  momentum: string;
  volume: string;
  structure: string;
  catalyst: string;
  valuation: string;
  riskReward: number | null;
  evidence: BuyingEvidence[];
  levels: BuyingLevel[];
  matrix: Array<{ name: string; current: string; status: string; explanation: string }>;
  beginner: Array<{ term: string; what: string; current: string; meaning: string }>;
  thesis: string[];
  scenarios: Array<{ id: string; title: string; detail: string }>;
  quality: Array<{ label: string; value: string }>;
  sources: string[];
}

export interface StockBuyingPayload {
  horizon: BuyingHorizon;
  timeframe: Timeframe;
  decision: BuyingDecision;
  bundle: AnalysisBundle;
  events: Array<{ name: string; dateLabel: string; timeLabel: string; status: string; impact: string }>;
  overlays: { sma20: number | null; sma50: number | null; sma200: number | null };
  relative: {
    stock: number | null;
    spy: number | null;
    sector: number | null;
    sectorName: string | null;
    sectorEtf: string | null;
    note: string;
  };
  methodology: string;
}

export const BEGINNER_GLOSSARY: Record<string, string> = {
  VWAP: "VWAP is the volume-weighted average price for the session. Trading above it means buyers have paid more than the typical share so far.",
  RSI: "RSI measures recent price momentum on a 0–100 scale. An elevated RSI does not automatically mean the stock must fall; strong trends can stay elevated.",
  MACD: "MACD compares two moving averages. A positive histogram means shorter-term momentum is stronger than the longer average.",
  ATR: "ATR measures typical candle range. It is used for stop distance, not as a buy or sell signal.",
  RVOL: "Relative volume compares current volume with the recent average. Above 1.0x means more participation than usual.",
  SMA: "A simple moving average is the average close over N completed candles. Price above a rising average is evidence of an uptrend, not a guarantee.",
  EMA: "An exponential moving average weights recent closes more. It reacts faster than a simple average.",
  BOLLINGER: "Bollinger Bands sit a set number of ATRs around a moving average. A touch of the upper band is not an automatic sell.",
  SUPPORT: "Support is a price area where buyers have previously stepped in. It can fail.",
  RESISTANCE: "Resistance is a price area where sellers have previously stepped in. A close through it with volume is stronger evidence than a wick.",
  BREAKOUT: "A breakout is only confirmed after a close beyond the level plus follow-through. A wick above resistance is not confirmation.",
  RETEST: "A retest is a return to the broken level. Holding it as support is confirmation; losing it can invalidate the breakout.",
  RS: "Relative strength compares this ticker’s return with SPY or its sector. Outperformance is context, not a buy signal by itself.",
};

export function isBuyingHorizon(value: string): value is BuyingHorizon {
  return (BUYING_HORIZONS as readonly string[]).includes(value);
}

export function computeRiskReward(input: RiskRewardInput): RiskRewardResult {
  const { entry, stop, target1, target2, target3 } = input;
  if (entry == null || stop == null || !Number.isFinite(entry) || !Number.isFinite(stop)) {
    return {
      ...input,
      risk: null,
      reward1: null,
      reward2: null,
      reward3: null,
      rr1: null,
      rr2: null,
      rr3: null,
      valid: false,
      note: "Entry and stop are required. Values are not invented.",
    };
  }
  const risk = entry - stop;
  if (risk <= 0) {
    return {
      ...input,
      risk,
      reward1: null,
      reward2: null,
      reward3: null,
      rr1: null,
      rr2: null,
      rr3: null,
      valid: false,
      note: "Stop must be below entry for a long plan. A negative or zero risk is not a valid R:R.",
    };
  }
  const reward1 = target1 != null ? target1 - entry : null;
  const reward2 = target2 != null ? target2 - entry : null;
  const reward3 = target3 != null ? target3 - entry : null;
  const rr = (reward: number | null) => (reward == null ? null : reward / risk);
  return {
    ...input,
    risk,
    reward1,
    reward2,
    reward3,
    rr1: rr(reward1),
    rr2: rr(reward2),
    rr3: rr(reward3),
    valid: reward1 != null && reward1 > 0,
    note:
      reward1 != null && reward1 <= 0
        ? "Target 1 is not above entry, so R:R is not favorable and is not dressed up."
        : "R:R uses (target − entry) / (entry − stop) on the prices you entered.",
  };
}

export function computePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { accountSize, riskPct, entry, stop } = input;
  if (!Number.isFinite(accountSize) || accountSize <= 0 || !Number.isFinite(riskPct) || riskPct <= 0) {
    return {
      maxDollarRisk: null,
      riskPerShare: null,
      maxShares: null,
      positionValue: null,
      portfolioExposurePct: null,
      valid: false,
      note: "Account size and risk percent must be positive numbers.",
    };
  }
  if (entry == null || stop == null || entry <= stop) {
    return {
      maxDollarRisk: accountSize * (riskPct / 100),
      riskPerShare: null,
      maxShares: null,
      positionValue: null,
      portfolioExposurePct: null,
      valid: false,
      note: "A valid long position needs entry above stop.",
    };
  }
  const maxDollarRisk = accountSize * (riskPct / 100);
  const riskPerShare = entry - stop;
  const maxShares = Math.floor(maxDollarRisk / riskPerShare);
  const positionValue = maxShares * entry;
  return {
    maxDollarRisk,
    riskPerShare,
    maxShares,
    positionValue,
    portfolioExposurePct: accountSize ? (positionValue / accountSize) * 100 : null,
    valid: maxShares > 0,
    note:
      "Maximum shares = floor((account × risk%) / (entry − stop)). This is a size cap, not a recommendation to buy.",
  };
}

export function freshnessLabel(status?: DataStatus | string | null) {
  const s = String(status || "UNAVAILABLE").toUpperCase();
  if (s === "LIVE") return "Real-time or near-real-time from the active provider";
  if (s === "DELAYED") return "Delayed";
  if (s === "EOD") return "End-of-day";
  if (s === "STALE") return "Stale — not treated as live";
  return "Unavailable";
}

export type { Candle, Category };
