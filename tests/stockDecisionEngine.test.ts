import { describe, expect, it } from "vitest";
import { emptyIndicators, emptyLevels, type OHLCVBar, type Quote } from "@/src/types/domain";
import {
  assembleStockDecision,
  classifyBreakout,
  classifyStructure,
  decideAction,
  estimateBarFlow,
  volumePriceMatrix,
} from "@/src/engines/stockDecisionEngine";
import { isStockDecisionTimeframe } from "@/lib/stockDecision";
import { normalizeStockDecisionTimeframe } from "@/src/services/stockDecision";

function bar(partial: Partial<OHLCVBar> & { close: number; open: number; volume: number }): OHLCVBar {
  return {
    symbol: "META",
    timestamp: new Date("2026-10-01T14:30:00Z"),
    high: Math.max(partial.open, partial.close) + 1,
    low: Math.min(partial.open, partial.close) - 1,
    timeframe: "15m",
    source: "test",
    ...partial,
  };
}

function quote(partial: Partial<Quote> = {}): Quote {
  return {
    symbol: "META",
    name: "Meta Platforms",
    exchange: "NASDAQ",
    sector: "Communication Services",
    industry: "Internet",
    price: 725.93,
    change: 0.8,
    change_percent: 0.11,
    currency: "USD",
    market_state: "REGULAR",
    freshness: { source: "test", timestamp: new Date().toISOString(), data_status: "LIVE", latency_ms: 12 },
    ...partial,
  };
}

describe("stock decision timeframe", () => {
  it("defaults blank timeframe to daily and accepts 1M monthly", () => {
    expect(normalizeStockDecisionTimeframe(undefined)).toBe("1d");
    expect(normalizeStockDecisionTimeframe("daily")).toBe("1d");
    expect(normalizeStockDecisionTimeframe("1M")).toBe("1M");
    expect(isStockDecisionTimeframe("1M")).toBe(true);
    expect(normalizeStockDecisionTimeframe("15min")).toBe("15m");
  });

  it("rejects 1-minute bars because they are not a primary bar spec", () => {
    expect(() => normalizeStockDecisionTimeframe("1m")).toThrow(/Unsupported timeframe/);
  });
});

describe("volume interpretation", () => {
  it("does not treat declining volume as a sell forecast", () => {
    const flatLow = volumePriceMatrix(0.05, 0.6);
    expect(flatLow.text).toMatch(/does not independently establish direction/);
    expect(flatLow.text).not.toMatch(/will go down/i);
  });

  it("labels a high-volume decline as participation, not a guaranteed drop", () => {
    expect(volumePriceMatrix(-1.2, 1.8).text).toMatch(/potential distribution/);
  });
});

describe("breakout confirmation", () => {
  it("rejects a wick through resistance without a completed close", () => {
    const result = classifyBreakout(741.2, 739.4, 740, 1.5);
    expect(result.closeConfirmed).toBe(false);
    expect(result.status).toBe("NOT_CONFIRMED");
    expect(result.note).toMatch(/wick is not confirmation/i);
  });

  it("requires volume after a close above resistance", () => {
    const result = classifyBreakout(741.2, 741.2, 740, 0.7);
    expect(result.status).toBe("BREAKOUT_PENDING");
    expect(result.volumeConfirmed).toBe(false);
  });
});

describe("structure and flow", () => {
  it("classifies completed HH/HL as bullish", () => {
    expect(classifyStructure(emptyIndicators({ higher_highs: true, higher_lows: true })).label).toBe("BULLISH");
  });

  it("keeps mixed swings in transition instead of forcing a side", () => {
    expect(classifyStructure(emptyIndicators({ higher_highs: true, lower_lows: true })).label).toBe("TRANSITION");
  });

  it("estimates delta from completed up and down bars only", () => {
    const flow = estimateBarFlow([
      bar({ open: 10, close: 11, volume: 1000 }),
      bar({ open: 11, close: 10, volume: 400 }),
    ]);
    expect(flow.estimatedBuy).toBe(1000);
    expect(flow.estimatedSell).toBe(400);
    expect(flow.delta).toBe(600);
  });
});

describe("decision hierarchy", () => {
  it("does not turn broken structure into a buy setup", () => {
    const decided = decideAction({
      quality: 80,
      structure: "BEARISH",
      stale: false,
      bars: 80,
      breakout: "NOT_CONFIRMED",
      rvol: 1.4,
      vwapState: "ABOVE",
      rr: 2.5,
      eventHigh: false,
      noTrade: [],
    });
    expect(decided.action).toBe("NO_TRADE");
    expect(decided.direction).toBe("BEARISH");
  });

  it("returns insufficient data when the quote is stale", () => {
    const decided = decideAction({
      quality: 25,
      structure: "BULLISH",
      stale: true,
      bars: 80,
      breakout: "BREAKOUT_CONFIRMED",
      rvol: 1.5,
      vwapState: "ABOVE",
      rr: 2,
      eventHigh: false,
      noTrade: [],
    });
    expect(decided.action).toBe("INSUFFICIENT_DATA");
  });

  it("keeps a pending breakout in WATCH", () => {
    const decided = decideAction({
      quality: 80,
      structure: "BULLISH",
      stale: false,
      bars: 80,
      breakout: "BREAKOUT_PENDING",
      rvol: 0.9,
      vwapState: "ABOVE",
      rr: 1.2,
      eventHigh: false,
      noTrade: [],
    });
    expect(decided.action).toBe("WATCH");
    expect(decided.setup).toBe("BREAKOUT");
  });
});

describe("assembled map honesty", () => {
  it("marks order book and tape unavailable and keeps volume language honest", () => {
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar({
        open: 100 + i * 0.1,
        close: 100.2 + i * 0.1,
        volume: 10_000 + i,
        timestamp: new Date(Date.UTC(2026, 8, 1, 14, i)),
      }),
    );
    const map = assembleStockDecision({
      symbol: "META",
      name: "Meta Platforms",
      timeframe: "15m",
      quote: quote(),
      bars,
      indicators: emptyIndicators({
        last_close: 725.93,
        ema21: 720,
        vwap: 724.8,
        volume_ratio: 0.7,
        higher_highs: true,
        higher_lows: true,
        atr: 4,
      }),
      levels: emptyLevels({ r1: 740, s1: 715, vwap: 724.8 }),
      context: null,
      dailyBars: bars,
      market: { spy: 0.2, qqq: 0.6, iwm: 0.1, vix: 16.2 },
      mtf: [],
      eventRisk: { label: "NORMAL", detail: "No high-impact event." },
    });
    expect(map.orderBook.available).toBe(false);
    expect(map.dataQuality.orderBook).toBe("UNAVAILABLE");
    expect(map.dataQuality.timeAndSales).toBe("UNAVAILABLE");
    expect(map.orderFlow.disclaimer).toMatch(/estimated aggressive buy\/sell/i);
    expect(map.volume.interpretation).not.toMatch(/therefore the stock will go down/i);
    expect(map.action === "WATCH" || map.action === "WAIT" || map.action === "NO_TRADE" || map.action === "INSUFFICIENT_DATA" || map.action === "BUY_SETUP").toBe(true);
    expect(map.plan.rr == null || map.plan.rrNote.includes(":1")).toBe(true);
    expect(map.summary.decision).toMatch(/Bullish|Neutral|Bearish|Caution/);
    expect(map.summary.score).toBeGreaterThanOrEqual(0);
    expect(map.summary.score).toBeLessThanOrEqual(100);
    expect(map.summary.factors.length).toBeGreaterThanOrEqual(12);
  });
});
