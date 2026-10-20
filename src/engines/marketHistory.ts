import { classifyMarketSession, isNyseHoliday } from "@/src/engines/marketSessions";
import { easternDateParts, isoDateEastern, shiftEasternDate } from "@/src/lib/easternTime";

/** A move smaller than this, in percentage points, is treated as unchanged. */
export const PRICE_FLAT_PERCENT = 0.05;
/** A volume move smaller than this, in percentage points, is treated as unchanged. */
export const VOLUME_FLAT_PERCENT = 0.5;
export const AVERAGE_SESSIONS = 20;
export const CALENDAR_DAYS = 30;
export const STALE_AFTER_DAYS = 5;

export type Direction = "up" | "down" | "flat" | "missing";
export type HistoryInstrument = "vix" | "brent" | "spy";

export type HistoryPoint = {
  date: string;
  close: number;
  volume: number | null;
  timestamp: string;
};

export type DailyChange = {
  absolute: number | null;
  percent: number | null;
  direction: Direction;
};

export type InstrumentCell = {
  close: number | null;
  change: number | null;
  changePercent: number | null;
  direction: Direction;
};

export type SpyCell = InstrumentCell & {
  volume: number | null;
  averageVolume: number | null;
  volumeChangePercent: number | null;
  volumeDirection: Direction;
  relativeVolume: number | null;
  aboveAverage: boolean | null;
};

export type MarketHistoryRow = {
  date: string;
  vix: InstrumentCell;
  brent: InstrumentCell;
  spy: SpyCell;
  participation: string;
  signal: string;
  category: string;
  signalDetail: string;
};

export type InstrumentSummary = InstrumentCell & {
  date: string | null;
  previous: number | null;
  timestamp: string | null;
};

export type SpySummary = SpyCell & {
  date: string | null;
  previous: number | null;
  timestamp: string | null;
};

export type MarketHistorySortKey =
  | "date"
  | "vixChange"
  | "brentChange"
  | "spyChange"
  | "spyVolume"
  | "averageVolume"
  | "relativeVolume";

export type MarketHistoryPayload = {
  timezone: "America/New_York";
  window: { start: string; end: string; calendarDays: number };
  generatedAt: string;
  stale: boolean;
  pendingSession: string | null;
  rules: {
    change: string;
    averageVolume: string;
    priceFlatPercent: number;
    volumeFlatPercent: number;
    session: string;
  };
  instruments: Record<
    HistoryInstrument,
    {
      symbol: string;
      name: string;
      benchmark: string;
      currency: string;
      source: string | null;
      error: string | null;
    }
  >;
  cards: { vix: InstrumentSummary; brent: InstrumentSummary; spy: SpySummary };
  rows: MarketHistoryRow[];
};

export const INSTRUMENT_META: Record<
  HistoryInstrument,
  { symbol: string; name: string; benchmark: string; currency: string }
> = {
  vix: {
    symbol: "^VIX",
    name: "CBOE Volatility Index",
    benchmark: "CBOE Volatility Index daily close via Yahoo Finance (^VIX). This is a delayed vendor print, not a direct CBOE feed.",
    currency: "index points",
  },
  brent: {
    symbol: "BZ=F",
    name: "Brent Crude Oil",
    benchmark:
      "ICE Brent crude oil last-day financial futures, continuous front month (Yahoo BZ=F), in US dollars per barrel. This is not the EIA Europe Brent spot price.",
    currency: "USD per barrel",
  },
  spy: {
    symbol: "SPY",
    name: "State Street SPDR S&P 500 ETF Trust",
    benchmark:
      "Unadjusted daily close and actual share volume from Yahoo Finance (chart close and volume, not the adjusted close).",
    currency: "USD",
  },
};

export const SIGNAL_HELP: Record<string, string> = {
  "VIX Rising": "The VIX close was higher than the previous VIX observation. That usually means higher expected near-term S&P 500 volatility. It does not mean stock prices must fall.",
  "VIX Falling": "The VIX close was lower than the previous VIX observation. That usually means lower expected near-term S&P 500 volatility. It is not a buy signal.",
  "Brent Rising": "The Brent futures price was higher than the previous Brent observation. This is the futures benchmark, not a stock-market forecast.",
  "Brent Falling": "The Brent futures price was lower than the previous Brent observation. This is the futures benchmark, not a stock-market forecast.",
  "SPY Price + Volume Rising": "SPY closed higher and more shares traded than in the previous SPY session. Higher volume is more participation, not proof of buying pressure.",
  "SPY Price Rising, Volume Falling": "SPY closed higher on fewer shares than the previous SPY session. Rising price and falling volume are separate facts.",
  "SPY Price Falling, Volume Rising": "SPY closed lower and more shares traded than in the previous SPY session. Higher volume is more participation, not proof of selling pressure.",
  "SPY Price Falling, Volume Falling": "SPY closed lower on fewer shares than the previous SPY session.",
  "SPY Below Average Volume": "SPY share volume was below its prior 20 completed sessions. That describes activity, not direction.",
  "Mixed Market Signals": "VIX, Brent, and SPY did not move as one story. The label lists the observed directions and is not a forecast.",
  "Insufficient Data": "At least one required observation is missing, so no combined reading is shown.",
};

const RULES: MarketHistoryPayload["rules"] = {
  change: "Change is the current observation minus that instrument's previous valid observation. Percentage change divides by the previous observation. A missing previous value, or a previous value of zero, does not produce a percentage.",
  averageVolume: `SPY average volume is the mean of the previous ${AVERAGE_SESSIONS} completed sessions that have a positive share volume. The session on the row is excluded, and sessions outside the displayed 30 calendar days are included when needed.`,
  priceFlatPercent: PRICE_FLAT_PERCENT,
  volumeFlatPercent: VOLUME_FLAT_PERCENT,
  session: "A daily bar dated today is included only after the NYSE regular session has ended on a trading day. Until then the table keeps the last completed session and does not treat the intraday last price or partial volume as the close.",
};

export function sessionDateFromTimestamp(timestamp: string | Date): string | null {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return isoDateEastern(date);
}

export function calendarWindow(now: Date, days = CALENDAR_DAYS) {
  const end = isoDateEastern(now);
  const parts = easternDateParts(now);
  const start = shiftEasternDate(parts.year, parts.month, parts.day, -(days - 1));
  return {
    start: isoFromParts(start.year, start.month, start.day),
    end,
    calendarDays: days,
  };
}

export function cashSessionSettled(sessionDate: string, now: Date): boolean {
  const today = isoDateEastern(now);
  if (sessionDate < today) return true;
  if (sessionDate !== today) return false;
  const parts = easternDateParts(now);
  if (parts.weekday === 0 || parts.weekday === 6 || isNyseHoliday(now)) return false;
  const session = classifyMarketSession(now);
  if (session === "AFTER_HOURS") return true;
  if (session === "OVERNIGHT") return parts.hour * 60 + parts.minute >= 16 * 60;
  return false;
}

export function dailyChange(current: number | null, previous: number | null, flatPercent = PRICE_FLAT_PERCENT): DailyChange {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { absolute: null, percent: null, direction: "missing" };
  }
  const absolute = current - previous;
  if (previous === 0) return { absolute, percent: null, direction: "missing" };
  const percent = (absolute / previous) * 100;
  const direction: Direction = Math.abs(percent) < flatPercent ? "flat" : percent > 0 ? "up" : "down";
  return { absolute, percent, direction };
}

export function rollingPriorAverage(volumes: (number | null)[], index: number, window = AVERAGE_SESSIONS): number | null {
  if (index <= 0) return null;
  const prior: number[] = [];
  for (let i = index - 1; i >= 0 && prior.length < window; i--) {
    const volume = volumes[i];
    if (volume != null && Number.isFinite(volume) && volume > 0) prior.push(volume);
  }
  if (prior.length < window) return null;
  return prior.reduce((sum, value) => sum + value, 0) / window;
}

export function participationLabel(price: Direction, volume: Direction): string {
  if (price === "missing" || volume === "missing") return "Insufficient data for a complete interpretation";
  if (price === "up" && volume === "up") return "Price advance with expanding participation";
  if (price === "up" && volume === "down") return "Price advance with declining participation";
  if (price === "down" && volume === "up") return "Price decline with expanding participation";
  if (price === "down" && volume === "down") return "Price decline with declining participation";
  if (price === "flat" && volume === "up") return "Increased trading activity without a meaningful price change";
  if (price === "flat" && volume === "down") return "Reduced trading activity without a meaningful price change";
  if (price === "up" && volume === "flat") return "Price advance with little change in volume";
  if (price === "down" && volume === "flat") return "Price decline with little change in volume";
  return "Price and volume were little changed";
}

export function marketSignal(vix: Direction, brent: Direction, spy: Direction, volume: Direction): { label: string; category: string } {
  const bits: string[] = [];
  const vixMark = directionMark(vix);
  const brentMark = directionMark(brent);
  const spyMark = directionMark(spy);
  const volumeMark = directionMark(volume);
  if (vixMark) bits.push(`VIX ${vixMark}`);
  if (brentMark) bits.push(`Brent ${brentMark}`);
  if (spyMark && volumeMark) bits.push(`SPY ${spyMark} / Volume ${volumeMark}`);
  else if (spyMark) bits.push(`SPY ${spyMark}`);
  else if (volumeMark) bits.push(`Volume ${volumeMark}`);
  if (!bits.length) return { label: "Insufficient Data", category: "Insufficient Data" };

  let category = "Mixed Market Signals";
  if (spy === "up" && volume === "up") category = "SPY Price + Volume Rising";
  else if (spy === "up" && volume === "down") category = "SPY Price Rising, Volume Falling";
  else if (spy === "down" && volume === "up") category = "SPY Price Falling, Volume Rising";
  else if (spy === "down" && volume === "down") category = "SPY Price Falling, Volume Falling";
  else if (spy === "missing" && volume === "missing") {
    if (vix === "up" && brent !== "down" && brent !== "up") category = "VIX Rising";
    else if (vix === "down" && brent !== "down" && brent !== "up") category = "VIX Falling";
    else if (brent === "up" && vix !== "down" && vix !== "up") category = "Brent Rising";
    else if (brent === "down" && vix !== "down" && vix !== "up") category = "Brent Falling";
    else if (vix === "up" && brent !== "down") category = "VIX Rising";
    else if (vix === "down" && brent !== "up") category = "VIX Falling";
    else if (brent === "up") category = "Brent Rising";
    else if (brent === "down") category = "Brent Falling";
  }
  return { label: bits.join(" | "), category };
}

export function normalizeHistoryPoints(points: HistoryPoint[], now: Date): { settled: HistoryPoint[]; pendingDates: string[] } {
  const byDate = new Map<string, HistoryPoint>();
  const pending = new Set<string>();
  for (const raw of points) {
    if (!raw?.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) continue;
    if (!Number.isFinite(raw.close) || raw.close <= 0) continue;
    const point: HistoryPoint = {
      date: raw.date,
      close: raw.close,
      volume: raw.volume != null && Number.isFinite(raw.volume) && raw.volume > 0 ? raw.volume : null,
      timestamp: raw.timestamp,
    };
    if (!cashSessionSettled(point.date, now)) {
      pending.add(point.date);
      continue;
    }
    const existing = byDate.get(point.date);
    if (!existing || Date.parse(point.timestamp || "") >= Date.parse(existing.timestamp || "")) byDate.set(point.date, point);
  }
  return {
    settled: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    pendingDates: [...pending].sort(),
  };
}

export function sortMarketHistoryRows(rows: MarketHistoryRow[], key: MarketHistorySortKey, direction: "asc" | "desc"): MarketHistoryRow[] {
  const factor = direction === "asc" ? 1 : -1;
  const value = (row: MarketHistoryRow) => {
    if (key === "date") return Date.parse(`${row.date}T00:00:00Z`);
    if (key === "vixChange") return row.vix.change;
    if (key === "brentChange") return row.brent.change;
    if (key === "spyChange") return row.spy.change;
    if (key === "spyVolume") return row.spy.volume;
    if (key === "averageVolume") return row.spy.averageVolume;
    return row.spy.relativeVolume;
  };
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left == null && right == null) return b.date.localeCompare(a.date);
    if (left == null) return 1;
    if (right == null) return -1;
    if (left === right) return b.date.localeCompare(a.date);
    return (left - right) * factor;
  });
}

export function assembleMarketHistory(input: {
  vix: HistoryPoint[];
  brent: HistoryPoint[];
  spy: HistoryPoint[];
  now?: Date;
  errors?: Partial<Record<HistoryInstrument, string | null>>;
  sources?: Partial<Record<HistoryInstrument, string | null>>;
}): MarketHistoryPayload {
  const now = input.now ?? new Date();
  const window = calendarWindow(now);
  const vixNorm = normalizeHistoryPoints(input.vix, now);
  const brentNorm = normalizeHistoryPoints(input.brent, now);
  const spyNorm = normalizeHistoryPoints(input.spy, now);
  const vixMap = indexSeries(vixNorm.settled, false);
  const brentMap = indexSeries(brentNorm.settled, false);
  const spyMap = indexSeries(spyNorm.settled, true);
  const dates = [...new Set([...vixMap.keys(), ...brentMap.keys(), ...spyMap.keys()])]
    .filter((date) => date >= window.start && date <= window.end)
    .sort((a, b) => (a < b ? 1 : -1));
  const pending = [...new Set([...vixNorm.pendingDates, ...brentNorm.pendingDates, ...spyNorm.pendingDates])].sort();
  const rows = dates.map((date) => rowFor(date, vixMap.get(date), brentMap.get(date), spyMap.get(date)));
  const latest = [vixNorm.settled.at(-1)?.date, brentNorm.settled.at(-1)?.date, spyNorm.settled.at(-1)?.date]
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  return {
    timezone: "America/New_York",
    window,
    generatedAt: now.toISOString(),
    stale: latest != null && calendarDaysBetween(latest, window.end) > STALE_AFTER_DAYS,
    pendingSession: pending.at(-1) ?? null,
    rules: RULES,
    instruments: {
      vix: { ...INSTRUMENT_META.vix, source: input.sources?.vix ?? null, error: input.errors?.vix ?? null },
      brent: { ...INSTRUMENT_META.brent, source: input.sources?.brent ?? null, error: input.errors?.brent ?? null },
      spy: { ...INSTRUMENT_META.spy, source: input.sources?.spy ?? null, error: input.errors?.spy ?? null },
    },
    cards: {
      vix: summaryFrom(vixNorm.settled, false),
      brent: summaryFrom(brentNorm.settled, false),
      spy: summaryFrom(spyNorm.settled, true),
    },
    rows,
  };
}

function rowFor(
  date: string,
  vix: IndexedPoint | undefined,
  brent: IndexedPoint | undefined,
  spy: IndexedPoint | undefined,
): MarketHistoryRow {
  const vixCell = cell(vix);
  const brentCell = cell(brent);
  const spyCell = spyCellFrom(spy);
  const reading = marketSignal(vixCell.direction, brentCell.direction, spyCell.direction, spyCell.volumeDirection);
  const below = spyCell.aboveAverage === false;
  const category = below && reading.category === "Mixed Market Signals" && spyCell.direction === "flat" ? "SPY Below Average Volume" : reading.category;
  const volumeNote =
    spyCell.relativeVolume == null
      ? ""
      : spyCell.relativeVolume > 1
        ? " Volume is above the prior 20-session average."
        : spyCell.relativeVolume < 1
          ? " Volume is below the prior 20-session average."
          : " Volume matches the prior 20-session average.";
  return {
    date,
    vix: vixCell,
    brent: brentCell,
    spy: spyCell,
    participation: participationLabel(spyCell.direction, spyCell.volumeDirection),
    signal: reading.label,
    category,
    signalDetail: `${SIGNAL_HELP[category] || SIGNAL_HELP["Mixed Market Signals"]} ${participationLabel(spyCell.direction, spyCell.volumeDirection)}.${volumeNote}`,
  };
}

type IndexedPoint = HistoryPoint & DailyChange & {
  volumeChange: DailyChange;
  averageVolume: number | null;
  relativeVolume: number | null;
};

function indexSeries(series: HistoryPoint[], withVolume: boolean) {
  const volumes = series.map((point) => point.volume);
  const map = new Map<string, IndexedPoint>();
  series.forEach((point, index) => {
    const previous = index > 0 ? series[index - 1] : null;
    const price = dailyChange(point.close, previous?.close ?? null, PRICE_FLAT_PERCENT);
    const volumeChange = withVolume ? dailyChange(point.volume, previous?.volume ?? null, VOLUME_FLAT_PERCENT) : { absolute: null, percent: null, direction: "missing" as Direction };
    const averageVolume = withVolume ? rollingPriorAverage(volumes, index) : null;
    const relativeVolume = point.volume != null && averageVolume != null && averageVolume > 0 ? point.volume / averageVolume : null;
    map.set(point.date, { ...point, ...price, volumeChange, averageVolume, relativeVolume });
  });
  return map;
}

function cell(point: IndexedPoint | undefined): InstrumentCell {
  if (!point) return { close: null, change: null, changePercent: null, direction: "missing" };
  return { close: point.close, change: point.absolute, changePercent: point.percent, direction: point.direction };
}

function spyCellFrom(point: IndexedPoint | undefined): SpyCell {
  if (!point) {
    return {
      close: null,
      change: null,
      changePercent: null,
      direction: "missing",
      volume: null,
      averageVolume: null,
      volumeChangePercent: null,
      volumeDirection: "missing",
      relativeVolume: null,
      aboveAverage: null,
    };
  }
  return {
    close: point.close,
    change: point.absolute,
    changePercent: point.percent,
    direction: point.direction,
    volume: point.volume,
    averageVolume: point.averageVolume,
    volumeChangePercent: point.volumeChange.percent,
    volumeDirection: point.volumeChange.direction,
    relativeVolume: point.relativeVolume,
    aboveAverage: point.relativeVolume == null ? null : point.relativeVolume > 1 ? true : point.relativeVolume < 1 ? false : null,
  };
}

function summaryFrom(series: HistoryPoint[], withVolume: boolean): SpySummary {
  const indexed = indexSeries(series, withVolume);
  const last = series.at(-1);
  const previous = series.length > 1 ? series[series.length - 2] : null;
  const point = last ? indexed.get(last.date) : undefined;
  const spy = spyCellFrom(point);
  return { ...spy, date: last?.date ?? null, previous: previous?.close ?? null, timestamp: last?.timestamp ?? null };
}

function directionMark(direction: Direction) {
  if (direction === "up") return "↑";
  if (direction === "down") return "↓";
  if (direction === "flat") return "→";
  return null;
}

function isoFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function calendarDaysBetween(start: string, end: string) {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}
