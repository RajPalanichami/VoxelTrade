import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPPORTUNITY_UNIVERSE,
  isDefaultUniverse,
  parseOpportunityUniverse,
  scoreBand,
} from "@/lib/opportunity";
import {
  analyzeOpportunityTicker,
  assessMarketRegime,
  classifyCatalyst,
  classifyRelativeStrength,
  snapshotTimeframe,
  type MarketRegime,
} from "@/src/engines/opportunityEngine";
import { readinessFromParts } from "@/src/engines/opportunityScoring";
import type { OHLCVBar } from "@/src/types/domain";

function bars(symbol: string, closes: number[], tf = "1d", vol = 1_000_000): OHLCVBar[] {
  return closes.map((close, i) => ({
    symbol,
    timestamp: new Date(Date.UTC(2025, 0, 2 + i, tf === "1d" ? 21 : 14, (i % 8) * 5, 0)),
    open: close - 0.4,
    high: close + 1.2,
    low: close - 1.1,
    close,
    volume: vol + i * 1000,
    timeframe: tf,
    source: "test",
  }));
}

function rising(n = 80, start = 80) {
  return Array.from({ length: n }, (_, i) => start + i * 0.35 + (i % 5 === 0 ? 0.2 : 0));
}

function flatNear(n = 80, px = 100) {
  return Array.from({ length: n }, (_, i) => px + Math.sin(i / 4) * 0.6);
}

const bullRegime: MarketRegime = {
  label: "BULLISH",
  risk: "RISK-ON",
  explanation: "Supportive",
  spy: { trend: "Bullish", vs20: "Above", vs50: "Above", price: 500 },
  qqq: { trend: "Bullish", vs20: "Above", vs50: "Above", price: 450 },
  iwm: { trend: "Neutral", vs20: "Above", vs50: "Below", price: 200 },
  vix: { trend: "Falling", risk: "Contained", price: 14 },
};

describe("opportunity universe", () => {
  it("loads the exact default 20", () => {
    expect(DEFAULT_OPPORTUNITY_UNIVERSE).toEqual([
      "NVDA", "TSM", "AVGO", "MU", "AMD", "ASML", "AMAT", "ARM", "MRVL", "LRCX",
      "AAPL", "MSFT", "GOOGL", "AMZN", "META", "PLTR", "ORCL", "ANET", "ADBE", "DELL",
    ]);
    expect(isDefaultUniverse([...DEFAULT_OPPORTUNITY_UNIVERSE])).toBe(true);
    expect(isDefaultUniverse(["NVDA", "MU"])).toBe(false);
  });

  it("rejects duplicates and invalid symbols without silent copy", () => {
    const dup = parseOpportunityUniverse(["NVDA", "mu", "NVDA"]);
    expect(dup.tickers).toEqual(["NVDA", "MU"]);
    expect(dup.errors[0]).toBe("Duplicate ticker detected: NVDA");
    const bad = parseOpportunityUniverse(["NVDA", "@@@"]);
    expect(bad.errors[0]).toMatch(/Invalid or unsupported ticker: @@@/);
    expect(bad.tickers).toEqual(["NVDA"]);
  });
});

describe("opportunity engine", () => {
  it("returns INSUFFICIENT DATA when bars are missing", () => {
    const row = analyzeOpportunityTicker({
      symbol: "MU",
      bars: {},
      regime: bullRegime,
    });
    expect(row.state).toBe("INSUFFICIENT DATA");
    expect(row.breakoutScore).toBeNull();
    expect(row.rrLabel).toBe("R:R: N/A");
  });

  it("does not invent a trade when structure is weak", () => {
    const down = Array.from({ length: 70 }, (_, i) => 120 - i * 0.8);
    const row = analyzeOpportunityTicker({
      symbol: "DELL",
      bars: { "1d": bars("DELL", down), "30m": bars("DELL", down, "30m", 200_000) },
      spyDaily: rising(70, 400),
      qqqDaily: rising(70, 380),
      regime: { ...bullRegime, label: "BEARISH", explanation: "Hostile" },
    });
    expect(["NO TRADE", "DEVELOPING", "INSUFFICIENT DATA"]).toContain(row.state);
    expect(row.tradeReadiness === "NO TRADE" || (row.technicalQuality ?? 0) < 80).toBe(true);
  });

  it("flags a developing / pre-breakout setup near resistance with HH/HL", () => {
    const closes = [...rising(55, 70), ...Array.from({ length: 20 }, () => 90.4)];
    const daily = bars("MU", closes, "1d", 2_000_000);
    daily[40].high = 91.6;
    daily[40].close = 90.2;
    const row = analyzeOpportunityTicker({
      symbol: "MU",
      bars: {
        "1d": daily,
        "30m": bars("MU", closes, "30m", 2_400_000),
        "15m": bars("MU", closes, "15m", 2_200_000),
        "5m": bars("MU", closes.slice(-40), "5m", 2_100_000),
        "1w": bars("MU", rising(40, 50), "1w"),
      },
      spyDaily: rising(80, 400),
      qqqDaily: rising(80, 380),
      sectorDaily: rising(80, 200),
      news: [{ headline: "Micron wins major AI contract", source: "Test", published_at: new Date().toISOString() }],
      regime: bullRegime,
    });
    expect(["DEVELOPING", "PRE-BREAKOUT", "TRIGGERED", "CONFIRMED", "RETEST", "ACTIVE"]).toContain(row.state);
    expect(row.whyNow.length).toBeGreaterThan(0);
    expect(row.nextTrigger).toMatch(/close above/i);
    expect(row.volume).not.toMatch(/Breakout Volume(?!.*Confirmed|.*Detected)/);
    expect(row.volumeDetail.breakoutVolume === "NOT YET CONFIRMED" || row.state !== "PRE-BREAKOUT").toBeTruthy();
    expect(row.technicalQuality).not.toBeNull();
    expect(row.tradeReadiness).toBeTruthy();
    expect(row.swingScore).not.toBe(row.technicalQuality);
    expect(row.t1Source).not.toMatch(/Measured move/i);
    expect(row.t2Source).not.toMatch(/Measured move/i);
    expect(row.t3Source).not.toMatch(/Measured move/i);
    if (row.rr === 1) {
      expect(row.t1).not.toBeNull();
      expect(row.stop).not.toBeNull();
      expect(row.entry).not.toBeNull();
      expect(Math.abs((row.t1! - row.entry!) - (row.entry! - row.stop!))).toBeLessThan(0.05);
    }
    expect(scoreBand(86)).toBe("Strong Setup");
  });

  it("does not invent a 1:1 R:R when no higher structural target exists", () => {
    const closes = Array.from({ length: 40 }, () => 100 + Math.sin(Math.random()) * 0.2);
    const daily = bars("AAPL", closes);
    daily[daily.length - 1].high = 100.4;
    const row = analyzeOpportunityTicker({
      symbol: "AAPL",
      bars: { "1d": daily, "30m": bars("AAPL", closes, "30m") },
      regime: bullRegime,
    });
    expect(row.t1Source).not.toMatch(/Measured move/i);
    if (row.rr != null) {
      expect(row.t1).not.toBeNull();
      expect(row.stop).not.toBeNull();
      expect(row.entry).not.toBeNull();
    } else {
      expect(row.rrLabel).toBe("R:R: N/A");
    }
  });

  it("does not let poor R:R become high trade readiness", () => {
    const ready = readinessFromParts({
      technical: 81,
      entry: 72,
      rr: 0.24,
      minRR: 1.5,
      vwapOk: true,
      overextended: false,
      regime: "BULLISH",
      negativeCatalyst: false,
      conflict: false,
      state: "PRE-BREAKOUT",
    });
    expect(["VERY LOW", "LOW", "NO TRADE"]).toContain(ready.label);
    expect(ready.score).toBeLessThan(52);
  });

  it("classifies catalysts and relative strength without prediction language", () => {
    expect(classifyCatalyst("Company beats and raises guidance").type).toBe("Positive");
    expect(classifyCatalyst("Regulator opens probe after earnings miss").type).toBe("Negative");
    expect(classifyRelativeStrength(8, 2)).toBe("Outperforming");
    expect(classifyRelativeStrength(-4, 1)).toBe("Deteriorating");
    const snap = snapshotTimeframe(bars("SPY", rising(50, 400)));
    const regime = assessMarketRegime({ spy: snap, qqq: snap });
    expect(["BULLISH", "NEUTRAL", "CAUTIOUS", "BEARISH"]).toContain(regime.label);
    expect(regime.explanation).not.toMatch(/will go up|guaranteed/i);
  });
});
