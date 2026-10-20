import { parseCompareTicker } from "@/lib/compare";

export const DEFAULT_OPPORTUNITY_UNIVERSE = [
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

export const OPPORTUNITY_MAX_TICKERS = 20;
export const OPPORTUNITY_MIN_TICKERS = 1;

export const OPPORTUNITY_TIMEFRAMES = ["1w", "1d", "4h", "1h", "30m", "15m", "5m"] as const;
export type OpportunityTimeframe = (typeof OPPORTUNITY_TIMEFRAMES)[number];

export type OpportunityState =
  | "DEVELOPING"
  | "PRE-BREAKOUT"
  | "TRIGGERED"
  | "CONFIRMED"
  | "RETEST"
  | "ACTIVE"
  | "NO TRADE"
  | "INSUFFICIENT DATA";

export type OpportunityEventFlag =
  | "PREVIOUSLY_INVALIDATED"
  | "FAILED_BREAKOUT"
  | "LOST_VWAP"
  | "LOST_BREAKOUT_LEVEL"
  | "TARGET_REACHED"
  | "STOP_TRIGGERED";

export type TradeReadiness = "VERY HIGH" | "HIGH" | "MODERATE" | "LOW" | "VERY LOW" | "NO TRADE";
export type OpportunityBucket = "BREAKOUT_WATCH" | "TECHNICAL_WATCH" | "NO_TRADE" | "INSUFFICIENT";
export type MarketRegimeLabel = "BULLISH" | "NEUTRAL" | "CAUTIOUS" | "BEARISH";
export type RiskRegime = "RISK-ON" | "RISK-NEUTRAL" | "RISK-OFF";
export type TrendLabel = "Bullish" | "Neutral" | "Bearish";
export type StructureBias = "BULLISH" | "BEARISH" | "NEUTRAL" | "TRANSITIONING";
export type StrengthLabel = "Strong" | "Improving" | "Neutral" | "Weakening" | "Weak";
export type RsLabel = "Outperforming" | "Improving" | "Neutral" | "Underperforming" | "Deteriorating";
export type VwapStatus =
  | "STRONG_SUPPORT"
  | "SUPPORT"
  | "ABOVE_VWAP"
  | "NEUTRAL"
  | "RECLAIMING"
  | "BELOW_VWAP"
  | "RESISTANCE"
  | "STRONG_RESISTANCE"
  | "LOST_VWAP";
export type VwapDistanceStatus = "NORMAL" | "EXTENDED" | "VERY EXTENDED";
export type VolumeBreakoutLabel = "NOT YET CONFIRMED" | "DETECTED" | "CONFIRMED";
export type RrStatus = "POOR / NO TRADE" | "WEAK" | "ACCEPTABLE" | "STRONG" | "VERY STRONG" | "N/A";
export type CatalystType = "Positive" | "Negative" | "Neutral";
export type CatalystCategory =
  | "EARNINGS"
  | "GUIDANCE"
  | "PRODUCT"
  | "CONTRACT"
  | "ANALYST"
  | "MACRO"
  | "M_AND_A"
  | "REGULATORY"
  | "SECTOR"
  | "OTHER";
export type ScoreBand = "Strong Setup" | "Developing / Watch" | "Neutral / Developing" | "No Clear Setup";
export type ResistanceSource =
  | "SWING_HIGH"
  | "CONSOLIDATION_HIGH"
  | "REPEATED_REJECTION"
  | "PRIOR_BREAKOUT"
  | "DAILY_LEVEL"
  | "WEEKLY_LEVEL"
  | "GAP"
  | "VOLUME_PROFILE"
  | "PREVIOUS_DAY_HIGH"
  | "PREVIOUS_WEEK_HIGH"
  | "52_WEEK_HIGH";
export type OpportunityAlertType =
  | "APPROACHING_BREAKOUT"
  | "BREAKOUT_TRIGGERED"
  | "VOLUME_CONFIRMATION"
  | "VWAP_CONFIRMATION"
  | "SUCCESSFUL_RETEST"
  | "BREAKOUT_FAILURE"
  | "SETUP_INVALIDATED"
  | "NEWS_CATALYST";

export type OpportunitySettings = {
  breakoutProximityPct: number;
  minRelVolume: number;
  requireVwapSupport: boolean;
  confirmTimeframe: "15m" | "30m";
  minRR: number;
  rsiMax: number;
  rsiMin: number;
  adxThreshold: number;
  atrPeriod: number;
  newsLookbackHours: number;
  earningsWarnDays: number;
  overextensionPct: number;
  minTechnicalScore: number;
  minResistanceTests: number;
  enabledAlerts: OpportunityAlertType[];
};

export const DEFAULT_OPPORTUNITY_SETTINGS: OpportunitySettings = {
  breakoutProximityPct: 2,
  minRelVolume: 1.2,
  requireVwapSupport: true,
  confirmTimeframe: "30m",
  minRR: 1.5,
  rsiMax: 75,
  rsiMin: 35,
  adxThreshold: 20,
  atrPeriod: 14,
  newsLookbackHours: 48,
  earningsWarnDays: 14,
  overextensionPct: 3.5,
  minTechnicalScore: 65,
  minResistanceTests: 2,
  enabledAlerts: [
    "APPROACHING_BREAKOUT",
    "BREAKOUT_TRIGGERED",
    "VOLUME_CONFIRMATION",
    "VWAP_CONFIRMATION",
    "SUCCESSFUL_RETEST",
    "BREAKOUT_FAILURE",
    "SETUP_INVALIDATED",
    "NEWS_CATALYST",
  ],
};

export type ResistanceLevel = {
  price: number;
  timeframe: string;
  source: ResistanceSource;
  testCount: number;
  lastTestTime?: string;
  strength: number;
  confidence: number;
};

export type ScoreFactor = { name: string; score: number; max: number; note: string };

export type OpportunityNewsItem = {
  headline: string;
  source: string;
  publishedAt: string | null;
  age: string;
  catalystType: CatalystType;
  category: CatalystCategory;
  relevance: "High" | "Medium" | "Low";
  relevanceScore: number;
  freshness: number;
  technicalImpact: "SUPPORTIVE" | "NEUTRAL" | "NEGATIVE";
  url?: string;
};

export function rrStatus(rr: number | null): RrStatus {
  if (rr == null || !Number.isFinite(rr)) return "N/A";
  if (rr < 1) return "POOR / NO TRADE";
  if (rr < 1.5) return "WEAK";
  if (rr < 2) return "ACCEPTABLE";
  if (rr < 3) return "STRONG";
  return "VERY STRONG";
}

export function computeRiskReward(entry: number | null, invalidation: number | null, target: number | null, side: "long" | "short" = "long") {
  if (entry == null || invalidation == null || target == null) {
    return { rr: null as number | null, risk: null as number | null, reward: null as number | null, status: "N/A" as RrStatus };
  }
  const risk = side === "long" ? entry - invalidation : invalidation - entry;
  const reward = side === "long" ? target - entry : entry - target;
  if (risk <= 0 || reward <= 0) {
    return { rr: null, risk, reward, status: "N/A" as RrStatus };
  }
  const rr = Math.round((reward / risk) * 100) / 100;
  return { rr, risk, reward, status: rrStatus(rr) };
}

export type OpportunityTfRow = {
  timeframe: OpportunityTimeframe;
  trend: TrendLabel | "—";
  vwap: VwapStatus | "—";
  momentum: "Strong" | "Improving" | "Neutral" | "Weakening" | "Weak" | "—";
  structure: string;
};

export type OpportunityChartBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function sameUniverse(a: string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
}

export function isDefaultUniverse(tickers: string[]) {
  return sameUniverse(tickers, DEFAULT_OPPORTUNITY_UNIVERSE);
}

export function scoreBand(score: number | null): ScoreBand | "Insufficient Data" {
  if (score == null || Number.isNaN(score)) return "Insufficient Data";
  if (score >= 80) return "Strong Setup";
  if (score >= 65) return "Developing / Watch";
  if (score >= 50) return "Neutral / Developing";
  return "No Clear Setup";
}

export function parsePastedTickers(raw: string): string[] {
  return String(raw || "")
    .toUpperCase()
    .split(/[\s,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type UniverseParseResult = {
  tickers: string[];
  errors: string[];
};

export function parseOpportunityUniverse(raw: unknown): UniverseParseResult {
  const parts = Array.isArray(raw)
    ? raw.map((x) => String(x || "").toUpperCase().trim()).filter(Boolean)
    : parsePastedTickers(String(raw || ""));
  const errors: string[] = [];
  const tickers: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const parsed = parseCompareTicker(part, "Ticker");
    if ("error" in parsed) {
      errors.push(`Invalid or unsupported ticker: ${part}`);
      continue;
    }
    if (seen.has(parsed.symbol)) {
      errors.push(`Duplicate ticker detected: ${parsed.symbol}`);
      continue;
    }
    seen.add(parsed.symbol);
    tickers.push(parsed.symbol);
  }
  if (tickers.length > OPPORTUNITY_MAX_TICKERS) {
    errors.push(`Maximum ${OPPORTUNITY_MAX_TICKERS} tickers.`);
  }
  if (!tickers.length && !errors.length) {
    errors.push("Add at least one ticker to begin analysis.");
  }
  return { tickers: tickers.slice(0, OPPORTUNITY_MAX_TICKERS), errors };
}

export type OpportunityPrefs = {
  source: "default" | "custom";
  tickers: string[];
  settings: OpportunitySettings;
  events: { symbol: string; at: string; from: string; to: string; note: string }[];
};

export type OpportunityPayload = {
  universe: { source: "default" | "custom"; tickers: string[]; count: number; max: number };
  settings: OpportunitySettings;
  marketStatus: { state: "OPEN" | "CLOSED"; note: string };
  lastUpdated: string;
  dataStatus: "LIVE" | "STALE" | "UNAVAILABLE";
  regime: import("@/src/engines/opportunityEngine").MarketRegime;
  summary: {
    monitored: number;
    preBreakout: number;
    triggered: number;
    confirmed: number;
    retest: number;
    developing: number;
    noTrade: number;
    invalidated: number;
    insufficient: number;
    breakoutWatch?: number;
    technicalWatch?: number;
  };
  rows: import("@/src/engines/opportunityEngine").OpportunityRow[];
  alerts: { symbol: string; type: string; message: string }[];
};

export function mergeOpportunitySettings(raw?: Partial<OpportunitySettings> | null): OpportunitySettings {
  const base = { ...DEFAULT_OPPORTUNITY_SETTINGS, enabledAlerts: [...DEFAULT_OPPORTUNITY_SETTINGS.enabledAlerts] };
  if (!raw || typeof raw !== "object") return base;
  if (typeof raw.breakoutProximityPct === "number" && raw.breakoutProximityPct > 0) {
    base.breakoutProximityPct = Math.min(8, raw.breakoutProximityPct);
  }
  if (typeof raw.minRelVolume === "number" && raw.minRelVolume > 0) {
    base.minRelVolume = Math.min(5, raw.minRelVolume);
  }
  if (typeof raw.requireVwapSupport === "boolean") base.requireVwapSupport = raw.requireVwapSupport;
  if (raw.confirmTimeframe === "15m" || raw.confirmTimeframe === "30m") base.confirmTimeframe = raw.confirmTimeframe;
  if (typeof raw.minRR === "number" && raw.minRR > 0) base.minRR = Math.min(8, raw.minRR);
  if (typeof raw.rsiMax === "number") base.rsiMax = Math.min(90, Math.max(50, raw.rsiMax));
  if (typeof raw.rsiMin === "number") base.rsiMin = Math.min(50, Math.max(10, raw.rsiMin));
  if (typeof raw.adxThreshold === "number") base.adxThreshold = Math.min(40, Math.max(10, raw.adxThreshold));
  if (typeof raw.atrPeriod === "number") base.atrPeriod = Math.min(30, Math.max(7, Math.round(raw.atrPeriod)));
  if (typeof raw.newsLookbackHours === "number") base.newsLookbackHours = Math.min(168, Math.max(6, raw.newsLookbackHours));
  if (typeof raw.earningsWarnDays === "number") base.earningsWarnDays = Math.min(21, Math.max(1, Math.round(raw.earningsWarnDays)));
  if (typeof raw.overextensionPct === "number" && raw.overextensionPct > 0) base.overextensionPct = Math.min(12, raw.overextensionPct);
  if (typeof raw.minTechnicalScore === "number") base.minTechnicalScore = Math.min(90, Math.max(40, raw.minTechnicalScore));
  if (typeof raw.minResistanceTests === "number") base.minResistanceTests = Math.min(6, Math.max(1, Math.round(raw.minResistanceTests)));
  if (Array.isArray(raw.enabledAlerts)) {
    base.enabledAlerts = raw.enabledAlerts.filter((x): x is OpportunityAlertType =>
      DEFAULT_OPPORTUNITY_SETTINGS.enabledAlerts.includes(x as OpportunityAlertType),
    );
  }
  return base;
}
