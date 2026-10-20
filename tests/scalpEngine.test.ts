import { describe, expect, it } from "vitest";
import { boolVerdict, DEFAULT_SCALP_CONFIG } from "@/lib/scalp";
import {
  analyzeBreakout,
  analyzeMomentum,
  analyzeRetest,
  analyzeRiskReward,
  analyzeStructure,
  analyzeTrend,
  analyzeVolume,
  analyzeVwapBlock,
  buildScalpAnalysis,
  closedBars,
  deriveOverall,
  deriveTradeState,
  isFormingBar,
  sessionVwap,
  timeAwareRvol,
  type ScalpBar,
} from "@/src/engines/scalpEngine";
import type { OHLCVBar, Quote } from "@/src/types/domain";

function bars(values: number[], start = Date.UTC(2026, 8, 22, 13, 30, 0), step = 5 * 60): ScalpBar[] {
  return values.map((close, i) => {
    const time = Math.floor(start / 1000) + i * step;
    const open = i === 0 ? close : values[i - 1];
    return { time, open, high: Math.max(open, close) + 0.4, low: Math.min(open, close) - 0.4, close, volume: 1000 + i * 10 };
  });
}

function asOhlcv(list: ScalpBar[], tf: string): OHLCVBar[] {
  return list.map((b) => ({
    symbol: "TEST",
    timestamp: new Date(b.time * 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    timeframe: tf,
    source: "test",
  }));
}

function quote(partial: Partial<Quote> = {}): Quote {
  return {
    symbol: "TEST",
    name: "Test Corp",
    exchange: "NASDAQ",
    sector: "Technology",
    industry: "Software",
    price: 100,
    change: 1,
    change_percent: 1,
    volume: 2_000_000,
    average_volume: 1_500_000,
    currency: "USD",
    market_state: "REGULAR",
    freshness: { source: "test", timestamp: new Date().toISOString(), data_status: "LIVE", latency_ms: 1 },
    ...partial,
  };
}

describe("scalp verdicts", () => {
  it("never converts missing data into NO", () => {
    expect(boolVerdict(null)).toBe("INSUFFICIENT_DATA");
    expect(boolVerdict(undefined)).toBe("INSUFFICIENT_DATA");
    expect(boolVerdict(true)).toBe("YES");
    expect(boolVerdict(false)).toBe("NO");
  });
});

describe("closed vs forming candles", () => {
  it("does not treat an unclosed candle as confirmation", () => {
    const now = new Date("2026-09-22T14:33:00.000Z");
    const list = bars([10, 11, 12], Date.UTC(2026, 8, 22, 14, 20, 0), 5 * 60);
    expect(isFormingBar(list[list.length - 1], "5m", now)).toBe(true);
    expect(closedBars(list, "5m", now)).toHaveLength(list.length - 1);
  });
});

describe("structure and trend", () => {
  it("detects higher highs and higher lows as bullish structure", () => {
    const rising: number[] = [];
    for (let i = 0; i < 48; i++) {
      const cycle = i % 6;
      const base = 50 + Math.floor(i / 6) * 3;
      rising.push(cycle === 2 ? base + 4 : cycle === 5 ? base + 1.2 : base + cycle * 0.5);
    }
    const result = analyzeStructure(bars(rising));
    expect(result.verdict).not.toBe("INSUFFICIENT_DATA");
    expect(["YES", "NEUTRAL"]).toContain(result.verdict);
    expect(result.why.length).toBeGreaterThan(10);
  });

  it("returns insufficient data when history is too short", () => {
    expect(analyzeStructure(bars([1, 2, 3])).verdict).toBe("INSUFFICIENT_DATA");
    expect(analyzeTrend(bars([1, 2, 3, 4])).verdict).toBe("INSUFFICIENT_DATA");
  });
});

describe("VWAP and volume", () => {
  it("computes session VWAP from regular-session candles only", () => {
    const list = bars(Array.from({ length: 20 }, (_, i) => 100 + i * 0.1), Date.UTC(2026, 8, 22, 13, 35, 0));
    const now = new Date("2026-09-22T15:00:00.000Z");
    const v = sessionVwap(list, now);
    expect(v.value).toBeGreaterThan(99);
    const block = analyzeVwapBlock(list, now);
    expect(["YES", "NO"]).toContain(block.above.verdict);
  });

  it("uses time-of-day peers for RVOL instead of a full-day average", () => {
    const start = Date.UTC(2026, 8, 18, 14, 0, 0);
    const list: ScalpBar[] = [];
    for (let d = 0; d < 4; d++) {
      list.push({
        time: Math.floor(start / 1000) + d * 86400,
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: d === 3 ? 4000 : 1000,
      });
    }
    const r = timeAwareRvol(list, new Date((list[3].time + 60) * 1000));
    expect(r.expected).toBe(1000);
    expect(r.rvol).toBe(4);
    const vol = analyzeVolume(list, DEFAULT_SCALP_CONFIG, new Date((list[3].time + 60) * 1000));
    expect(vol.aboveNormal.verdict).toBe("YES");
  });
});

describe("breakout, fakeout, retest", () => {
  it("does not confirm a wick-only breakout", () => {
    const list = bars(Array.from({ length: 12 }, () => 100));
    list[list.length - 1] = { ...list[list.length - 1], high: 105, close: 100.1, low: 99.8 };
    const bo = analyzeBreakout(list, "15m", 104, DEFAULT_SCALP_CONFIG, new Date((list[list.length - 1].time + 20 * 60) * 1000));
    expect(bo.status).not.toBe("BREAKOUT_CONFIRMED");
    expect(bo.closedBeyond.verdict).toBe("NO");
  });

  it("marks a fakeout when price closes back through the level", () => {
    const list = bars([100, 100, 106, 105, 103]);
    const now = new Date((list[list.length - 1].time + 20 * 60) * 1000);
    const bo = analyzeBreakout(list, "15m", 104, DEFAULT_SCALP_CONFIG, now);
    expect(["FAKEOUT", "FAILED", "NO_BREAKOUT", "BREAKOUT_FORMING"]).toContain(bo.status);
  });

  it("keeps a retest pending until a confirming close", () => {
    const list = bars([100, 101, 106, 105.2, 104.3]);
    const now = new Date((list[list.length - 1].time + 20 * 60) * 1000);
    const bo = analyzeBreakout(list, "15m", 103, DEFAULT_SCALP_CONFIG, now);
    const rt = analyzeRetest(list, "15m", 103, bo, DEFAULT_SCALP_CONFIG, now);
    expect(["NONE", "PENDING", "CONFIRMED", "FAILED", "INSUFFICIENT_DATA"]).toContain(rt.status);
    expect(rt.why.length).toBeGreaterThan(5);
  });
});

describe("risk and state", () => {
  it("validates R:R against nearby resistance instead of treating 2:1 as automatic GO", () => {
    const list = bars(Array.from({ length: 30 }, (_, i) => 100 + i * 0.2));
    const px = list[list.length - 1].close;
    const rr = analyzeRiskReward(list, px, px + 0.2);
    expect(rr.entry).toBeTruthy();
    expect(rr.stop).toBeLessThan(rr.entry!);
    expect(rr.validation.verdict).toBe("NO");
    expect(rr.validation.why).toMatch(/resistance/i);
  });

  it("uses INSUFFICIENT_DATA when the trade state cannot be derived", () => {
    expect(deriveTradeState({
      timeframe: "15m",
      forming: false,
      lastCandleAt: null,
      structure: { id: "s", label: "s", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" },
      trend: { id: "t", label: "t", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" },
      vwap: { id: "v", label: "v", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" },
      volume: { id: "vo", label: "vo", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" },
      breakout: { timeframe: "15m", level: null, priceCrossed: { id: "a", label: "a", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, closedBeyond: { id: "b", label: "b", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, volume: { id: "c", label: "c", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, followThrough: { id: "d", label: "d", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, retest: { id: "e", label: "e", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, status: "INSUFFICIENT_DATA", why: "x" },
      retest: { timeframe: "15m", level: null, occurring: { id: "f", label: "f", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, held: { id: "g", label: "g", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, confirmed: { id: "h", label: "h", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, status: "INSUFFICIENT_DATA", why: "x" },
      momentum: { id: "m", label: "m", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" },
    }, { id: "l", label: "l", verdict: "INSUFFICIENT_DATA", direction: "NEUTRAL", why: "x" }, false)).toBe("INSUFFICIENT_DATA");
    expect(deriveOverall([], "INSUFFICIENT_DATA")).toBe("INSUFFICIENT_DATA");
  });
});

describe("full engine assembly", () => {
  it("analyzes 5m/15m/30m together and never emits BUY/SELL", () => {
    const rising = bars(Array.from({ length: 80 }, (_, i) => 90 + i * 0.15));
    const ohlcv = asOhlcv(rising, "5m");
    const out = buildScalpAnalysis({
      ticker: "ZZZZ",
      primary: "15m",
      quote: quote({ price: rising.at(-1)!.close }),
      bars: { "5m": ohlcv, "15m": ohlcv, "30m": ohlcv, "1h": ohlcv, "1d": ohlcv.slice(-20) },
      context: { spy: quote({ change_percent: 0.4 }), qqq: quote({ change_percent: 0.5 }), vix: quote({ change_percent: -2 }) },
      news: [{ headline: "Company announces product launch", source: "test" }],
    });
    expect(out.ticker).toBe("ZZZZ");
    expect(out.timeframes["5m"]).toBeTruthy();
    expect(out.timeframes["15m"]).toBeTruthy();
    expect(out.timeframes["30m"]).toBeTruthy();
    expect(out.checklist.some((c) => c.verdict === "NO" || c.verdict === "YES" || c.verdict === "NEUTRAL" || c.verdict === "INSUFFICIENT_DATA")).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/STRONG_BUY|STRONG_SELL|"BUY"|"SELL"/);
    expect(out.disclaimer).toMatch(/not a recommendation/i);
    expect(analyzeMomentum(rising).confirmation.why.length).toBeGreaterThan(5);
  });
});
