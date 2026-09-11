import { describe, expect, it } from "vitest";
import { atr, classicPivots, ema, macd, rsi, vwap } from "@/src/engines/indicators";
import { applyHardFilters, classify, TF_WEIGHTS } from "@/src/engines/scoring";
import { buildPlans } from "@/src/engines/tradingPlan";
import { emptyIndicators, emptyLevels, emptyPlan } from "@/src/types/domain";

describe("indicators", () => {
  it("ema seeds after min periods and trends upward", () => {
    const prices = [...Array(5).fill(10), ...Array(10).fill(20)];
    const e = ema(prices, 5);
    expect(e.slice(0, 4).every((v) => v == null)).toBe(true);
    expect((e[e.length - 1] as number) > (e[5] as number)).toBe(true);
  });

  it("rsi stays in bounds and detects trends", () => {
    const up = Array.from({ length: 39 }, (_, i) => i + 1);
    const r = rsi(up, 14);
    expect((r.filter((v) => v != null).at(-1) as number) > 70).toBe(true);
    const down = Array.from({ length: 39 }, (_, i) => 40 - i);
    const r2 = rsi(down, 14);
    expect((r2.filter((v) => v != null).at(-1) as number) < 30).toBe(true);
    expect(r.filter((v): v is number => v != null).every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it("macd histogram is positive on an exponential uptrend", () => {
    const close = Array.from({ length: 80 }, (_, i) => 100 + Math.exp(i / 3 / 10));
    const [line, sig, hist] = macd(close);
    const h = hist.filter((v): v is number => v != null).at(-1)!;
    const l = line.filter((v): v is number => v != null).at(-1)!;
    const s = sig.filter((v): v is number => v != null).at(-1)!;
    expect(h).toBeGreaterThan(0);
    expect(l).toBeGreaterThan(s);
  });

  it("vwap resets by session date", () => {
    const idx = [
      new Date("2024-01-02T14:30:00Z"),
      new Date("2024-01-02T15:00:00Z"),
      new Date("2024-01-03T14:30:00Z"),
      new Date("2024-01-03T15:00:00Z"),
    ];
    const vals = [10, 12, 20, 22];
    const out = vwap(vals, vals, vals, [100, 100, 100, 100], idx);
    expect(out[2]).toBe(20);
    expect(out[3]).toBe(21);
  });

  it("atr is positive", () => {
    const n = 30;
    const h = Array.from({ length: n }, (_, i) => 11 + (9 * i) / (n - 1));
    const l = Array.from({ length: n }, (_, i) => 9 + (9 * i) / (n - 1));
    const c = Array.from({ length: n }, (_, i) => 10 + (9 * i) / (n - 1));
    const a = atr(h, l, c, 14);
    expect((a.filter((v): v is number => v != null).at(-1) as number) > 0).toBe(true);
  });

  it("classic pivots identity", () => {
    const p = classicPivots(12, 8, 10);
    expect(Math.abs(p.pivot - 10)).toBeLessThan(1e-9);
    expect(p.r1).toBeGreaterThan(p.pivot);
    expect(p.pivot).toBeGreaterThan(p.s1);
    expect(p.r3).toBeGreaterThan(p.r2);
    expect(p.r2).toBeGreaterThan(p.r1);
    expect(p.s3).toBeLessThan(p.s2);
    expect(p.s2).toBeLessThan(p.s1);
  });
});

describe("scoring", () => {
  it("classifies score bands", () => {
    expect(classify(90)).toBe("STRONG_BUY");
    expect(classify(80)).toBe("BUY");
    expect(classify(70)).toBe("WAIT");
    expect(classify(55)).toBe("WEAK");
    expect(classify(40)).toBe("SELL");
  });

  it("timeframe weights sum to 100", () => {
    for (const [tf, w] of Object.entries(TF_WEIGHTS)) {
      expect(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 100)).toBeLessThan(1e-6);
      void tf;
    }
    expect(TF_WEIGHTS["5m"].fundamentals).toBeLessThan(TF_WEIGHTS["1d"].fundamentals);
    expect(TF_WEIGHTS["5m"].price_trend).toBeGreaterThan(TF_WEIGHTS["1d"].price_trend);
  });

  it("past earnings does not block a buy", () => {
    const plan = emptyPlan({ bias: "BULLISH", setup: "test", risk_reward: 2.5, trade_allowed: true });
    const ind = emptyIndicators({ last_close: 100, volume_ratio: 1.5 });
    const levels = emptyLevels({ r1: 102, s1: 98 });
    const [label, blocks] = applyHardFilters("BUY", 80, ind, levels, plan, { spx_change_pct: 0.2 }, { days_to_earnings: -30 }, false, false);
    expect(label).toBe("BUY");
    expect(blocks.some((b) => b.includes("Earnings"))).toBe(false);
  });

  it("blocks trade when R:R is below minimum", () => {
    const ind = emptyIndicators({ last_close: 100, atr: 1, ema9: 99.5, ema21: 99, vwap: 99.8, volume_ratio: 1.3 });
    const levels = emptyLevels({ s1: 99, s2: 98.5, s3: 97, r1: 100.4, r2: 100.8, r3: 101.2, pivot: 100 });
    const [longPlan] = buildPlans(ind, levels, "1h");
    if (longPlan.risk_reward != null && longPlan.risk_reward < 1.5) {
      expect(longPlan.trade_allowed).toBe(false);
      expect(longPlan.block_reason).toBeTruthy();
    }
  });
});
