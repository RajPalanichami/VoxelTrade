import { describe, expect, it } from "vitest";
import { instantFromEastern } from "@/src/lib/easternTime";
import { classifyMarketSession, isNyseHoliday, nyseEarlyCloseMinutes } from "@/src/engines/marketSessions";
import { assembleTickerMarketContext, classifyLevelState, previousRegularCloseFromDaily, summarizeSession, type SessionBar } from "@/src/engines/extendedHours";
import { sessionWindows } from "@/src/engines/marketSessions";

describe("US equity session classification", () => {
  it("maps the required Eastern-time boundaries", () => {
    expect(classifyMarketSession(instantFromEastern(2026, 9, 25, 3, 59))).toBe("OVERNIGHT");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 25, 4, 0))).toBe("PRE_MARKET");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 25, 9, 29))).toBe("PRE_MARKET");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 25, 9, 30))).toBe("REGULAR");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 25, 15, 59))).toBe("REGULAR");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 25, 16, 0))).toBe("AFTER_HOURS");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 25, 19, 59))).toBe("AFTER_HOURS");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 25, 20, 0))).toBe("OVERNIGHT");
  });

  it("closes weekends except the Sunday overnight open and leftover Friday overnight", () => {
    expect(classifyMarketSession(instantFromEastern(2026, 9, 26, 2, 0))).toBe("OVERNIGHT");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 26, 10, 0))).toBe("CLOSED");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 27, 12, 0))).toBe("CLOSED");
    expect(classifyMarketSession(instantFromEastern(2026, 9, 27, 20, 0))).toBe("OVERNIGHT");
  });

  it("handles holidays, DST, and early closes", () => {
    expect(isNyseHoliday(instantFromEastern(2026, 12, 25, 12, 0))).toBe(true);
    expect(classifyMarketSession(instantFromEastern(2026, 12, 25, 12, 0))).toBe("CLOSED");
    expect(isNyseHoliday(instantFromEastern(2026, 4, 3, 12, 0))).toBe(true);
    expect(classifyMarketSession(instantFromEastern(2026, 3, 8, 9, 30))).toBe("CLOSED");
    expect(classifyMarketSession(instantFromEastern(2026, 3, 9, 9, 30))).toBe("REGULAR");
    expect(nyseEarlyCloseMinutes(instantFromEastern(2026, 11, 27, 10, 0))).toBe(13 * 60);
    expect(classifyMarketSession(instantFromEastern(2026, 11, 27, 13, 5))).toBe("AFTER_HOURS");
  });
});

function bar(time: Date, open: number, high: number, low: number, close: number, volume = 1000): SessionBar {
  return { time: Math.floor(time.getTime() / 1000), open, high, low, close, volume };
}

describe("extended-hours calculations", () => {
  it("computes premarket high/low/volume/VWAP only from premarket bars", () => {
    const now = instantFromEastern(2026, 9, 25, 10, 0);
    const windows = sessionWindows("2026-09-25");
    const bars = [
      bar(instantFromEastern(2026, 9, 25, 5, 0), 500, 507.42, 499, 501, 5000),
      bar(instantFromEastern(2026, 9, 25, 8, 0), 501, 517.48, 500, 516, 7840),
      bar(instantFromEastern(2026, 9, 25, 10, 0), 516, 519.4, 515, 518, 20000),
    ];
    const pre = summarizeSession("PRE_MARKET", bars, windows.preMarket, 497.93, now, "test");
    expect(pre.availability).toBe("AVAILABLE");
    expect(pre.high).toBeCloseTo(517.48);
    expect(pre.low).toBeCloseTo(499);
    expect(pre.volume).toBe(12840);
    expect(pre.vwap).toBeGreaterThan(500);
    expect(pre.high).not.toBe(519.4);
  });

  it("uses previous regular close from the prior daily bar", () => {
    const daily = [
      bar(instantFromEastern(2026, 9, 24, 16, 0), 495.07, 498.9, 491.22, 497.93),
      bar(instantFromEastern(2026, 9, 25, 16, 0), 499, 519, 497, 516),
    ];
    expect(previousRegularCloseFromDaily(daily, "2026-09-25")).toBeCloseTo(497.93);
  });

  it("marks NO_TRADES instead of INSUFFICIENT_DATA when a session produced no prints", () => {
    const now = instantFromEastern(2026, 9, 25, 10, 0);
    const windows = sessionWindows("2026-09-25");
    const on = summarizeSession("OVERNIGHT", [], windows.overnight, 497.93, now, "test");
    expect(on.availability).toBe("NO_TRADES");
    expect(on.high).toBeNull();
  });

  it("marks PROVIDER_UNAVAILABLE when the extended-hours feed fails", () => {
    const now = instantFromEastern(2026, 9, 25, 8, 0);
    const ctx = assembleTickerMarketContext({
      symbol: "MSFT",
      quotePrice: 516.69,
      daily: [bar(instantFromEastern(2026, 9, 24, 16, 0), 495, 498.9, 491.22, 497.93)],
      extendedBars: [],
      source: "quote",
      providerFailed: true,
      now,
    });
    expect(ctx.dataQuality.status).toBe("PROVIDER_UNAVAILABLE");
    expect(ctx.sessions.preMarket.availability).toBe("PROVIDER_UNAVAILABLE");
    expect(ctx.previousRegularClose).toBeCloseTo(497.93);
    expect(ctx.quote.change).toBeCloseTo(18.76, 1);
  });

  it("does not invent a premarket high from regular-session data", () => {
    const now = instantFromEastern(2026, 9, 25, 11, 0);
    const ctx = assembleTickerMarketContext({
      symbol: "MSFT",
      quotePrice: 516.69,
      daily: [bar(instantFromEastern(2026, 9, 24, 16, 0), 495, 498.9, 491.22, 497.93)],
      extendedBars: [bar(instantFromEastern(2026, 9, 25, 10, 0), 516, 519.4, 515, 516.69, 10000)],
      source: "test",
      now,
    });
    expect(ctx.sessions.preMarket.high).toBeNull();
    expect(ctx.sessions.preMarket.availability).toBe("NO_TRADES");
    expect(ctx.sessions.regular.high).toBeCloseTo(519.4);
  });
});

describe("level events", () => {
  it("tracks cross, reclaim, and lost without treating above as reclaimed", () => {
    const today = [
      bar(instantFromEastern(2026, 9, 25, 9, 35), 499.14, 505, 498, 504),
      bar(instantFromEastern(2026, 9, 25, 10, 0), 504, 517.5, 503, 516.69),
    ];
    const pdl = classifyLevelState("pdl", "Previous Day Low", 491.22, today, 516.69);
    expect(pdl.priceAboveLevel).toBe(true);
    expect(pdl.reclaimedToday).toBe(false);
    expect(pdl.status).toBe("ABOVE");

    const lost = classifyLevelState(
      "orh",
      "Opening Range High",
      517.48,
      [
        bar(instantFromEastern(2026, 9, 25, 9, 35), 510, 517.48, 509, 516),
        bar(instantFromEastern(2026, 9, 25, 10, 0), 516, 519.4, 515, 518),
        bar(instantFromEastern(2026, 9, 25, 11, 0), 518, 518.2, 516, 516.69),
      ],
      516.69,
    );
    expect(lost.crossedAbove).toBe(true);
    expect(lost.priceAboveLevel).toBe(false);
    expect(lost.status).toBe("LOST");
  });
});
