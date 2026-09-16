import { describe, expect, it } from "vitest";
import { computeAll, last } from "@/src/engines/indicators";
import { calculateLevels } from "@/src/engines/supportResistance";
import { SWING_STRATEGY_DEFS, fibonacciRetracements } from "@/src/engines/swingStrategies";
import { toFrame } from "@/src/providers/base";
import { assembleSwingAnalysis } from "@/src/services/swing";
import { emptyIndicators } from "@/src/types/domain";
import type { OHLCVBar, Quote } from "@/src/types/domain";
import type { SwingTimeframe } from "@/src/config/timeframes";

function quote(price: number): Quote {
  return {
    symbol: "TEST",
    name: "Test Co",
    exchange: "NASDAQ",
    sector: "Technology",
    industry: "Software",
    price,
    currency: "USD",
    market_state: "REGULAR",
    freshness: { source: "test", timestamp: new Date().toISOString(), data_status: "LIVE", latency_ms: 1 },
  };
}

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

function uptrend(n = 220, sweep = false): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    const open = close;
    close = close + 0.35 + (i % 11 === 0 ? -0.8 : 0);
    const high = Math.max(open, close) + 0.45;
    const low = Math.min(open, close) - 0.35;
    bars.push(bar(i, open, high, low, close, 900_000 + i * 2500));
  }
  if (sweep) {
    const lastBar = bars[bars.length - 1];
    const priorLow = Math.min(...bars.slice(-40, -1).map((b) => b.low));
    lastBar.low = priorLow - 1.8;
    lastBar.close = priorLow + 0.6;
    lastBar.open = priorLow + 0.2;
    lastBar.high = lastBar.close + 0.4;
  }
  return bars;
}

function snapshot(bars: OHLCVBar[]) {
  const framed = computeAll(toFrame(bars));
  const lastRow = framed.rows[framed.rows.length - 1];
  const prev = framed.rows.length > 1 ? framed.rows[framed.rows.length - 2] : lastRow;
  const num = (row: typeof lastRow, col: string) => {
    const v = row[col];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const ind = emptyIndicators({
    ema9: last(framed.get("ema9")),
    ema20: last(framed.get("ema20")),
    ema21: last(framed.get("ema21")),
    ema50: last(framed.get("ema50")),
    ema200: last(framed.get("ema200")),
    rsi: last(framed.get("rsi")),
    rsi_prev: num(prev, "rsi"),
    macd: last(framed.get("macd")),
    macd_signal: last(framed.get("macd_signal")),
    macd_hist: last(framed.get("macd_hist")),
    vwap: last(framed.get("vwap")),
    atr: last(framed.get("atr")),
    bb_upper: last(framed.get("bb_upper")),
    bb_mid: last(framed.get("bb_mid")),
    bb_lower: last(framed.get("bb_lower")),
    volume_sma20: last(framed.get("volume_sma20")),
    volume_ratio: last(framed.get("volume_ratio")),
    last_volume: Number(lastRow.volume),
    last_close: Number(lastRow.close),
    last_high: Number(lastRow.high),
    last_low: Number(lastRow.low),
  });
  const levels = calculateLevels(toFrame(bars), ind, ind.last_close || 0);
  return { ind, levels, price: ind.last_close || 0 };
}

function analyze(bars: OHLCVBar[], timeframe: SwingTimeframe, higherTrend: "BULLISH" | "BEARISH" | "NEUTRAL" = "BULLISH") {
  const { ind, levels, price } = snapshot(bars);
  return assembleSwingAnalysis({
    symbol: "TEST",
    timeframe,
    quote: quote(price),
    bars,
    indicators: ind,
    levels,
    higherTrend,
    source: "test",
    latencyMs: 5,
  });
}

describe("swing strategies", () => {
  it("defines 10 named methodologies", () => {
    expect(SWING_STRATEGY_DEFS).toHaveLength(10);
    expect(SWING_STRATEGY_DEFS.map((d) => d.id)).toEqual([
      "ellipse",
      "swing-sr",
      "fibonacci",
      "liquidity-sweep",
      "liquidity-analysis",
      "swing-algo",
      "big-trend",
      "mtf-swing",
      "weighted",
      "target-isolator",
    ]);
  });

  it("computes Fibonacci retracements from the swing range", () => {
    const fib = fibonacciRetracements(200, 100);
    expect(fib.high).toBe(200);
    expect(fib.low).toBe(100);
    expect(fib.r500).toBe(150);
    expect(fib.r618).toBeCloseTo(138.2, 1);
    expect(fib.r382).toBeCloseTo(161.8, 1);
  });

  it("returns all 10 strategies with scores in 0-100 and the requested timeframe", () => {
    const daily = analyze(uptrend(220, true), "1d");
    expect(daily.timeframe).toBe("1d");
    expect(daily.timeframe_label).toBe("Daily");
    expect(daily.strategies).toHaveLength(10);
    for (const row of daily.strategies) {
      expect(row.score).toBeGreaterThanOrEqual(0);
      expect(row.score).toBeLessThanOrEqual(100);
      expect(row.why.length).toBeGreaterThan(20);
    }
    expect(daily.summary.overallScore).toBeGreaterThanOrEqual(0);
    expect(daily.summary.overallScore).toBeLessThanOrEqual(100);
    const times = daily.bars.map((b) => b.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
  });

  it("does not invent an entry when the setup is NO TRADE", () => {
    const mid = analyze(uptrend(220, false), "15m", "NEUTRAL");
    const ellipse = mid.strategies.find((s) => s.id === "ellipse")!;
    if (ellipse.signal === "NO_TRADE" || !ellipse.plan.allowed) {
      expect(ellipse.plan.entry).toBeNull();
      expect(ellipse.plan.stop).toBeNull();
      expect(ellipse.whenEnter).toMatch(/No Trade/i);
    }
    const sweep = mid.strategies.find((s) => s.id === "liquidity-sweep")!;
    expect(sweep.signal).toBe("NO_TRADE");
    expect(sweep.plan.allowed).toBe(false);
    expect(sweep.plan.entry).toBeNull();
    expect(sweep.why).toMatch(/No sweep/i);
  });

  it("recalculates the payload identity when the timeframe changes", () => {
    const bars = uptrend(220, true);
    const m15 = analyze(bars, "15m");
    const h4 = analyze(bars, "4h");
    const daily = analyze(bars, "1d");
    const weekly = analyze(bars, "1w");
    expect(new Set([m15.timeframe, h4.timeframe, daily.timeframe, weekly.timeframe]).size).toBe(4);
    expect(m15.timeframe_label).toBe("15 Minutes");
    expect(h4.timeframe_label).toBe("4 Hours");
    expect(daily.timeframe_label).toBe("Daily");
    expect(weekly.timeframe_label).toBe("Weekly");
    expect(m15.summary.action).toMatch(/15 Minute/i);
    expect(h4.summary.action).toMatch(/4 Hour/i);
  });

  it("marks a liquidity sweep when the last bar wicks beyond then reclaims", () => {
    const result = analyze(uptrend(220, true), "4h");
    const sweep = result.strategies.find((s) => s.id === "liquidity-sweep")!;
    expect(sweep.overlays.liquidity).toBe(true);
    if (sweep.plan.allowed) {
      expect(sweep.signal).toBe("BULLISH");
      expect(sweep.plan.entry).toBeGreaterThan(0);
      expect(sweep.plan.stop).toBeLessThan(sweep.plan.entry!);
      expect(sweep.plan.target1).toBeGreaterThan(sweep.plan.entry!);
      expect(sweep.plan.riskReward).toBeGreaterThan(0);
    } else {
      expect(sweep.signal).toBe("NO_TRADE");
    }
  });
});
