import { describe, expect, it } from "vitest";
import {
  CHART_PATTERN_CATALOG,
  buildTradeLevels,
  evaluateAllPatterns,
  overviewDecisionFor,
  pickPrimaryPattern,
  resampleToMonthly,
  tradeDecisionFor,
} from "@/src/engines/chartPatterns";
import { PATTERN_TIMEFRAMES, TIMEFRAMES } from "@/src/config/timeframes";
import type { OHLCVBar } from "@/src/types/domain";

function bar(i: number, open: number, high: number, low: number, close: number, volume = 1_000_000): OHLCVBar {
  return {
    symbol: "TEST",
    timestamp: new Date(Date.UTC(2024, 0, 1 + i)),
    open,
    high,
    low,
    close,
    volume,
    timeframe: "1d",
    source: "test",
  };
}

function fromCloses(closes: number[]): OHLCVBar[] {
  return closes.map((close, i) => {
    const prev = i === 0 ? close : closes[i - 1];
    const open = prev;
    const high = Math.max(open, close) * 1.008;
    const low = Math.min(open, close) * 0.992;
    return bar(i, open, high, low, close);
  });
}

describe("chart pattern catalog", () => {
  it("defines 50 uniquely named patterns", () => {
    expect(CHART_PATTERN_CATALOG).toHaveLength(50);
    const names = CHART_PATTERN_CATALOG.map((p) => p.name);
    expect(new Set(names).size).toBe(50);
    const ids = CHART_PATTERN_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(50);
  });

  it("does not change Signal Analyzer timeframes", () => {
    expect(TIMEFRAMES).toEqual(["5m", "30m", "1h", "4h", "1d"]);
    expect(PATTERN_TIMEFRAMES).toEqual(["5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]);
    expect(TIMEFRAMES.includes("15m" as never)).toBe(false);
    expect(TIMEFRAMES.includes("1w" as never)).toBe(false);
    expect(TIMEFRAMES.includes("1M" as never)).toBe(false);
  });
});

describe("primary pattern selection", () => {
  it("evaluates all 50 patterns then returns a single current result", () => {
    const climb = Array.from({ length: 22 }, (_, i) => 100 + i * 1.6);
    const flag = [134.5, 133.8, 133.2, 132.6, 132.1, 131.7];
    const bars = fromCloses([...climb, ...flag]);
    const { evaluated, hits } = evaluateAllPatterns(bars);
    expect(evaluated).toBe(50);
    const primary = pickPrimaryPattern(bars);
    expect(primary.evaluated).toBe(50);
    expect(primary.name).toBeTruthy();
    expect(["BULLISH", "BEARISH", "NEUTRAL"]).toContain(primary.bias);
    expect(["Entry", "Wait", "Avoid"]).toContain(primary.decision);
    expect(primary.market_structure).toMatch(/High|Low|Range/);
    expect(hits.filter((h) => h.id === "bull_flag").length).toBeGreaterThan(0);
    expect(primary.name).toBe("Bull Flag");
    expect(primary.bias).toBe("BULLISH");
    const levels = buildTradeLevels(bars, primary);
    expect(levels.stop).toBeLessThan(levels.entry);
    expect(levels.target1).toBeGreaterThan(levels.entry);
    expect(levels.target2).toBeGreaterThan(levels.target1);
    expect(levels.target3).toBeGreaterThan(levels.target2);
    expect(overviewDecisionFor(primary.bias, primary.status)).toMatch(/ENTER|WAIT|AVOID/);
    expect(tradeDecisionFor(primary.status, "day")).toMatch(/ENTER|WAIT FOR BREAKOUT|AVOID \/ NO TRADE/);
    expect(tradeDecisionFor("Breakout Confirmed", "swing")).toBe("ENTER SWING TRADE");
    expect(tradeDecisionFor("Forming", "day")).toBe("WAIT FOR BREAKOUT");
  });

  it("resamples daily bars into monthly candles", () => {
    const bars = fromCloses(Array.from({ length: 60 }, (_, i) => 100 + i));
    const monthly = resampleToMonthly(bars);
    expect(monthly.length).toBeGreaterThan(1);
    expect(monthly.length).toBeLessThan(bars.length);
    expect(monthly.every((b) => b.timeframe === "1M")).toBe(true);
    expect(monthly[0].open).toBe(bars[0].open);
  });

  it("selects a bearish double top when price loses the neckline", () => {
    const up = Array.from({ length: 16 }, (_, i) => 100 + i * 2);
    const peak1 = [132, 134, 133];
    const dip = [128, 124, 122, 123];
    const peak2 = [130, 133.5, 132];
    const breakDn = [126, 121, 118, 116];
    const bars = fromCloses([...up, ...peak1, ...dip, ...peak2, ...breakDn]);
    const primary = pickPrimaryPattern(bars);
    expect(primary.bias).toBe("BEARISH");
    expect(primary.name).toBeTruthy();
  });

  it("keeps one primary pattern even when several matches exist", () => {
    const bars = fromCloses(Array.from({ length: 50 }, (_, i) => 80 + Math.sin(i / 3) * 2 + i * 0.15));
    const { hits } = evaluateAllPatterns(bars);
    const primary = pickPrimaryPattern(bars);
    expect(primary.name.split(" / ").length).toBe(1);
    if (hits.length > 1) {
      expect(hits.some((h) => h.name !== primary.name)).toBe(true);
    }
  });
});
