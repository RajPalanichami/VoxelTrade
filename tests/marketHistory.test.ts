import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheClear } from "@/src/lib/cache";
import {
  assembleMarketHistory,
  calendarWindow,
  cashSessionSettled,
  dailyChange,
  marketSignal,
  normalizeHistoryPoints,
  participationLabel,
  rollingPriorAverage,
  sessionDateFromTimestamp,
  sortMarketHistoryRows,
  type HistoryPoint,
} from "@/src/engines/marketHistory";
import type { OHLCVBar } from "@/src/types/domain";

const OPEN = new Date("2026-10-20T19:00:00.000Z");
const CLOSED = new Date("2026-10-20T20:30:00.000Z");

function weekdays(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function point(date: string, close: number, volume: number | null = null, timestamp?: string): HistoryPoint {
  return { date, close, volume, timestamp: timestamp ?? `${date}T13:30:00.000Z` };
}

function series(dates: string[], closeAt: (index: number) => number, volumeAt?: (index: number) => number | null) {
  return dates.map((date, index) => point(date, closeAt(index), volumeAt ? volumeAt(index) : null));
}

describe("market history calculations", () => {
  it("calculates signed changes and refuses a zero denominator", () => {
    expect(dailyChange(110, 100)).toMatchObject({ absolute: 10, percent: 10, direction: "up" });
    expect(dailyChange(90, 100)).toMatchObject({ absolute: -10, percent: -10, direction: "down" });
    expect(dailyChange(100.04, 100).direction).toBe("flat");
    expect(dailyChange(null, 100).direction).toBe("missing");
    expect(dailyChange(10, 0)).toEqual({ absolute: 10, percent: null, direction: "missing" });
    expect(dailyChange(100, null).percent).toBeNull();
  });

  it("uses a half-percent noise band for volume and keeps price direction separate", () => {
    expect(dailyChange(1_005_000, 1_000_000, 0.5).direction).toBe("up");
    expect(dailyChange(995_000, 1_000_000, 0.5).direction).toBe("down");
    expect(dailyChange(1_004_000, 1_000_000, 0.5).direction).toBe("flat");
    expect(participationLabel("up", "up")).toBe("Price advance with expanding participation");
    expect(participationLabel("up", "down")).toBe("Price advance with declining participation");
    expect(participationLabel("down", "up")).toBe("Price decline with expanding participation");
    expect(participationLabel("down", "down")).toBe("Price decline with declining participation");
    expect(participationLabel("flat", "up")).toBe("Increased trading activity without a meaningful price change");
    expect(participationLabel("flat", "down")).toBe("Reduced trading activity without a meaningful price change");
    expect(participationLabel("up", "missing")).toBe("Insufficient data for a complete interpretation");
    expect(marketSignal("up", "down", "up", "up").label).toBe("VIX ↑ | Brent ↓ | SPY ↑ / Volume ↑");
    expect(marketSignal("up", "down", "up", "up").category).toBe("SPY Price + Volume Rising");
    expect(marketSignal("missing", "missing", "missing", "missing").category).toBe("Insufficient Data");
  });

  it("averages the previous 20 volumes and excludes the current session", () => {
    const volumes = Array.from({ length: 25 }, (_, index) => (index + 1) * 1_000_000);
    expect(rollingPriorAverage(volumes, 19)).toBeNull();
    const average = rollingPriorAverage(volumes, 24);
    const expected = volumes.slice(4, 24).reduce((sum, value) => sum + value, 0) / 20;
    expect(average).toBe(expected);
    expect(average).not.toBe(volumes.slice(5).reduce((sum, value) => sum + value, 0) / 20);
    expect(volumes[24] / (average as number)).toBeGreaterThan(1);
  });

  it("drops invalid rows, keeps the later duplicate, and sorts out-of-order dates", () => {
    const now = CLOSED;
    const normalized = normalizeHistoryPoints(
      [
        point("2026-10-19", Number.NaN, 10),
        point("2026-10-16", 0, 10),
        point("2026-10-19", 20, 0, "2026-10-19T13:30:00.000Z"),
        point("2026-10-15", 10, 5, "2026-10-15T13:30:00.000Z"),
        point("2026-10-19", 22, 8, "2026-10-19T20:00:00.000Z"),
      ],
      now,
    );
    expect(normalized.settled.map((row) => [row.date, row.close, row.volume])).toEqual([
      ["2026-10-15", 10, 5],
      ["2026-10-19", 22, 8],
    ]);
  });

  it("maps Yahoo daily timestamps onto the New York session date", () => {
    expect(sessionDateFromTimestamp("2026-10-20T13:30:00.000Z")).toBe("2026-10-20");
    expect(sessionDateFromTimestamp("2026-10-20T07:00:00.000Z")).toBe("2026-10-20");
    expect(sessionDateFromTimestamp("2026-10-20T04:00:00.000Z")).toBe("2026-10-20");
    expect(sessionDateFromTimestamp("2026-10-20T03:30:00.000Z")).toBe("2026-10-19");
  });

  it("keeps an open session and a holiday out of the completed history", () => {
    expect(cashSessionSettled("2026-10-20", OPEN)).toBe(false);
    expect(cashSessionSettled("2026-10-19", OPEN)).toBe(true);
    expect(cashSessionSettled("2026-10-20", CLOSED)).toBe(true);
    expect(cashSessionSettled("2026-10-21", new Date("2026-10-21T06:00:00.000Z"))).toBe(false);
    expect(cashSessionSettled("2026-12-25", new Date("2026-12-25T19:00:00.000Z"))).toBe(false);
    const dates = weekdays("2026-08-03", "2026-10-20");
    const history = assembleMarketHistory({
      now: OPEN,
      vix: series(dates, (index) => 20 - index * 0.01),
      brent: series(dates.filter((date) => date !== "2026-10-16"), (index) => 70 + index * 0.1),
      spy: series(dates, (index) => 500 + index, (index) => (index + 1) * 1_000_000),
    });
    expect(history.pendingSession).toBe("2026-10-20");
    expect(history.rows.some((row) => row.date === "2026-10-20" || row.date === "2026-10-17" || row.date === "2026-10-18")).toBe(false);
    expect(history.window).toEqual(calendarWindow(OPEN));
    expect(history.rows[0].date).toBe("2026-10-19");
    const oldest = history.rows.at(-1);
    expect(oldest && oldest.date >= history.window.start).toBe(true);
    const gap = history.rows.find((row) => row.date === "2026-10-16");
    expect(gap?.brent.close).toBeNull();
    expect(gap?.brent.direction).toBe("missing");
    const nextBrent = history.rows.find((row) => row.date === "2026-10-19");
    const october15 = dates.filter((date) => date !== "2026-10-16").filter((date) => date <= "2026-10-15").length;
    expect(nextBrent?.brent.change).toBeCloseTo((70 + october15 * 0.1) - (70 + (october15 - 1) * 0.1), 6);
  });

  it("uses prior sessions outside the visible window for the 20-session average", () => {
    const dates = weekdays("2026-08-03", "2026-10-19");
    const volumes = dates.map((_, index) => (index + 1) * 1_000_000);
    const history = assembleMarketHistory({
      now: OPEN,
      vix: [],
      brent: [],
      spy: series(dates, (index) => 100 + index, (index) => volumes[index]),
    });
    const latest = history.rows[0];
    const average = volumes.slice(-21, -1).reduce((sum, value) => sum + value, 0) / 20;
    expect(latest.spy.averageVolume).toBe(average);
    expect(latest.spy.relativeVolume).toBeCloseTo(volumes[volumes.length - 1] / average, 8);
    expect(latest.spy.aboveAverage).toBe(true);
    expect(latest.vix.close).toBeNull();
    expect(latest.signal).toContain("SPY");
    expect(JSON.stringify(history)).not.toMatch(/api[_-]?key|secret|crumb/i);
  });

  it("sorts missing values last and preserves the newest date as a tie break", () => {
    const dates = weekdays("2026-10-01", "2026-10-19");
    const history = assembleMarketHistory({
      now: OPEN,
      vix: series(dates, (index) => 15 + (index % 3)),
      brent: series(dates, (index) => 80 + (index % 5)),
      spy: series(dates, (index) => 600 + index * 0.5, (index) => 2_000_000 + index * 10_000),
    });
    const byVolume = sortMarketHistoryRows(history.rows, "spyVolume", "desc");
    expect(byVolume[0].spy.volume).toBeGreaterThan(byVolume[1].spy.volume || 0);
    const withGap = history.rows.map((row, index) => (index === 2 ? { ...row, spy: { ...row.spy, volume: null } } : row));
    const sorted = sortMarketHistoryRows(withGap, "spyVolume", "desc");
    expect(sorted.at(-1)?.spy.volume).toBeNull();
  });
});

const bars = vi.fn();

vi.mock("@/src/services/analysis", () => ({
  analysis: {
    bars: (...args: unknown[]) => bars(...args),
  },
}));

describe("market history service", () => {
  beforeEach(() => {
    cacheClear();
    bars.mockReset();
  });

  it("keeps the other instruments when one provider fails and reuses the cache", async () => {
    const { buildMarketHistory } = await import("@/src/services/marketHistory");
    const dates = weekdays("2026-08-03", "2026-10-19");
    bars.mockImplementation(async (symbol: string) => {
      if (symbol === "^VIX") throw new Error("Unable to retrieve enough market data for the selected timeframe.");
      const rows = dates.map((date, index) => bar(symbol, date, 100 + index, symbol === "SPY" ? (index + 1) * 1_000_000 : 0));
      return [rows, "yfinance", 5];
    });
    const first = await buildMarketHistory(OPEN);
    const calls = bars.mock.calls.length;
    const second = await buildMarketHistory(OPEN);
    expect(bars.mock.calls.length).toBe(calls);
    expect(first).toEqual(second);
    expect(first.instruments.vix.error).toMatch(/enough market data/i);
    expect(first.instruments.brent.benchmark).toMatch(/futures/i);
    expect(first.instruments.brent.benchmark).toMatch(/not the EIA/i);
    expect(first.cards.spy.close).toBeGreaterThan(0);
    expect(first.cards.spy.volume).toBeGreaterThan(0);
    expect(first.rows.length).toBeGreaterThan(0);
    expect(first.instruments.spy.symbol).toBe("SPY");
    expect(JSON.stringify(first)).not.toMatch(/API_KEY|apikey|Bearer /);
  });
});

function bar(symbol: string, date: string, close: number, volume: number): OHLCVBar {
  return {
    symbol,
    timestamp: new Date(`${date}T13:30:00.000Z`),
    open: close,
    high: close,
    low: close,
    close,
    volume,
    timeframe: "1d",
    source: "yfinance",
  };
}
