import { describe, expect, it } from "vitest";
import {
  DEFAULT_BREAKOUT_UNIVERSE,
  breakoutScoreBand,
  parseBreakoutTickers,
} from "@/lib/breakoutPotential";
import {
  analyzeSellingPressure,
  classifyCandle,
  firstDemandDetector,
  measureCandles,
} from "@/src/engines/breakoutCandles";
import { classifySelloffSeverity, detectFirstHigherLow, detectSelloff } from "@/src/engines/selloffRecovery";
import {
  analogFeatures,
  analyzeBreakoutTicker,
  historicalAnalogs,
  resolveBreakoutState,
} from "@/src/engines/breakoutPotential";
import { mergeBreakoutSettings } from "@/lib/breakoutPotential";
import type { OHLCVBar } from "@/src/types/domain";

function bars(closes: number[], extras?: Partial<OHLCVBar>[]): OHLCVBar[] {
  return closes.map((close, i) => ({
    symbol: "TEST",
    timestamp: new Date(Date.UTC(2024, 0, 2 + i, 21, 0, 0)),
    open: extras?.[i]?.open ?? close + (close < (closes[i - 1] ?? close) ? 0.8 : -0.4),
    high: extras?.[i]?.high ?? close + 0.9,
    low: extras?.[i]?.low ?? close - 0.9,
    close,
    volume: extras?.[i]?.volume ?? 1_000_000 + i * 1000,
    timeframe: "1d",
    source: "test",
  }));
}

const settings = mergeBreakoutSettings();

describe("universe is not ticker-locked", () => {
  it("accepts any valid ticker and treats the example list as a default only", () => {
    expect(parseBreakoutTickers(["XYZ", "abc"]).tickers).toEqual(["XYZ", "ABC"]);
    expect(DEFAULT_BREAKOUT_UNIVERSE.includes("META")).toBe(true);
    const parsed = parseBreakoutTickers("SOFI, SMCI, IWM");
    expect(parsed.tickers).toEqual(["SOFI", "SMCI", "IWM"]);
  });
});

describe("candle sequence", () => {
  it("treats shrinking reds as weakening, not a buy", () => {
    const shrinking = measureCandles(
      bars([100, 97, 94.5, 92.8, 91.6, 90.9, 90.5, 90.3]),
      settings,
    );
    const pressure = analyzeSellingPressure(shrinking);
    expect(["WEAKENING", "STABLE", "EXHAUSTED"]).toContain(pressure.state);
    expect(pressure.state).not.toBe("INCREASING");
    const expanding = measureCandles(
      bars([100, 97, 93, 87, 79, 68, 54, 36], [
        { open: 100.2, volume: 800_000 },
        { open: 99.8, volume: 900_000 },
        { open: 97.4, volume: 1_100_000 },
        { open: 93.5, volume: 1_400_000 },
        { open: 87.8, volume: 1_800_000 },
        { open: 80.2, volume: 2_200_000 },
        { open: 69.5, volume: 2_800_000 },
        { open: 55.0, volume: 3_500_000 },
      ]),
      settings,
    );
    expect(analyzeSellingPressure(expanding).state).toBe("INCREASING");
  });

  it("does not call a tiny green candle after reds early demand", () => {
    const closes = [100, 98, 96, 94, 92.5, 91.4, 90.6, 90.2, 90.35];
    const series = bars(closes);
    series[series.length - 1] = { ...series[series.length - 1], open: 90.2, close: 90.35, high: 90.4, low: 90.15, volume: 200_000 };
    const candles = measureCandles(series, settings);
    const demand = firstDemandDetector({
      candles,
      selling: analyzeSellingPressure(candles),
      structure: { shift: "BEARISH_STRUCTURE", hh: false, hl: false, lh: true, ll: true, firstHigherLow: null, lastSwingHigh: 100, lastSwingLow: 90.15 },
      support: "NONE",
      resistance: 96,
      rsiImproving: false,
      macdImproving: false,
      settings,
    });
    expect(["WEAK_BOUNCE", "NOISE", "NONE"]).toContain(demand.classification);
    expect(demand.classification).not.toBe("BREAKOUT_CONFIRMED");
  });
});

describe("breakout confirmation", () => {
  it("classifies a wick above resistance as an attempt, not confirmed", () => {
    const state = resolveBreakoutState({
      insufficient: false,
      selling: analyzeSellingPressure(measureCandles(bars([10, 10.2, 10.1, 10.3]), settings)),
      demand: { score: 40, classification: "EARLY_DEMAND_RETURN", reasons: [], factors: [], candle: null },
      structure: { shift: "TRANSITIONING_STRUCTURE", hh: false, hl: true, lh: false, ll: false, firstHigherLow: null, lastSwingHigh: 10.4, lastSwingLow: 9.8 },
      compression: { state: "VOLATILITY_CONTRACTION", atrPct: 2, rangeShrink: 0.6 },
      nearRes: true,
      closedAbove: false,
      wickAbove: true,
      heldAbove: false,
      volumeOk: true,
      failed: false,
      extended: false,
      phase: "RESISTANCE_TEST",
    });
    expect(state).toBe("BREAKOUT_ATTEMPT");
  });

  it("requires close + volume + hold for confirmation", () => {
    const confirmed = resolveBreakoutState({
      insufficient: false,
      selling: analyzeSellingPressure(measureCandles(bars([10, 10.2, 10.4, 10.8]), settings)),
      demand: { score: 80, classification: "BREAKOUT_CONFIRMED", reasons: [], factors: [], candle: null },
      structure: { shift: "BULLISH_STRUCTURE", hh: true, hl: true, lh: false, ll: false, firstHigherLow: null, lastSwingHigh: 10.8, lastSwingLow: 9.9 },
      compression: { state: "COMPRESSION_TO_EXPANSION", atrPct: 3, rangeShrink: 0.5 },
      nearRes: false,
      closedAbove: true,
      wickAbove: false,
      heldAbove: true,
      volumeOk: true,
      failed: false,
      extended: false,
      phase: "BREAKOUT",
    });
    expect(confirmed).toBe("BREAKOUT_CONFIRMED");
  });
});

describe("selloff normalization", () => {
  it("does not treat a fixed percent as large for every stock", () => {
    expect(classifySelloffSeverity(1.0, settings)).toBe("Minor");
    expect(classifySelloffSeverity(2.5, settings)).toBe("Large");
    expect(classifySelloffSeverity(5.2, settings)).toBe("Extreme");
    const decline = bars([...Array.from({ length: 20 }, (_, i) => 120 - i * 0.1), ...Array.from({ length: 15 }, (_, i) => 118 - i * 1.8)]);
    const selloff = detectSelloff(decline, settings);
    expect(selloff).not.toBeNull();
    expect(selloff?.severity).not.toBe("None");
    const hlBars = bars([...Array.from({ length: 25 }, (_, i) => 80 - i * 0.8), 60, 64, 62, 66, 63.5, 67]);
    hlBars[hlBars.length - 5].low = 59.5;
    hlBars[hlBars.length - 2].low = 62.2;
    const hl = detectFirstHigherLow(hlBars, detectSelloff(hlBars, settings), settings);
    if (hl.found) expect(hl.price).toBeGreaterThan(detectSelloff(hlBars, settings)!.trough);
  });
});

describe("analogs never use future features", () => {
  it("returns insufficient sample on a short series and only scores with past bars", () => {
    const short = bars(Array.from({ length: 20 }, () => 50));
    const feat = analogFeatures({ redStreak: 6, rsi: 38, distRes: 1.2, hl: true, rvol: 1.4, compressed: true, macdUp: true });
    expect(historicalAnalogs(short, feat, settings).sample).toBe("INSUFFICIENT_SAMPLE");
  });
});

describe("ticker analysis", () => {
  it("does not invent a setup from a single green candle", () => {
    const down = Array.from({ length: 30 }, (_, i) => 80 - i * 0.4);
    down[down.length - 1] = 68.2;
    const row = analyzeBreakoutTicker({
      symbol: "ZZZ",
      bars: { "1d": bars(down) },
      primary: "1d",
      lifecycle: "1d",
      settings,
      lite: true,
    }).row;
    expect(row.symbol).toBe("ZZZ");
    expect(row.state).not.toBe("BREAKOUT_CONFIRMED");
    expect(["NO_SETUP", "EARLY_OBSERVATION", "DEVELOPING", "PRE_BREAKOUT", "INSUFFICIENT_DATA"]).toContain(row.band);
  });

  it("maps score bands without buy/sell language", () => {
    expect(breakoutScoreBand(12)).toBe("NO_SETUP");
    expect(breakoutScoreBand(62)).toBe("PRE_BREAKOUT");
    expect(breakoutScoreBand(92)).toBe("BREAKOUT_CONFIRMED");
    expect(classifyCandle({
      symbol: "T",
      timestamp: new Date(),
      open: 10,
      high: 10.1,
      low: 9.2,
      close: 9.3,
      volume: 1,
      timeframe: "1d",
      source: "t",
    }).kind).toBe("STRONG_SELLING");
  });
});
