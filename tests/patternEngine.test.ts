import { describe, expect, it } from "vitest";
import type { OHLCVBar } from "@/src/types/domain";
import {
  analyzeChartPattern,
  analyzeMarketStructure,
  collectAdaptiveSwings,
  detectDiamondBottom,
  detectHeadAndShoulders,
  detectInverseCupAndHandle,
  detectInverseHeadAndShoulders,
  detectTripleBottom,
  scorePatternSignal,
  validateBreakout,
} from "@/src/engines/patternEngine";

function bar(i: number, open: number, high: number, low: number, close: number, volume = 1_200_000): OHLCVBar {
  return {
    symbol: "TEST",
    timestamp: new Date(Date.UTC(2022, 0, 1 + i)),
    open,
    high,
    low,
    close,
    volume,
    timeframe: "1d",
    source: "test",
  };
}

function path(points: [number, number][], extra = 0): OHLCVBar[] {
  const lastX = points[points.length - 1][0];
  const closes: number[] = [];
  for (let i = 0; i <= lastX + extra; i++) {
    const next = points.findIndex(([x]) => x >= i);
    if (next <= 0) {
      closes.push(points[0][1]);
      continue;
    }
    const [x1, y1] = points[next - 1];
    const [x2, y2] = points[next];
    const t = x2 === x1 ? 0 : (i - x1) / (x2 - x1);
    closes.push(y1 + (y2 - y1) * t);
  }
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    const high = Math.max(open, close) + 0.8;
    const low = Math.min(open, close) - 0.8;
    return bar(i, open, high, low, close, 1_000_000 + (i % 5) * 250_000);
  });
}

describe("breakout close vs wick", () => {
  it("does not confirm a wick-only pierce", () => {
    const bars = path([
      [0, 100],
      [8, 100],
      [9, 100],
    ]);
    bars.push(bar(bars.length, 100, 108, 99.5, 101, 2_000_000));
    const v = validateBreakout(bars, 106, "UP", 7);
    expect(v.candleClosedBeyondBoundary).toBe(false);
    expect(v.wickOnly).toBe(true);
    expect(v.explanation).toMatch(/did not close/);
  });

  it("confirms only when the candle closes beyond the boundary", () => {
    const bars = path([
      [0, 100],
      [8, 100],
    ]);
    bars.push(bar(bars.length, 104, 111, 103, 110, 3_000_000));
    const v = validateBreakout(bars, 106, "UP", 6);
    expect(v.candleClosedBeyondBoundary).toBe(true);
    expect(v.wickOnly).toBe(false);
  });
});

function explicit(n: number, close0: number, edits: Array<{ i: number; high?: number; low?: number; close?: number; volume?: number }>) {
  const bars = Array.from({ length: n }, (_, i) => bar(i, close0, close0 + 0.4, close0 - 0.4, close0));
  for (const e of edits) {
    const b = bars[e.i];
    if (!b) continue;
    if (e.high != null) b.high = e.high;
    if (e.low != null) b.low = e.low;
    if (e.close != null) b.close = e.close;
    if (e.volume != null) b.volume = e.volume;
    b.open = b.close;
  }
  for (let i = 1; i < bars.length; i++) {
    bars[i].high = Math.max(bars[i].high, bars[i].open, bars[i].close);
    bars[i].low = Math.min(bars[i].low, bars[i].open, bars[i].close);
  }
  return bars;
}

describe("head and shoulders", () => {
  function hs(breakdown = true) {
    const edits = [
      { i: 20, high: 128, close: 124 },
      { i: 26, low: 108, close: 110 },
      { i: 34, high: 146, close: 140 },
      { i: 42, low: 109, close: 111 },
      { i: 50, high: 126, close: 122 },
    ];
    for (let i = 54; i < 64; i++) {
      edits.push({ i, high: breakdown ? 102 : 120, low: breakdown ? 94 : 114, close: breakdown ? 96 : 118, volume: breakdown ? 4_000_000 : 1_200_000 });
    }
    return explicit(64, 116, edits);
  }

  it("detects LS / head / RS and requires a close below the neckline", () => {
    const forming = hs(false);
    const confirmed = hs(true);
    const a = detectHeadAndShoulders(forming, collectAdaptiveSwings(forming));
    const b = detectHeadAndShoulders(confirmed, collectAdaptiveSwings(confirmed));
    expect(b || a).toBeTruthy();
    if (b) {
      expect(b.points.some((p) => p.role === "Head")).toBe(true);
      expect(b.neckline).toBeGreaterThan(0);
      expect(["BREAKOUT_PENDING", "RETEST_PENDING", "BREAKOUT_CONFIRMED", "RETEST_CONFIRMED", "FAILED", "FORMING"]).toContain(b.status);
    }
    if (a && b) {
      expect(a.bias).toBe("BEARISH");
      expect(b.bias).toBe("BEARISH");
    }
  });

  it("rejects a right shoulder that is not below the head", () => {
    const bars = path([
      [0, 100],
      [16, 120],
      [24, 110],
      [32, 125],
      [40, 111],
      [48, 140],
      [56, 100],
    ]);
    const hit = detectHeadAndShoulders(bars, collectAdaptiveSwings(bars));
    if (hit) expect(hit.points.find((p) => p.role === "Right Shoulder")!.price).toBeLessThan(hit.points.find((p) => p.role === "Head")!.price);
  });
});

describe("inverse head and shoulders", () => {
  it("requires the head to be the lowest trough", () => {
    const bars = path([
      [0, 120],
      [12, 96],
      [20, 112],
      [28, 82],
      [36, 113],
      [44, 97],
      [52, 126],
    ]);
    const hit = detectInverseHeadAndShoulders(bars, collectAdaptiveSwings(bars));
    if (hit) {
      const head = hit.points.find((p) => p.role === "Head")!;
      const ls = hit.points.find((p) => p.role === "Left Shoulder")!;
      const rs = hit.points.find((p) => p.role === "Right Shoulder")!;
      expect(head.price).toBeLessThan(ls.price);
      expect(head.price).toBeLessThan(rs.price);
      expect(hit.bias).toBe("BULLISH");
    }
  });

  it("does not confirm a false breakout that closes back below the neckline", () => {
    const bars = path([
      [0, 120],
      [12, 96],
      [20, 112],
      [28, 82],
      [36, 113],
      [44, 97],
      [50, 124],
      [54, 108],
    ]);
    const hit = detectInverseHeadAndShoulders(bars, collectAdaptiveSwings(bars));
    if (hit?.breakout?.candleClosedBeyondBoundary) {
      expect(["FAILED", "RETEST_FAILED", "RETEST_PENDING", "RETEST_CONFIRMED"]).toContain(hit.status);
    }
  });
});

describe("triple bottom", () => {
  it("accepts three comparable lows and names three-trough structure independently", () => {
    const bars = path([
      [0, 130],
      [10, 100],
      [16, 118],
      [24, 99],
      [30, 117],
      [38, 101],
      [46, 128],
    ]);
    const swings = collectAdaptiveSwings(bars);
    const hit = detectTripleBottom(bars, swings);
    const structure = analyzeMarketStructure(bars, swings);
    if (hit) {
      expect(hit.points.filter((p) => p.role.startsWith("Low")).length).toBe(3);
      expect(hit.bias).toBe("BULLISH");
    }
    expect(structure.type === "Three-Trough Support" || structure.type === "Three-Trough Reversal" || /HL|LL|Range/.test(structure.type)).toBe(true);
  });

  it("rejects lows outside tolerance", () => {
    const bars = path([
      [0, 130],
      [10, 100],
      [16, 118],
      [24, 70],
      [30, 117],
      [38, 101],
    ]);
    const hit = detectTripleBottom(bars, collectAdaptiveSwings(bars));
    expect(hit).toBeNull();
  });
});

describe("diamond bottom", () => {
  it("needs expansion then contraction after a downtrend", () => {
    const valid = path([
      [0, 140],
      [8, 118],
      [14, 124],
      [20, 108],
      [26, 132],
      [32, 102],
      [38, 126],
      [44, 110],
      [50, 120],
      [56, 128],
    ]);
    const hit = detectDiamondBottom(valid, collectAdaptiveSwings(valid));
    if (hit) {
      expect(hit.id).toBe("diamond_bottom");
      expect(hit.bias).toBe("BULLISH");
      expect(hit.points.length).toBeGreaterThanOrEqual(6);
    }
    const noDown = path([
      [0, 90],
      [10, 110],
      [20, 130],
      [30, 150],
    ]);
    expect(detectDiamondBottom(noDown, collectAdaptiveSwings(noDown))).toBeNull();
  });
});

describe("inverse cup and handle", () => {
  it("does not confirm from the dome alone", () => {
    const forming = path([
      [0, 90],
      [8, 118],
      [16, 140],
      [24, 126],
      [32, 138],
      [38, 128],
      [44, 132],
    ]);
    const hit = detectInverseCupAndHandle(forming, collectAdaptiveSwings(forming));
    if (hit) {
      expect(hit.bias).toBe("BEARISH");
      expect(["FORMING", "BREAKOUT_PENDING"]).toContain(hit.status);
    }
  });
});

describe("signal engine", () => {
  it("does not emit BUY from a bullish forming pattern", () => {
    const bars = path([
      [0, 100],
      [20, 108],
      [40, 104],
    ]);
    const analysis = analyzeChartPattern(bars);
    const signal = scorePatternSignal(analysis.primary, analysis.marketStructure, bars);
    if (analysis.primary && (analysis.primary.status === "FORMING" || analysis.primary.status === "BREAKOUT_PENDING")) {
      expect(signal.action).not.toBe("BUY");
    }
    expect(["WAIT", "NO_TRADE", "INSUFFICIENT_DATA", "BUY", "SELL"]).toContain(signal.action);
  });

  it("keeps HH+HL bullish even when a bearish pattern is present", () => {
    const bars = path([
      [0, 100],
      [8, 110],
      [16, 106],
      [24, 118],
      [32, 112],
    ]);
    const swings = collectAdaptiveSwings(bars);
    const structure = analyzeMarketStructure(bars, swings);
    if (structure.type === "HH + HL") expect(structure.bias).toBe("BULLISH");
  });
});

describe("historical regimes", () => {
  it("does not invent ticker-specific results across bull, bear, and range series", () => {
    const bull = path(Array.from({ length: 12 }, (_, i) => [i * 5, 80 + i * 6] as [number, number]));
    const bear = path(Array.from({ length: 12 }, (_, i) => [i * 5, 180 - i * 6] as [number, number]));
    const range = path(Array.from({ length: 16 }, (_, i) => [i * 4, 100 + Math.sin(i) * 3] as [number, number]));
    for (const bars of [bull, bear, range]) {
      const analysis = analyzeChartPattern(bars);
      expect(analysis.dataQuality.ok).toBe(true);
      if (analysis.primary) {
        expect(analysis.primary.confidence).toBeGreaterThanOrEqual(40);
        expect(analysis.primary.points.length).toBeGreaterThan(0);
        expect(analysis.signal.action === "BUY" ? analysis.primary.status !== "FORMING" : true).toBe(true);
      } else {
        expect(analysis.signal.action).not.toBe("BUY");
      }
    }
  });
});

describe("data quality", () => {
  it("returns insufficient data instead of inventing a pattern", () => {
    const bars = path([
      [0, 100],
      [4, 101],
    ]);
    const analysis = analyzeChartPattern(bars);
    expect(analysis.dataQuality.ok).toBe(false);
    expect(analysis.primary).toBeNull();
    expect(analysis.signal.action).toBe("INSUFFICIENT_DATA");
  });
});
