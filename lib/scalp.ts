export const SCALP_TIMEFRAMES = ["5m", "15m", "30m"] as const;
export type ScalpTimeframe = (typeof SCALP_TIMEFRAMES)[number];
export type ScalpChartTimeframe = ScalpTimeframe | "1h" | "1d";

export type ScalpVerdict = "YES" | "NO" | "NEUTRAL" | "INSUFFICIENT_DATA";
export type ScalpDirection = "BULLISH" | "BEARISH" | "NEUTRAL";
export type ScalpOverall =
  | "CONFIRMED"
  | "SETUP_FORMING"
  | "WAIT"
  | "NO_TRADE"
  | "INSUFFICIENT_DATA";
export type ScalpTradeState =
  | "WATCH"
  | "SETUP_FORMING"
  | "TRIGGER_PENDING"
  | "BREAKOUT_PENDING"
  | "BREAKOUT_CONFIRMED"
  | "RETEST_PENDING"
  | "RETEST_CONFIRMED"
  | "ENTRY_CONFIRMED"
  | "FAILED"
  | "INVALIDATED"
  | "NO_TRADE"
  | "INSUFFICIENT_DATA";

export type ScalpCondition = {
  id: string;
  label: string;
  verdict: ScalpVerdict;
  direction: ScalpDirection;
  why: string;
  value?: string | number | null;
  timestamp?: string | null;
  forming?: boolean;
};

export type ScalpConfig = {
  breakout: {
    requireCandleClose: boolean;
    minimumBreakoutAtrMultiple: number;
    requireVolumeConfirmation: boolean;
    requireFollowThrough: boolean;
  };
  volume: { minimumRvol: number };
  retest: { maxDistanceAtr: number };
  risk: { minimumRr: number; atrStopBuffer: number };
  structure: { swingLeft: number; swingRight: number; minSeparation: number; atrSignificance: number };
};

export const DEFAULT_SCALP_CONFIG: ScalpConfig = {
  breakout: {
    requireCandleClose: true,
    minimumBreakoutAtrMultiple: 0.1,
    requireVolumeConfirmation: true,
    requireFollowThrough: true,
  },
  volume: { minimumRvol: 1.5 },
  retest: { maxDistanceAtr: 0.25 },
  risk: { minimumRr: 1.5, atrStopBuffer: 0.25 },
  structure: { swingLeft: 3, swingRight: 3, minSeparation: 3, atrSignificance: 0.15 },
};

export function isScalpTimeframe(value: string): value is ScalpTimeframe {
  return (SCALP_TIMEFRAMES as readonly string[]).includes(value);
}

export function condition(
  id: string,
  label: string,
  verdict: ScalpVerdict,
  direction: ScalpDirection,
  why: string,
  extra: Partial<ScalpCondition> = {},
): ScalpCondition {
  return { id, label, verdict, direction, why, ...extra };
}

export function insufficient(id: string, label: string, why: string): ScalpCondition {
  return condition(id, label, "INSUFFICIENT_DATA", "NEUTRAL", why);
}

export function boolVerdict(value: boolean | null | undefined): ScalpVerdict {
  if (value == null) return "INSUFFICIENT_DATA";
  return value ? "YES" : "NO";
}

export type ScalpLevel = {
  id: string;
  name: string;
  price: number | null;
  status: "BROKEN" | "INTACT" | "HOLDING" | "REJECTED" | "RECLAIMED" | "LOST" | "INSUFFICIENT_DATA";
  why: string;
};

export type ScalpBreakout = {
  timeframe: ScalpTimeframe;
  level: number | null;
  priceCrossed: ScalpCondition;
  closedBeyond: ScalpCondition;
  volume: ScalpCondition;
  followThrough: ScalpCondition;
  retest: ScalpCondition;
  status: "NO_BREAKOUT" | "BREAKOUT_FORMING" | "BREAKOUT_CONFIRMED" | "FAILED" | "FAKEOUT" | "INSUFFICIENT_DATA";
  why: string;
};

export type ScalpRetest = {
  timeframe: ScalpTimeframe;
  level: number | null;
  occurring: ScalpCondition;
  held: ScalpCondition;
  confirmed: ScalpCondition;
  status: "NONE" | "PENDING" | "CONFIRMED" | "FAILED" | "INSUFFICIENT_DATA";
  why: string;
};

export type ScalpTimeframeBlock = {
  timeframe: ScalpTimeframe;
  forming: boolean;
  lastCandleAt: string | null;
  structure: ScalpCondition;
  trend: ScalpCondition;
  vwap: ScalpCondition;
  volume: ScalpCondition;
  breakout: ScalpBreakout;
  retest: ScalpRetest;
  momentum: ScalpCondition;
};

export type ScalpAnalysis = {
  ticker: string;
  name: string;
  primaryTimeframe: ScalpTimeframe;
  timestamp: string;
  last_updated_est: string;
  data_status: "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";
  session: "OVERNIGHT" | "PREMARKET" | "REGULAR" | "AFTER_HOURS" | "CLOSED";
  market: "OPEN" | "CLOSED";
  quote: {
    price: number | null;
    change: number | null;
    change_percent: number | null;
    volume: number | null;
    average_volume: number | null;
  };
  snapshot: {
    rvol: number | null;
    vwap: number | null;
    atr: number | null;
    session: string;
    market: string;
  };
  marketContext: {
    spy: ScalpCondition;
    qqq: ScalpCondition;
    vix: ScalpCondition;
    sector: ScalpCondition;
    alignment: ScalpCondition;
  };
  timeframes: Record<ScalpTimeframe, ScalpTimeframeBlock>;
  vwap: {
    price: number | null;
    value: number | null;
    distance: number | null;
    distancePct: number | null;
    above: ScalpCondition;
    reclaim: ScalpCondition;
    hold: ScalpCondition;
    direction: ScalpDirection;
  };
  volume: {
    current: number | null;
    expected: number | null;
    rvol: number | null;
    confirmation: ScalpCondition;
    breakoutVolume: ScalpCondition;
    aboveNormal: ScalpCondition;
  };
  keyLevels: ScalpLevel[];
  momentum: {
    rsi: number | null;
    rsiDirection: ScalpDirection;
    macd: ScalpCondition;
    emaStack: ScalpCondition;
    confirmation: ScalpCondition;
  };
  relativeStrength: {
    vsSpy: ScalpCondition;
    vsQqq: ScalpCondition;
    vsSector: ScalpCondition;
  };
  liquidity: {
    currentVolume: number | null;
    averageVolume: number | null;
    dollarVolume: number | null;
    adequate: ScalpCondition;
    spread: ScalpCondition;
  };
  atr: { value: number | null; pct: number | null; moveOverAtr: number | null };
  riskReward: {
    entry: number | null;
    stop: number | null;
    stopBasis: string;
    t1: number | null;
    t2: number | null;
    t3: number | null;
    risk: number | null;
    reward: number | null;
    rr: number | null;
    validation: ScalpCondition;
  };
  catalyst: {
    present: ScalpCondition;
    type: string;
    direction: "Positive" | "Negative" | "Mixed" | "Unknown";
    items: { headline: string; source: string; age: string }[];
  };
  mtf: { rows: { metric: string; "5m": ScalpVerdict; "15m": ScalpVerdict; "30m": ScalpVerdict }[]; alignment: ScalpCondition };
  checklist: ScalpCondition[];
  overallState: ScalpOverall;
  tradeState: ScalpTradeState;
  evidenceScore: number | null;
  bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  barSets?: Partial<Record<ScalpChartTimeframe, { time: number; open: number; high: number; low: number; close: number; volume: number }[]>>;
  overlays: { ema9: number | null; ema20: number | null; ema50: number | null; vwap: number | null };
  markers: { time: number; label: string; price: number; why: string }[];
  disclaimer: string;
  source: string;
  extendedHours?: import("./extendedHours").TickerMarketContext | null;
};

export function scalpTfMinutes(tf: string) {
  if (tf === "5m") return 5;
  if (tf === "15m") return 15;
  if (tf === "30m") return 30;
  if (tf === "1h") return 60;
  return 1440;
}
