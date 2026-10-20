import { describe, expect, it } from "vitest";
import {
  analyzeChart,
  chartCacheKey,
  clusterLevels,
  confirmedSwings,
  crossoverAt,
  decisionFromFacts,
  detectGaps,
  emaSeries,
  fibonacciSet,
  hypotheticalRiskReward,
  leverageProfile,
  missingIntervalCount,
  normalizeChartTimeframe,
  normalizeRawBars,
  volumeRead,
  type ChartCandle,
} from "@/src/engines/technicalChart";

const DAY = 86_400;

function bar(index: number, open: number, high: number, low: number, close: number, volume: number | null = 1_000): ChartCandle {
  return { time: 1_700_000_000 + index * DAY, open, high, low, close, volume };
}

function trend(count: number, start: number, step: number, volume = 1_000): ChartCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = start + index * step;
    return bar(index, close - step / 2, close + Math.abs(step), close - Math.abs(step), close, volume);
  });
}

describe("technical chart candles", () => {
  it("drops invalid candles, sorts time, and keeps the last duplicate", () => {
    const { candles, dropped } = normalizeRawBars([
      { time: 30, open: 10, high: 11, low: 9, close: 10.5, volume: 1 },
      { timestamp: "2024-01-02T00:00:00.000Z", open: 10, high: 9, low: 8, close: 8.5, volume: 1 },
      { time: 10, open: 0, high: 1, low: 1, close: 1, volume: 1 },
      { time: 10, open: 5, high: 6, low: 4, close: 5.5, volume: 2 },
      { time: 20, open: 6, high: 7, low: 5, close: 6.5, volume: null },
    ]);
    expect(dropped).toBe(2);
    expect(candles.map((candle) => candle.time)).toEqual([10, 20, 30]);
    expect(candles[0].volume).toBe(2);
    expect(candles[1].volume).toBeNull();
  });

  it("counts missing intervals without filling them", () => {
    const candles = [bar(0, 10, 11, 9, 10), bar(1, 10, 11, 9, 10), bar(4, 10, 11, 9, 10)];
    expect(missingIntervalCount(candles, DAY)).toBe(2);
    expect(candles).toHaveLength(3);
  });

  it("rejects unsupported chart timeframes and keeps provider timeframes", () => {
    expect(normalizeChartTimeframe("1D")).toBe("1d");
    expect(normalizeChartTimeframe("15m")).toBe("15m");
    expect(() => normalizeChartTimeframe("1m")).toThrow(/not available/);
    expect(() => normalizeChartTimeframe("1M")).toThrow(/not available/);
  });

  it("does not reuse another ticker in the cache key", () => {
    expect(chartCacheKey("soxl", "1d", "ema")).not.toBe(chartCacheKey("soxs", "1d", "ema"));
    expect(chartCacheKey("AAPL", "1d", "ema")).not.toBe(chartCacheKey("AAPL", "1h", "ema"));
  });
});

describe("EMA", () => {
  it("seeds with the first close and hides values during warm-up", () => {
    const series = emaSeries([10, 12, 14, 16], 3);
    expect(series[0]).toBeNull();
    expect(series[1]).toBeNull();
    expect(series[2]).toBeCloseTo(12.5);
    expect(series[3]).toBeCloseTo(14.25);
  });

  it("detects a completed-candle crossover and ignores a later null", () => {
    const fast = [null, 1, 2];
    const slow = [null, 2, 1];
    expect(crossoverAt(fast, slow, 2)).toBe("bullish");
    expect(crossoverAt([1], [1], 0)).toBe("insufficient");
  });
});

describe("Fibonacci", () => {
  it("retraces an upward swing from the high", () => {
    const fib = fibonacciSet({ time: 200, price: 100 }, { time: 100, price: 80 });
    expect(fib?.direction).toBe("up");
    expect(fib?.levels.find((level) => level.label === "0%")?.price).toBeCloseTo(100);
    expect(fib?.levels.find((level) => level.label === "23.6%")?.price).toBeCloseTo(95.28);
    expect(fib?.levels.find((level) => level.label === "100%")?.price).toBeCloseTo(80);
  });

  it("retraces a downward swing from the low back toward the high", () => {
    const fib = fibonacciSet({ time: 100, price: 100 }, { time: 200, price: 80 });
    expect(fib?.direction).toBe("down");
    expect(fib?.levels.find((level) => level.label === "0%")?.price).toBeCloseTo(80);
    expect(fib?.levels.find((level) => level.label === "23.6%")?.price).toBeCloseTo(84.72);
    expect(fib?.levels.find((level) => level.label === "100%")?.price).toBeCloseTo(100);
  });
});

describe("swings and support", () => {
  it("confirms a swing only after the right-side bars exist and clusters nearby highs", () => {
    const candles = Array.from({ length: 30 }, (_, index) => bar(index, 10, 11, 9, 10));
    candles[10] = bar(10, 10, 20, 9, 10);
    candles[18] = bar(18, 10, 20.2, 9, 10);
    candles[8] = bar(8, 10, 11, 5, 10);
    const swings = confirmedSwings(candles);
    expect(swings.some((point) => point.kind === "high" && point.price === 20)).toBe(true);
    expect(confirmedSwings(candles.slice(0, 12)).some((point) => point.index === 10)).toBe(false);
    const zones = clusterLevels(candles, swings, "1h", 10);
    const resistance = zones.find((zone) => zone.kind === "resistance" && zone.high >= 20);
    expect(resistance?.reactions).toBeGreaterThanOrEqual(2);
    expect(resistance?.established).toBe(true);
    expect(resistance?.sources).toContain("Confirmed swing high");
  });
});

describe("gaps, volume, and decisions", () => {
  it("opens an upward daily gap and marks it filled when price trades back through", () => {
    const candles = [
      bar(0, 9, 10, 8, 9.5),
      bar(1, 12, 13, 12, 12.5),
      bar(2, 12, 12.4, 9.5, 11),
    ];
    const gaps = detectGaps(candles, "1d", true);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].direction).toBe("up");
    expect(gaps[0].low).toBe(10);
    expect(gaps[0].high).toBe(12);
    expect(gaps[0].filled).toBe(true);
    expect(detectGaps(candles, "5m", true)).toEqual([]);
    expect(detectGaps(candles, "1d", false)).toEqual([]);
  });

  it("compares relative volume with completed candles only", () => {
    const candles = Array.from({ length: 6 }, (_, index) => bar(index, 10, 11, 9, 10, index === 4 ? 200 : 100));
    const read = volumeRead(candles, true, 3);
    expect(read.provisionalExcluded).toBe(true);
    expect(read.lastCompleted).toBe(200);
    expect(read.relative).toBeCloseTo(2);
  });

  it("returns each decision state from explicit facts", () => {
    const base = {
      completedBars: 40,
      price: 50,
      ema21: 40,
      ema50: 35,
      structure: "up" as const,
      resistanceHigh: null,
      resistanceLow: null,
      supportHigh: null,
      supportLow: null,
      lastClose: 50,
      relativeVolume: 1.2,
    };
    expect(decisionFromFacts({ ...base, completedBars: 10 }).status).toBe("INSUFFICIENT DATA");
    expect(decisionFromFacts({ ...base, resistanceLow: 48, resistanceHigh: 49, lastClose: 51 }).status).toBe("BULLISH BREAKOUT CONFIRMED");
    expect(decisionFromFacts({ ...base, resistanceLow: 48, resistanceHigh: 49, lastClose: 51, relativeVolume: 0.4 }).status).toBe(
      "BREAKOUT CONFIRMATION PENDING",
    );
    expect(decisionFromFacts({ ...base, supportLow: 40, supportHigh: 42, lastClose: 39 }).status).toBe("BEARISH BREAKDOWN CONFIRMED");
    expect(decisionFromFacts({ ...base, supportLow: 40, supportHigh: 42, lastClose: 41 }).status).toBe("BREAKDOWN CONFIRMATION PENDING");
    expect(decisionFromFacts(base).status).toBe("BULLISH SETUP DEVELOPING");
    expect(decisionFromFacts({ ...base, price: 20, ema21: 40, ema50: 45, structure: "down" }).status).toBe("BEARISH SETUP DEVELOPING");
    expect(decisionFromFacts({ ...base, structure: "mixed" }).status).toBe("RANGE / WAIT");
  });

  it("labels leveraged and inverse funds from the instrument name only", () => {
    expect(leverageProfile("Direxion Daily Semiconductor Bull 3X Shares")?.leveraged).toBe(true);
    expect(leverageProfile("ProShares UltraPro Short QQQ")?.inverse).toBe(true);
    expect(leverageProfile("SPDR S&P 500 ETF Trust")).toBeNull();
    expect(leverageProfile("Direxion Daily Semiconductor Bu")).toBeNull();
    expect(leverageProfile("Direxion Daily Semiconductor Bu Direxion Daily Semiconductor Bull 3X Shares")?.multiple).toBe("3");
  });

  it("calculates a hypothetical plan only from entered prices", () => {
    expect(hypotheticalRiskReward(100, null, 110)).toBeNull();
    expect(hypotheticalRiskReward(100, 95, 110)?.ratio).toBeCloseTo(2);
  });
});

describe("analyzeChart", () => {
  it("builds a rising series without borrowing another symbol's prices", () => {
    const candles = trend(80, 100, 1, 1_000);
    const analysis = analyzeChart(candles, { timeframe: "1d", nowSec: candles[candles.length - 1].time + DAY * 3, gapEligible: true });
    expect(analysis.dropped).toBe(0);
    expect(analysis.emas.find((item) => item.period === 9)?.value).toBeTypeOf("number");
    expect(analysis.emas.find((item) => item.period === 325)?.value).toBeNull();
    expect(analysis.summary.structure[0]).toContain("179.00");
    expect(analysis.summary.bullish === "Insufficient data" || analysis.summary.bullish.includes("closes above")).toBe(true);
    expect(JSON.stringify(analysis)).not.toContain("SOXL");
  });

  it("confirms a descending trendline break only on a completed close", () => {
    const candles = Array.from({ length: 36 }, (_, index) => bar(index, 100, 101, 99, 100));
    candles[10] = bar(10, 100, 120, 99, 100);
    candles[20] = bar(20, 100, 110, 99, 100);
    for (const index of [28, 29, 30, 31, 32]) candles[index] = bar(index, 120, 131, 99, 130);
    const confirmed = analyzeChart(candles, { timeframe: "1d", nowSec: candles[35].time + DAY * 3, gapEligible: false });
    expect(confirmed.trendlines.some((line) => line.kind === "descending" && line.status === "BREAKOUT_CONFIRMED")).toBe(true);
    const formingCandles = Array.from({ length: 31 }, (_, index) => bar(index, 100, 101, 99, 100));
    formingCandles[10] = bar(10, 100, 120, 99, 100);
    formingCandles[20] = bar(20, 100, 110, 99, 100);
    formingCandles[30] = bar(30, 120, 131, 99, 130);
    const forming = analyzeChart(formingCandles, { timeframe: "1d", nowSec: formingCandles[30].time + 10, gapEligible: false });
    expect(forming.provisional).toBe(true);
    expect(forming.trendlines.some((line) => line.kind === "descending" && line.status === "BREAKOUT_PENDING")).toBe(true);
    expect(forming.trendlines.some((line) => line.status === "BREAKOUT_CONFIRMED")).toBe(false);
  });

  it("does not confirm a breakout from the forming candle alone", () => {
    const candles = trend(40, 50, 0.1);
    const last = candles[candles.length - 1];
    const analysis = analyzeChart(candles, { timeframe: "1d", nowSec: last.time + 60, gapEligible: false });
    expect(analysis.provisional).toBe(true);
    expect(analysis.trendlines.every((line) => line.status !== "BREAKOUT_CONFIRMED" || line.anchors[1].time < last.time)).toBe(true);
    expect(analysis.limitations.some((line) => line.includes("still forming"))).toBe(true);
  });
});
