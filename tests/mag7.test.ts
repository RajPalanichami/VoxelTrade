import { describe, expect, it } from "vitest";
import { analyzeStock, applyPerformancePoints, finalizeScores, normalizeTo100, scoreTrend, ytdPct } from "@/src/engines/mag7Score";
import { makeFrame } from "@/src/lib/series";

function uptrend(n = 260, start = 100) {
  const startDate = new Date("2024-01-02T00:00:00Z");
  const rows = Array.from({ length: n }, (_, i) => {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const close = start * 1.001 ** i;
    return { timestamp: d, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1.2e6 + ((2e6 - 1.2e6) * i) / (n - 1) };
  });
  return makeFrame(rows);
}

function downtrend(n = 260, start = 100) {
  const startDate = new Date("2024-01-02T00:00:00Z");
  const rows = Array.from({ length: n }, (_, i) => {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const close = start * 0.998 ** i;
    return { timestamp: d, open: close, high: close * 1.01, low: close * 0.99, close, volume: 8e5 };
  });
  return makeFrame(rows);
}

describe("mag7 score", () => {
  it("full bullish stack is 25", () => {
    const out = scoreTrend(120, 110, 100, 90);
    expect(out.points).toBe(25);
    expect(out.alignment).toBe("Bullish");
  });

  it("bearish stack is zero", () => {
    const out = scoreTrend(80, 90, 100, 110);
    expect(out.points).toBe(0);
    expect(out.alignment).toBe("Bearish");
  });

  it("normalize starts at 100", () => {
    const pts = normalizeTo100([
      { time: 1, close: 50 },
      { time: 2, close: 55 },
    ]);
    expect(pts[0].value).toBe(100);
    expect(Math.abs(pts[1].value - 110)).toBeLessThan(1e-6);
  });

  it("uptrend outranks downtrend", () => {
    const up = analyzeStock("AAA", "Up", uptrend(), { price: 130, change_percent: 1.2, source: "test" }, {});
    const down = analyzeStock("BBB", "Down", downtrend(), { price: 60, change_percent: -1.4, source: "test" }, {});
    const rows = [up!, down!];
    finalizeScores(rows);
    expect(rows[0].symbol).toBe("AAA");
    expect(rows[0].strength as number).toBeGreaterThan(rows[1].strength as number);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[0].strength as number).toBeGreaterThanOrEqual(0);
    expect(rows[0].strength as number).toBeLessThanOrEqual(100);
    expect(rows[0].risk_score as number).toBeGreaterThanOrEqual(0);
    expect(rows[0].risk_score as number).toBeLessThanOrEqual(100);
  });

  it("performance points cap at 20", () => {
    const rows = [
      { performance: { "1W": 10, "1M": 10, "3M": 10, "6M": 10, "1Y": 10 }, performance_points: 0 },
      { performance: { "1W": -1, "1M": -1, "3M": -1, "6M": -1, "1Y": -1 }, performance_points: 0 },
    ];
    applyPerformancePoints(rows);
    expect(rows[0].performance_points).toBe(20);
    expect(rows[1].performance_points).toBe(0);
  });

  it("ytd uses calendar year", () => {
    const timestamps = [new Date("2025-12-31T00:00:00Z"), new Date("2026-01-02T00:00:00Z"), new Date("2026-06-01T00:00:00Z")];
    expect(Math.abs((ytdPct([100, 80, 88], timestamps) || 0) - 10)).toBeLessThan(1e-6);
  });
});
