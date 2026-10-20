import { describe, expect, it } from "vitest";
import { computePositionSize, computeRiskReward, isBuyingHorizon } from "@/lib/stockBuying";
import { classifyBreakout, classifyStructure, movingAveragesFromCloses, relativeStrengthNote } from "@/src/engines/stockBuyingEngine";
import { normalizeBuyingHorizon } from "@/src/services/stockBuying";

describe("risk reward", () => {
  it("computes long R:R from entry stop and targets", () => {
    const rr = computeRiskReward({ entry: 100, stop: 98, target1: 104, target2: 108, target3: 110 });
    expect(rr.valid).toBe(true);
    expect(rr.risk).toBe(2);
    expect(rr.rr1).toBeCloseTo(2);
    expect(rr.rr2).toBeCloseTo(4);
  });

  it("refuses a stop at or above entry", () => {
    const rr = computeRiskReward({ entry: 100, stop: 101, target1: 110, target2: null, target3: null });
    expect(rr.valid).toBe(false);
    expect(rr.rr1).toBeNull();
  });
});

describe("position size", () => {
  it("sizes shares from account risk and stop distance", () => {
    const size = computePositionSize({ accountSize: 50_000, riskPct: 0.5, entry: 100, stop: 98 });
    expect(size.maxDollarRisk).toBe(250);
    expect(size.riskPerShare).toBe(2);
    expect(size.maxShares).toBe(125);
    expect(size.positionValue).toBe(12_500);
  });

  it("does not invent size when stop is missing", () => {
    const size = computePositionSize({ accountSize: 50_000, riskPct: 0.5, entry: 100, stop: null });
    expect(size.valid).toBe(false);
    expect(size.maxShares).toBeNull();
  });
});

describe("breakout uses completed candles only", () => {
  it("stays pending when price is near resistance without a completed close", () => {
    const state = classifyBreakout(99.2, { time: 1, open: 98, high: 99, low: 97, close: 98.5, volume: 1 }, { r1: 100 }, 1.0);
    expect(state).toBe("BREAKOUT_PENDING");
  });

  it("confirms only after a completed close through resistance with volume", () => {
    const state = classifyBreakout(101.2, { time: 1, open: 99, high: 101.4, low: 98.8, close: 101.1, volume: 2 }, { r1: 100 }, 1.5);
    expect(state).toBe("BREAKOUT_CONFIRMED");
  });

  it("marks failed when a completed close was through then price is back below", () => {
    const state = classifyBreakout(99.1, { time: 1, open: 100.5, high: 101, low: 99, close: 100.8, volume: 2 }, { r1: 100 }, 1.4);
    expect(state).toBe("FAILED");
  });
});

describe("structure and averages", () => {
  it("requires both HH and HL for a bullish structure label", () => {
    expect(classifyStructure({ higher_highs: true, higher_lows: true }).label).toBe("BULLISH");
    expect(classifyStructure({ higher_highs: true, higher_lows: false }).label).toBe("MIXED");
    expect(classifyStructure({})).toEqual(expect.objectContaining({ label: "INSUFFICIENT_DATA" }));
  });

  it("computes SMA from completed closes without lookahead", () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(movingAveragesFromCloses(closes).sma20).toBeCloseTo(10.5);
    expect(movingAveragesFromCloses(closes).sma50).toBeNull();
  });
});

describe("relative strength language", () => {
  it("explains outperformance without inventing a forecast", () => {
    const note = relativeStrengthNote(4.2, 2.1, 1);
    expect(note).toMatch(/outperforming SPY/i);
    expect(note).not.toMatch(/% chance/i);
  });
});

describe("horizon parsing", () => {
  it("accepts aliases and rejects unknown horizons", () => {
    expect(normalizeBuyingHorizon("day trade")).toBe("DAY_TRADE");
    expect(isBuyingHorizon("SWING")).toBe(true);
    expect(() => normalizeBuyingHorizon("hourly")).toThrow(/Unsupported horizon/);
  });
});
