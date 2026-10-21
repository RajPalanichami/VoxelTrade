import { describe, expect, it } from "vitest";
import { buildDecisionLadder, buildOptionIdeas, describeStructure, fibonacciDownsideExtensions, fibonacciExtensions } from "@/src/engines/tradePlanEngine";
import { fibonacciRetracements } from "@/src/engines/swingStrategies";
import { isTradePlanTimeframe } from "@/lib/tradePlan";
import { normalizeTradePlanTimeframe } from "@/src/services/tradePlan";

describe("trade plan fibonacci", () => {
  it("retraces a completed swing without inventing prices", () => {
    const fib = fibonacciRetracements(100, 80);
    expect(fib.r618).toBeCloseTo(87.64, 1);
    expect(fib.high).toBe(100);
    expect(fib.low).toBe(80);
  });

  it("projects extensions from the same range", () => {
    const ext = fibonacciExtensions(100, 80);
    expect(ext.ext100).toBe(100);
    expect(ext.ext162).toBeCloseTo(112.36, 1);
  });

  it("projects a 1.1 extension below the completed swing low", () => {
    const down = fibonacciDownsideExtensions(100, 80);
    expect(down.ext110).toBeCloseTo(78, 1);
  });
});

describe("decision ladder", () => {
  it("keeps breakout and major resistance as distinct prices", () => {
    const ladder = buildDecisionLadder({
      price: 100,
      vwap: 99,
      fib618: 98.5,
      fib500: 97,
      fib786: 95,
      pivot: 96.5,
      breakout: 108,
      majorResistance: 108,
      priorSessionHigh: 105,
      r1: 104,
      r2: 107,
      s1: 99.8,
      s2: 94,
      s3: 90,
      rangeLow: 92,
      priorSessionLow: 91,
      down110: 88,
    });
    const prices = ladder.map((l) => l.price).filter((n): n is number => n != null);
    const unique = new Set(prices.map((n) => n.toFixed(2)));
    expect(unique.size).toBe(prices.length);
    expect(ladder[0].price).not.toBe(ladder[1].price);
    expect((ladder[5].price || 0) < (ladder[4].price || 0)).toBe(true);
  });
});

describe("structure language", () => {
  it("calls a range when HH/HL are mixed", () => {
    const s = describeStructure({ higher_highs: true, higher_lows: false, lower_highs: false, lower_lows: false }, 110, 90, 100);
    expect(s.label).toBe("RANGE");
    expect(s.detail).toMatch(/90/);
  });

  it("does not invent structure without a price", () => {
    expect(describeStructure({ higher_highs: false, higher_lows: false, lower_highs: false, lower_lows: false }, 110, 90, null).label).toBe("INSUFFICIENT DATA");
  });
});

describe("option ideas", () => {
  it("stays unavailable when the chain is missing", () => {
    const ideas = buildOptionIdeas(100, null, { up: 110, down: 90 });
    expect(ideas.bullish.every((i) => !i.available)).toBe(true);
  });

  it("uses listed strikes only", () => {
    const ideas = buildOptionIdeas(100, { expiration: "2026-10-03", calls: [{ strike: 100 }, { strike: 105 }], puts: [{ strike: 100 }, { strike: 95 }] }, { up: 105, down: 95 });
    expect(ideas.bullish[0].available).toBe(true);
    expect(ideas.bullish[0].detail).toMatch(/100/);
    expect(ideas.bullish[2].available).toBe(false);
  });
});

describe("timeframes", () => {
  it("accepts only 15m 30m 1h 4h", () => {
    expect(normalizeTradePlanTimeframe("1 hour")).toBe("1h");
    expect(normalizeTradePlanTimeframe("15m")).toBe("15m");
    expect(isTradePlanTimeframe("1d")).toBe(false);
    expect(() => normalizeTradePlanTimeframe("1d")).toThrow(/Unsupported timeframe/);
  });
});
