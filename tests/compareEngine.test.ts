import { describe, expect, it } from "vitest";
import {
  COMPARE_SPECS,
  buildRows,
  buildSnapshot,
  categoryScores,
  cellsFromSnap,
  classifyOscillator,
  headlineFromScore,
  overallScore,
  toCard,
} from "@/src/engines/compareEngine";
import { CATEGORY_WEIGHTS, parseCompareTicker } from "@/lib/compare";
import { normalizeComparePeriod, normalizeCompareTimeframe } from "@/src/services/compare";
import type { OHLCVBar } from "@/src/types/domain";

function bars(n: number, start = 100, drift = 0.4): OHLCVBar[] {
  const out: OHLCVBar[] = [];
  let px = start;
  const day = Date.UTC(2025, 0, 1);
  for (let i = 0; i < n; i++) {
    px += drift + (i % 5 === 0 ? -0.2 : 0.1);
    out.push({
      symbol: "AAA",
      timestamp: new Date(day + i * 86400000),
      open: px - 0.3,
      high: px + 0.8,
      low: px - 0.9,
      close: px,
      volume: 1_000_000 + i * 100,
      timeframe: "1d",
      source: "test",
    });
  }
  return out;
}

describe("compare engine", () => {
  it("registers at least 150 documented indicators", () => {
    expect(COMPARE_SPECS.length).toBeGreaterThanOrEqual(150);
    const ids = new Set(COMPARE_SPECS.map((s) => s.id));
    expect(ids.size).toBe(COMPARE_SPECS.length);
  });

  it("does not treat RSI 75 as strong bullish", () => {
    expect(classifyOscillator(75)).toBe("MIXED");
    expect(classifyOscillator(82)).toBe("OVEREXTENDED");
    expect(classifyOscillator(60)).toBe("BULLISH");
    expect(classifyOscillator(null)).toBe("INSUFFICIENT DATA");
  });

  it("marks SMA 200 insufficient on short history", () => {
    const snap = buildSnapshot("AAA", "Aaa", bars(30));
    const cells = cellsFromSnap(snap);
    expect(cells.sma200.display).toBe("INSUFFICIENT DATA");
    expect(cells.sma20.display).not.toBe("INSUFFICIENT DATA");
    expect(cells.rsi14.signal).not.toBe("INSUFFICIENT DATA");
  });

  it("scores a rising series as bullish and keeps weights at 100%", () => {
    const snap = buildSnapshot("AAA", "Aaa", bars(260, 80, 0.8));
    const card = toCard(snap, null);
    expect(card.score).toBeGreaterThan(50);
    expect(card.signal).not.toBe("INSUFFICIENT DATA");
    expect(card.confidence).toBeGreaterThan(40);
    const weightSum = card.scoreBreakdown.reduce((s, r) => s + r.weight, 0);
    expect(weightSum).toBeCloseTo(1, 5);
    const cats = categoryScores(cellsFromSnap(snap));
    const overall = overallScore(cats);
    expect(overall.score).toBe(card.score);
    expect(headlineFromScore(90, { rsi14: { value: 62, display: "62", signal: "BULLISH", interpretation: "", confidence: 80, validBars: 200 } })).toBe("STRONG BULLISH");
    expect(headlineFromScore(90, cellsFromSnap(snap))).toMatch(/BULLISH|OVEREXTENDED/);
  });

  it("compares two series without inventing a winner on volatility", () => {
    const a = buildSnapshot("NVDA", "NVDA", bars(80, 100, 0.6));
    const b = buildSnapshot("AMD", "AMD", bars(80, 40, 0.1));
    const rows = buildRows(a, b);
    const atr = rows.find((r) => r.id === "atr");
    expect(atr?.relative).toBe("Not Directly Comparable");
    const ret = rows.find((r) => r.id === "ret_5");
    expect(["NVDA", "AMD", "Comparable"]).toContain(ret?.relative);
    expect(rows.some((r) => r.category === "Relative Strength")).toBe(true);
  });

  it("parses user tickers exactly and never substitutes another symbol", () => {
    expect(parseCompareTicker("tsla", "Ticker 2")).toEqual({ symbol: "TSLA" });
    expect(parseCompareTicker("META")).toEqual({ symbol: "META" });
    expect(parseCompareTicker("")).toEqual({ error: "Ticker is required." });
    expect(parseCompareTicker("@@@", "Ticker 2")).toMatchObject({ error: expect.stringContaining("Invalid ticker") });
    expect(JSON.stringify(parseCompareTicker("TSLA"))).not.toContain("AMD");
  });

  it("validates compare timeframe and period without touching Signal Analyzer TFs", () => {
    expect(normalizeCompareTimeframe("Daily")).toBe("1d");
    expect(normalizeCompareTimeframe("1H")).toBe("1h");
    expect(normalizeComparePeriod("1Y")).toBe("1Y");
    expect(() => normalizeCompareTimeframe("1M")).toThrow(/Unsupported timeframe/);
    expect(Object.values(CATEGORY_WEIGHTS).reduce((s, w) => s + w, 0)).toBeCloseTo(1, 5);
  });

  it("handles flat prices and zero volume without throwing", () => {
    const flat = bars(40, 50, 0).map((b) => ({ ...b, open: 50, high: 50, low: 50, close: 50, volume: 0 }));
    expect(() => toCard(buildSnapshot("FLAT", "Flat", flat), null)).not.toThrow();
  });
});
