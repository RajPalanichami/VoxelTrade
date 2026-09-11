import { describe, expect, it } from "vitest";
import {
  TIMEFRAMES,
  TIMEFRAME_SPECS,
  assertIntradayYahooLookback,
  getTimeframeSpec,
  yahooChartWindows,
} from "@/src/config/timeframes";

const DAY = 86_400;

describe("timeframe mapping", () => {
  it("exposes every Signal Analyzer interval", () => {
    expect(TIMEFRAMES).toEqual(["5m", "30m", "1h", "4h", "1d"]);
  });

  it("keeps Yahoo 5m/30m lookbacks within the 60-day cap", () => {
    for (const id of ["5m", "30m"] as const) {
      const spec = TIMEFRAME_SPECS[id];
      expect(spec.yahooLookbackSec).toBeLessThanOrEqual(60 * DAY);
      expect(spec.yahooLookbackSec).toBeGreaterThan(0);
      assertIntradayYahooLookback(spec);
      for (const fallback of spec.yahooFallbackLookbackSec) {
        expect(fallback).toBeLessThanOrEqual(60 * DAY);
      }
    }
  });

  it("maps 4h to hourly Yahoo candles for aggregation", () => {
    const spec = getTimeframeSpec("4h");
    expect(spec.yahooInterval).toBe("60m");
    expect(spec.resample).toBe("4h");
    expect(spec.twelveInterval).toBe("4h");
  });

  it("maps 1h to Yahoo 60m", () => {
    expect(getTimeframeSpec("1h").yahooInterval).toBe("60m");
  });

  it("builds period windows without a 3mo range", () => {
    for (const tf of TIMEFRAMES) {
      const windows = yahooChartWindows(tf);
      expect(windows.length).toBeGreaterThan(0);
      expect(windows[0].interval).toBe(TIMEFRAME_SPECS[tf].yahooInterval);
      expect(windows[0].lookbackSec).toBe(TIMEFRAME_SPECS[tf].yahooLookbackSec);
    }
  });

  it("rejects unknown timeframes", () => {
    expect(() => getTimeframeSpec("2h")).toThrow(/Unsupported timeframe/);
  });
});
