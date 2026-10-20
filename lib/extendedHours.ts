export const MARKET_SESSIONS = ["OVERNIGHT", "PRE_MARKET", "REGULAR", "AFTER_HOURS", "CLOSED"] as const;
export type MarketSession = (typeof MARKET_SESSIONS)[number];

export type SessionAvailability =
  | "AVAILABLE"
  | "NO_TRADES"
  | "NOT_STARTED"
  | "SESSION_CLOSED"
  | "PROVIDER_UNAVAILABLE"
  | "STALE"
  | "INSUFFICIENT_DATA";

export type ExtendedHoursDataQuality = {
  status: SessionAvailability;
  source: string;
  lastUpdated: string;
  lastUpdatedEst: string;
  stale: boolean;
  note?: string;
};

export type SessionData = {
  session: Exclude<MarketSession, "CLOSED">;
  availability: SessionAvailability;
  available: boolean;
  startTime?: string | null;
  endTime?: string | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  last?: number | null;
  change?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  highTimestamp?: string | null;
  lowTimestamp?: string | null;
  vwap?: number | null;
  barCount?: number;
  source?: string | null;
  lastUpdated?: string | null;
};

export type LevelEventStatus =
  | "ABOVE"
  | "BELOW"
  | "BROKEN"
  | "RECLAIMED"
  | "RETEST_CONFIRMED"
  | "LOST"
  | "NOT_TESTED"
  | "INSUFFICIENT_DATA";

export type LevelState = {
  id: string;
  name: string;
  level: number | null;
  priceAboveLevel: boolean | null;
  crossedAbove: boolean | null;
  crossedBelow: boolean | null;
  brokenToday: boolean | null;
  reclaimedToday: boolean | null;
  retestOccurred: boolean | null;
  retestConfirmed: boolean | null;
  currentlyHolding: boolean | null;
  status: LevelEventStatus;
  why: string;
};

export type ExtendedHoursLevels = {
  previousDayHigh: LevelState;
  previousDayLow: LevelState;
  previousClose: LevelState;
  overnightHigh: LevelState;
  overnightLow: LevelState;
  premarketHigh: LevelState;
  premarketLow: LevelState;
  openingPrice: LevelState;
  openingRangeHigh: LevelState;
  openingRangeLow: LevelState;
  vwap: LevelState;
  sessionHigh: LevelState;
  sessionLow: LevelState;
};

export type TickerMarketContext = {
  symbol: string;
  name: string;
  tradingDate: string;
  session: MarketSession;
  quote: {
    price: number | null;
    previousRegularClose: number | null;
    change: number | null;
    changePercent: number | null;
    volume: number | null;
    session: MarketSession;
    source: string;
    timestamp: string;
    timestampEst: string;
  };
  previousRegularClose: number | null;
  sessions: {
    overnight: SessionData;
    preMarket: SessionData;
    regular: SessionData;
    afterHours: SessionData;
  };
  levels: ExtendedHoursLevels;
  timestamps: {
    quote: string;
    overnight?: string | null;
    preMarket?: string | null;
    regular?: string | null;
    afterHours?: string | null;
  };
  relationships: {
    abovePreviousHigh: boolean | null;
    abovePreviousClose: boolean | null;
    abovePremarketLow: boolean | null;
    belowPremarketHigh: boolean | null;
    belowOvernightHigh: boolean | null;
  };
  volumes: {
    overnight: number | null;
    preMarket: number | null;
    regular: number | null;
    afterHours: number | null;
    extendedTotal: number | null;
  };
  dataQuality: ExtendedHoursDataQuality;
  source: string;
};

export function formatMarketSession(session: MarketSession) {
  if (session === "PRE_MARKET") return "PREMARKET";
  if (session === "AFTER_HOURS") return "AFTER-HOURS";
  return session.replaceAll("_", " ");
}

export function emptySession(session: SessionData["session"], availability: SessionAvailability, note?: string): SessionData {
  return {
    session,
    availability,
    available: availability === "AVAILABLE",
    startTime: null,
    endTime: null,
    open: null,
    high: null,
    low: null,
    close: null,
    last: null,
    change: null,
    changePercent: null,
    volume: null,
    highTimestamp: null,
    lowTimestamp: null,
    vwap: null,
    barCount: 0,
    source: note || null,
    lastUpdated: null,
  };
}
