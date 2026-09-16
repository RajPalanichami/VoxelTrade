import { describe, expect, it } from "vitest";
import { MAG7_COMPARE_TIMEFRAMES, MAG7_COMPARE_UNIVERSE } from "@/lib/mag7Compare";
import { normalizeMag7CompareTimeframe, parseBasketTickers } from "@/src/services/mag7Compare";
import { MAG7_SYMBOLS } from "@/src/engines/mag7Score";
import { COMPARE_SPECS } from "@/src/engines/compareEngine";

describe("mag7 compare", () => {
  it("covers the same seven Mag 7 symbols as the existing Mag 7 page", () => {
    const symbols = MAG7_COMPARE_UNIVERSE.map(([s]) => s);
    expect(symbols).toHaveLength(7);
    expect(new Set(symbols)).toEqual(new Set(MAG7_SYMBOLS));
  });

  it("accepts Mag 7 comparison timeframes including monthly without changing Signal Analyzer TFs", () => {
    expect(normalizeMag7CompareTimeframe("4h")).toBe("4h");
    expect(normalizeMag7CompareTimeframe("Daily")).toBe("1d");
    expect(normalizeMag7CompareTimeframe("monthly")).toBe("1M");
    expect(MAG7_COMPARE_TIMEFRAMES).toEqual(["15m", "30m", "1h", "4h", "1d", "1w", "1M"]);
    expect(() => normalizeMag7CompareTimeframe("5m")).toThrow(/Unsupported timeframe/);
  });

  it("reuses the Ticker Comparison indicator registry", () => {
    expect(COMPARE_SPECS.length).toBeGreaterThanOrEqual(150);
  });

  it("validates custom comparison tickers without hardcoded defaults", () => {
    expect(parseBasketTickers(["nvda", "AMD", "AAPL"])).toEqual(["NVDA", "AMD", "AAPL"]);
    expect(() => parseBasketTickers([])).toThrow(/At least one ticker/);
    expect(() => parseBasketTickers(["AAPL", "AAPL"])).toThrow(/Duplicate ticker/);
    expect(() => parseBasketTickers(["AAPL", "MSFT", "NVDA", "AMD", "TSLA", "META", "AMZN", "GOOGL", "AVGO", "MU", "PLTR"])).toThrow(/maximum of 10/);
    expect(() => parseBasketTickers(["ZZZ$$$"])).toThrow(/Invalid ticker/);
  });
});
