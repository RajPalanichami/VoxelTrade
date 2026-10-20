import { parseCompareTicker } from "@/lib/compare";

export const DEFAULT_BREAKOUT_UNIVERSE = [
  "NVDA",
  "TSM",
  "AVGO",
  "MU",
  "AMD",
  "ASML",
  "AMAT",
  "ARM",
  "MRVL",
  "LRCX",
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "PLTR",
  "ORCL",
  "ANET",
  "ADBE",
  "DELL",
] as const;

export const BREAKOUT_MAX_TICKERS = 40;
export const BREAKOUT_SCAN_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const;
export const BREAKOUT_LIFECYCLE_TIMEFRAMES = ["1h", "4h", "1d", "1w", "1M"] as const;
export type BreakoutScanTimeframe = (typeof BREAKOUT_SCAN_TIMEFRAMES)[number];
export type BreakoutLifecycleTimeframe = (typeof BREAKOUT_LIFECYCLE_TIMEFRAMES)[number];

export type BreakoutUniverseSource = "default" | "search" | "sector" | "etf" | "watchlist" | "custom";

export type BreakoutState =
  | "STRONG_DOWNTREND"
  | "DOWNTREND_WEAKENING"
  | "SELLING_EXHAUSTION"
  | "BASE_FORMING"
  | "ACCUMULATION_POTENTIAL"
  | "EARLY_DEMAND_RETURN"
  | "PRE_BREAKOUT"
  | "BREAKOUT_ATTEMPT"
  | "BREAKOUT_CONFIRMED"
  | "POST_BREAKOUT_CONTINUATION"
  | "BREAKOUT_FAILED"
  | "EXHAUSTION_AFTER_BREAKOUT"
  | "INSUFFICIENT_DATA";

export type BreakoutScoreBand =
  | "NO_SETUP"
  | "EARLY_OBSERVATION"
  | "DEVELOPING"
  | "PRE_BREAKOUT"
  | "HIGH_BREAKOUT_POTENTIAL"
  | "BREAKOUT_CONFIRMED"
  | "INSUFFICIENT_DATA";

export type RecoveryPhase =
  | "LARGE_SELLOFF"
  | "SELLING_EXHAUSTION"
  | "STABILIZATION"
  | "FIRST_HIGHER_LOW"
  | "EARLY_RECOVERY"
  | "RECOVERY"
  | "RESISTANCE_TEST"
  | "BULLISH_RECOVERY_CONFIRMATION"
  | "BREAKOUT"
  | "FOLLOW_THROUGH"
  | "CONSOLIDATION"
  | "MOMENTUM_EXPANSION"
  | "MAJOR_EXPANSION"
  | "PULLBACK"
  | "SUPPORT_TEST"
  | "HIGHER_HIGH"
  | "CONTINUATION"
  | "PROFIT_TAKING"
  | "TREND_BREAKDOWN"
  | "FAILED_BREAKOUT"
  | "INSUFFICIENT_DATA";

export type CandleKind =
  | "STRONG_SELLING"
  | "MODERATE_SELLING"
  | "WEAK_SELLING"
  | "INDECISION"
  | "WEAK_BUYING"
  | "MODERATE_BUYING"
  | "STRONG_BUYING";

export type SellingPressureState = "INCREASING" | "STABLE" | "WEAKENING" | "EXHAUSTED" | "UNAVAILABLE";
export type StructureShift = "BEARISH_STRUCTURE" | "TRANSITIONING_STRUCTURE" | "BULLISH_STRUCTURE" | "INSUFFICIENT_DATA";
export type MomentumState = "MOMENTUM_DETERIORATING" | "MOMENTUM_STABILIZING" | "MOMENTUM_IMPROVING" | "MOMENTUM_ACCELERATING" | "UNAVAILABLE";
export type VolumeState =
  | "SELLING_VOLUME_DECLINING"
  | "BUYING_VOLUME_INCREASING"
  | "VOLUME_EXPANSION"
  | "VOLUME_CONFIRMATION"
  | "VOLUME_DIVERGENCE"
  | "VOLUME_NEUTRAL"
  | "INSUFFICIENT_DATA";
export type CompressionState = "VOLATILITY_CONTRACTION" | "VOLATILITY_EXPANSION" | "COMPRESSION_TO_EXPANSION" | "NORMAL";
export type DemandClass = "WEAK_BOUNCE" | "EARLY_DEMAND_RETURN" | "BREAKOUT_CONFIRMED" | "NOISE" | "NONE";
export type SupportReaction = "SUPPORT_HOLD" | "SUPPORT_TEST" | "SUPPORT_REJECTION" | "SUPPORT_BREAKDOWN" | "NONE";
export type PullbackType = "Healthy" | "Normal" | "Deep" | "Dangerous" | "Trend Breakdown" | "None";
export type BattleWinner = "BUYERS" | "SELLERS" | "UNRESOLVED";
export type DetectionFlag = "DETECTED" | "DEVELOPING" | "NOT_DETECTED" | "INSUFFICIENT_DATA";
export type SelloffSeverity = "Minor" | "Moderate" | "Large" | "Severe" | "Extreme" | "None";
export type ConfidenceLabel = "HIGH" | "MEDIUM" | "LOW";

export type BreakoutScoreWeights = {
  sellingExhaustion: number;
  candleQuality: number;
  volumeTransition: number;
  priceCompression: number;
  higherLow: number;
  momentum: number;
  resistanceProximity: number;
  preBreakout: number;
  marketSector: number;
  historicalSimilarity: number;
};

export type DemandScoreWeights = {
  exhaustion: number;
  candleStrength: number;
  volume: number;
  structure: number;
  support: number;
  momentum: number;
  resistanceBreak: number;
};

export type BreakoutSettings = {
  minRedStreak: number;
  swingLeft: number;
  swingRight: number;
  atrPeriod: number;
  volumeSma: number;
  rvolElevated: number;
  rvolHigh: number;
  rvolExtreme: number;
  rvolLow: number;
  breakoutProximityPct: number;
  minRelVolume: number;
  minPrice: number;
  maxPrice: number;
  minScore: number;
  selloffAtrMinor: number;
  selloffAtrLarge: number;
  selloffAtrSevere: number;
  selloffAtrExtreme: number;
  analogLookback: number;
  analogMinSample: number;
  analogDistance: number;
  demandWeights: DemandScoreWeights;
  scoreWeights: BreakoutScoreWeights;
};

export const DEFAULT_BREAKOUT_SETTINGS: BreakoutSettings = {
  minRedStreak: 5,
  swingLeft: 3,
  swingRight: 3,
  atrPeriod: 14,
  volumeSma: 20,
  rvolElevated: 1.2,
  rvolHigh: 1.5,
  rvolExtreme: 2,
  rvolLow: 0.8,
  breakoutProximityPct: 2.2,
  minRelVolume: 1.2,
  minPrice: 0,
  maxPrice: 0,
  minScore: 0,
  selloffAtrMinor: 1.2,
  selloffAtrLarge: 2.4,
  selloffAtrSevere: 3.6,
  selloffAtrExtreme: 5,
  analogLookback: 180,
  analogMinSample: 8,
  analogDistance: 0.38,
  demandWeights: {
    exhaustion: 20,
    candleStrength: 15,
    volume: 20,
    structure: 15,
    support: 10,
    momentum: 10,
    resistanceBreak: 10,
  },
  scoreWeights: {
    sellingExhaustion: 10,
    candleQuality: 10,
    volumeTransition: 15,
    priceCompression: 10,
    higherLow: 15,
    momentum: 10,
    resistanceProximity: 10,
    preBreakout: 10,
    marketSector: 5,
    historicalSimilarity: 5,
  },
};

export function mergeBreakoutSettings(raw?: Partial<BreakoutSettings> | null): BreakoutSettings {
  if (!raw) return { ...DEFAULT_BREAKOUT_SETTINGS, demandWeights: { ...DEFAULT_BREAKOUT_SETTINGS.demandWeights }, scoreWeights: { ...DEFAULT_BREAKOUT_SETTINGS.scoreWeights } };
  return {
    ...DEFAULT_BREAKOUT_SETTINGS,
    ...raw,
    demandWeights: { ...DEFAULT_BREAKOUT_SETTINGS.demandWeights, ...raw.demandWeights },
    scoreWeights: { ...DEFAULT_BREAKOUT_SETTINGS.scoreWeights, ...raw.scoreWeights },
  };
}

export function breakoutScoreBand(score: number | null): BreakoutScoreBand {
  if (score == null || Number.isNaN(score)) return "INSUFFICIENT_DATA";
  if (score >= 90) return "BREAKOUT_CONFIRMED";
  if (score >= 75) return "HIGH_BREAKOUT_POTENTIAL";
  if (score >= 60) return "PRE_BREAKOUT";
  if (score >= 40) return "DEVELOPING";
  if (score >= 20) return "EARLY_OBSERVATION";
  return "NO_SETUP";
}

export function parseBreakoutTickers(raw: unknown, max = BREAKOUT_MAX_TICKERS) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .toUpperCase()
        .split(/[\s,;|]+/);
  const tickers: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const text = String(item || "").trim();
    if (!text) continue;
    const parsed = parseCompareTicker(text, "Ticker");
    if ("error" in parsed) {
      errors.push(`Invalid or unsupported ticker: ${text}`);
      continue;
    }
    if (seen.has(parsed.symbol)) {
      errors.push(`Duplicate ticker detected: ${parsed.symbol}`);
      continue;
    }
    if (tickers.length >= max) {
      errors.push(`Maximum ${max} tickers.`);
      break;
    }
    seen.add(parsed.symbol);
    tickers.push(parsed.symbol);
  }
  return { tickers, errors };
}

export function stateLabel(state: BreakoutState) {
  return state.replaceAll("_", " ");
}

export function phaseLabel(phase: RecoveryPhase) {
  return phase.replaceAll("_", " ");
}

export type BreakoutChartBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ScoreFactor = { name: string; score: number; max: number; note: string };
