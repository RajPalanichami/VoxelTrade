import {
  emptySession,
  type ExtendedHoursLevels,
  type LevelState,
  type SessionAvailability,
  type SessionData,
  type TickerMarketContext,
} from "@/lib/extendedHours";
import {
  classifyMarketSession,
  inWindow,
  nyseEarlyCloseMinutes,
  sessionHasEnded,
  sessionHasStarted,
  sessionWindows,
  tradingDateEastern,
} from "@/src/engines/marketSessions";
import { formatEstClockSeconds, isoDateEastern } from "@/src/lib/easternTime";
import type { OHLCVBar } from "@/src/types/domain";

export type SessionBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function toSessionBars(bars: OHLCVBar[]): SessionBar[] {
  return bars
    .map((b) => ({
      time: Math.floor(new Date(b.timestamp).getTime() / 1000),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    .sort((a, b) => a.time - b.time);
}

export function previousRegularCloseFromDaily(daily: SessionBar[], tradingDate: string): number | null {
  const prior = daily.filter((b) => isoDateEastern(new Date(b.time * 1000)) < tradingDate);
  const last = prior[prior.length - 1];
  return last?.close ?? null;
}

function sessionAvailability(kind: SessionData["session"], barCount: number, providerFailed: boolean, now: Date): SessionAvailability {
  if (providerFailed) return "PROVIDER_UNAVAILABLE";
  if (barCount > 0) return "AVAILABLE";
  if (!sessionHasStarted(kind, now)) return "NOT_STARTED";
  if (sessionHasEnded(kind, now)) return "NO_TRADES";
  return "NO_TRADES";
}

export function summarizeSession(
  kind: SessionData["session"],
  bars: SessionBar[],
  window: { start: Date; end: Date },
  previousClose: number | null,
  now: Date,
  source: string,
  providerFailed = false,
): SessionData {
  const slice = bars.filter((b) => inWindow(new Date(b.time * 1000), window));
  const availability = sessionAvailability(kind, slice.length, providerFailed, now);
  if (availability !== "AVAILABLE") {
    return {
      ...emptySession(kind, availability),
      startTime: window.start.toISOString(),
      endTime: window.end.toISOString(),
      source,
    };
  }
  let pv = 0;
  let vol = 0;
  let high = -Infinity;
  let low = Infinity;
  let highAt = slice[0].time;
  let lowAt = slice[0].time;
  for (const b of slice) {
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume;
    vol += b.volume;
    if (b.high > high) {
      high = b.high;
      highAt = b.time;
    }
    if (b.low < low) {
      low = b.low;
      lowAt = b.time;
    }
  }
  const last = slice[slice.length - 1];
  const change = previousClose != null ? last.close - previousClose : null;
  return {
    session: kind,
    availability: "AVAILABLE",
    available: true,
    startTime: window.start.toISOString(),
    endTime: window.end.toISOString(),
    open: slice[0].open,
    high,
    low,
    close: last.close,
    last: last.close,
    change,
    changePercent: change != null && previousClose ? (change / previousClose) * 100 : null,
    volume: vol,
    highTimestamp: new Date(highAt * 1000).toISOString(),
    lowTimestamp: new Date(lowAt * 1000).toISOString(),
    vwap: vol > 0 ? pv / vol : null,
    barCount: slice.length,
    source,
    lastUpdated: new Date(last.time * 1000).toISOString(),
  };
}

export function classifyLevelState(
  id: string,
  name: string,
  level: number | null,
  today: SessionBar[],
  currentPrice: number | null,
): LevelState {
  if (level == null) {
    return {
      id,
      name,
      level: null,
      priceAboveLevel: null,
      crossedAbove: null,
      crossedBelow: null,
      brokenToday: null,
      reclaimedToday: null,
      retestOccurred: null,
      retestConfirmed: null,
      currentlyHolding: null,
      status: "INSUFFICIENT_DATA",
      why: `${name} is unavailable — the value was not invented.`,
    };
  }
  const last = currentPrice ?? today[today.length - 1]?.close ?? null;
  if (last == null && !today.length) {
    return {
      id,
      name,
      level,
      priceAboveLevel: null,
      crossedAbove: null,
      crossedBelow: null,
      brokenToday: null,
      reclaimedToday: null,
      retestOccurred: null,
      retestConfirmed: null,
      currentlyHolding: null,
      status: "NOT_TESTED",
      why: `${name} ${level.toFixed(2)} has not been tested yet.`,
    };
  }
  const priceAboveLevel = last != null ? last > level : null;
  const crossedAbove = today.some((b) => b.high > level && (b.open <= level || b.low <= level));
  const crossedBelow = today.some((b) => b.low < level && (b.open >= level || b.high >= level));
  const tradedBelow = today.some((b) => b.low < level);
  const tradedAbove = today.some((b) => b.high > level);
  const openedAbove = today[0] != null && today[0].open > level;
  const brokenToday = !openedAbove && crossedAbove;
  const reclaimedToday = tradedBelow && priceAboveLevel === true;
  const firstAbove = today.findIndex((b) => b.close > level);
  const retestOccurred = firstAbove >= 0 && today.slice(firstAbove + 1).some((b) => b.low <= level);
  const retestConfirmed = retestOccurred && priceAboveLevel === true && today[today.length - 1]?.close > level;
  const currentlyHolding = today[today.length - 1] != null && priceAboveLevel === true && Math.abs(today[today.length - 1].low - level) / level < 0.002;
  const lostToday = tradedAbove && priceAboveLevel === false;
  let status: LevelState["status"] = priceAboveLevel ? "ABOVE" : "BELOW";
  if (lostToday) status = "LOST";
  else if (retestConfirmed) status = "RETEST_CONFIRMED";
  else if (reclaimedToday) status = "RECLAIMED";
  else if (brokenToday && priceAboveLevel) status = "BROKEN";
  else if (!tradedAbove && !tradedBelow) status = priceAboveLevel ? "ABOVE" : "BELOW";
  return {
    id,
    name,
    level,
    priceAboveLevel,
    crossedAbove,
    crossedBelow,
    brokenToday,
    reclaimedToday,
    retestOccurred,
    retestConfirmed,
    currentlyHolding,
    status,
    why: `${name} ${level.toFixed(2)} · above ${priceAboveLevel ? "YES" : "NO"} · broken today ${brokenToday ? "YES" : "NO"} · reclaimed today ${reclaimedToday ? "YES" : "NO"}. Reclaimed is an event, not merely price above the level.`,
  };
}

export function buildExtendedHoursLevels(
  daily: SessionBar[],
  sessionBars: SessionBar[],
  sessions: TickerMarketContext["sessions"],
  currentPrice: number | null,
  tradingDate: string,
): ExtendedHoursLevels {
  const prior = daily.filter((b) => isoDateEastern(new Date(b.time * 1000)) < tradingDate);
  const pd = prior[prior.length - 1];
  const today = sessionBars.filter((b) => isoDateEastern(new Date(b.time * 1000)) === tradingDate || b.time * 1000 >= new Date(sessions.overnight.startTime || 0).getTime());
  const regular = today.filter((b) => {
    const iso = isoDateEastern(new Date(b.time * 1000));
    return iso === tradingDate;
  });
  const or = regular.filter((b) => {
    const mins = new Date(b.time * 1000);
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(mins));
    const m = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", minute: "2-digit" }).format(mins));
    return h * 60 + m >= 9 * 60 + 30 && h * 60 + m < 10 * 60;
  });
  const opening = regular[0]?.open ?? null;
  const orh = or.length ? Math.max(...or.map((b) => b.high)) : null;
  const orl = or.length ? Math.min(...or.map((b) => b.low)) : null;
  const sh = regular.length ? Math.max(...regular.map((b) => b.high)) : null;
  const sl = regular.length ? Math.min(...regular.map((b) => b.low)) : null;
  const level = (id: string, name: string, price: number | null) => classifyLevelState(id, name, price, today, currentPrice);
  return {
    previousDayHigh: level("pdh", "Previous Day High", pd?.high ?? null),
    previousDayLow: level("pdl", "Previous Day Low", pd?.low ?? null),
    previousClose: level("pdc", "Previous Close", pd?.close ?? null),
    overnightHigh: level("onh", "Overnight High", sessions.overnight.high ?? null),
    overnightLow: level("onl", "Overnight Low", sessions.overnight.low ?? null),
    premarketHigh: level("pmh", "Premarket High", sessions.preMarket.high ?? null),
    premarketLow: level("pml", "Premarket Low", sessions.preMarket.low ?? null),
    openingPrice: level("open", "Opening Price", opening),
    openingRangeHigh: level("orh", "Opening Range High", orh),
    openingRangeLow: level("orl", "Opening Range Low", orl),
    vwap: level("vwap", "Regular VWAP", sessions.regular.vwap ?? null),
    sessionHigh: level("sh", "Session High", sh),
    sessionLow: level("sl", "Session Low", sl),
  };
}

export function assembleTickerMarketContext(input: {
  symbol: string;
  name?: string;
  quotePrice: number | null;
  quoteVolume?: number | null;
  quoteAt?: Date;
  daily: SessionBar[];
  extendedBars: SessionBar[];
  source: string;
  providerFailed?: boolean;
  now?: Date;
}): TickerMarketContext {
  const now = input.now || new Date();
  const tradingDate = tradingDateEastern(now);
  const session = classifyMarketSession(now);
  const windows = sessionWindows(tradingDate, nyseEarlyCloseMinutes(now));
  const previousRegularClose = previousRegularCloseFromDaily(input.daily, tradingDate);
  const overnight = summarizeSession("OVERNIGHT", input.extendedBars, windows.overnight, previousRegularClose, now, input.source, input.providerFailed);
  const preMarket = summarizeSession("PRE_MARKET", input.extendedBars, windows.preMarket, previousRegularClose, now, input.source, input.providerFailed);
  const regular = summarizeSession("REGULAR", input.extendedBars, windows.regular, previousRegularClose, now, input.source, input.providerFailed);
  const afterHours = summarizeSession("AFTER_HOURS", input.extendedBars, windows.afterHours, previousRegularClose, now, input.source, input.providerFailed);
  const sessions = { overnight, preMarket, regular, afterHours };
  const price = input.quotePrice ?? regular.last ?? afterHours.last ?? preMarket.last ?? overnight.last ?? null;
  const change = price != null && previousRegularClose != null ? price - previousRegularClose : null;
  const levels = buildExtendedHoursLevels(input.daily, input.extendedBars, sessions, price, tradingDate);
  const quoteAt = input.quoteAt || now;
  const stale = (now.getTime() - quoteAt.getTime()) / 1000 > 120;
  const qualityStatus = input.providerFailed
    ? "PROVIDER_UNAVAILABLE"
    : stale
      ? "STALE"
      : overnight.availability === "AVAILABLE" || preMarket.availability === "AVAILABLE" || regular.availability === "AVAILABLE" || afterHours.availability === "AVAILABLE"
        ? "AVAILABLE"
        : preMarket.availability;
  return {
    symbol: input.symbol.toUpperCase(),
    name: input.name || input.symbol.toUpperCase(),
    tradingDate,
    session,
    quote: {
      price,
      previousRegularClose,
      change,
      changePercent: change != null && previousRegularClose ? (change / previousRegularClose) * 100 : null,
      volume: input.quoteVolume ?? null,
      session,
      source: input.source,
      timestamp: quoteAt.toISOString(),
      timestampEst: `${formatEstClockSeconds(quoteAt)} ET`,
    },
    previousRegularClose,
    sessions,
    levels,
    timestamps: {
      quote: quoteAt.toISOString(),
      overnight: overnight.lastUpdated,
      preMarket: preMarket.lastUpdated,
      regular: regular.lastUpdated,
      afterHours: afterHours.lastUpdated,
    },
    relationships: {
      abovePreviousHigh: levels.previousDayHigh.priceAboveLevel,
      abovePreviousClose: levels.previousClose.priceAboveLevel,
      abovePremarketLow: levels.premarketLow.priceAboveLevel,
      belowPremarketHigh: levels.premarketHigh.priceAboveLevel === null ? null : !levels.premarketHigh.priceAboveLevel,
      belowOvernightHigh: levels.overnightHigh.priceAboveLevel === null ? null : !levels.overnightHigh.priceAboveLevel,
    },
    volumes: {
      overnight: overnight.volume ?? null,
      preMarket: preMarket.volume ?? null,
      regular: regular.volume ?? null,
      afterHours: afterHours.volume ?? null,
      extendedTotal: [overnight.volume, preMarket.volume, afterHours.volume].reduce<number | null>((s, v) => (v == null ? s : (s || 0) + v), null),
    },
    dataQuality: {
      status: qualityStatus,
      source: input.source,
      lastUpdated: now.toISOString(),
      lastUpdatedEst: `${formatEstClockSeconds(now)} ET`,
      stale,
      note: input.providerFailed ? "Extended-hours bars were unavailable; regular-session fields still use the quote/daily feed." : undefined,
    },
    source: input.source,
  };
}
