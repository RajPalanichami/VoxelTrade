import { afterEach, describe, expect, it } from "vitest";
import { keys, parseApiError } from "@/lib/api";
import { matchesSelection } from "@/components/dashboard/SignalDashboard";
import { dispatchV1, normalizeTimeframe } from "@/src/server/apiRouter";
import { analysis, asDate, reviveBars } from "@/src/services/analysis";
import { cacheClear, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";

describe("Signal Analyzer API contract", () => {
  it("includes ticker and timeframe in the React Query key", () => {
    expect(keys.analysis("AAPL", "30m")).toEqual(["analysis", "AAPL", "30m"]);
    expect(keys.analysis("MSFT", "1h")).not.toEqual(keys.analysis("MSFT", "4h"));
    expect(keys.analysis("NVDA", "1d")).not.toEqual(keys.analysis("TSLA", "1d"));
  });

  it("parses FastAPI-style JSON errors for the UI", () => {
    expect(parseApiError('{"detail":"Yahoo HTTP 422"}')).toBe("Yahoo HTTP 422");
    expect(parseApiError("Unable to retrieve enough market data for the selected timeframe.")).toBe(
      "Unable to retrieve enough market data for the selected timeframe.",
    );
    expect(parseApiError("{", 502)).toBe("Request failed 502");
  });

  it("does not treat previous ticker or timeframe results as current", () => {
    const aaplHour = { quote: { symbol: "AAPL" }, signal: { timeframe: "1h" } };
    expect(matchesSelection(aaplHour as never, "AAPL", "1h")).toBe(true);
    expect(matchesSelection(aaplHour as never, "AAPL", "30m")).toBe(false);
    expect(matchesSelection(aaplHour as never, "MSFT", "1h")).toBe(false);
    expect(matchesSelection(undefined, "AAPL", "1h")).toBe(false);
  });

  it("revives ISO timestamps after JSON cache", () => {
    const bars = reviveBars([
      {
        symbol: "AAPL",
        timestamp: "2026-09-10T14:30:00.000Z" as unknown as Date,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1,
        timeframe: "30m",
        source: "yfinance",
      },
    ]);
    expect(bars[0].timestamp).toBeInstanceOf(Date);
    expect(asDate(bars[0].timestamp).toISOString()).toBe("2026-09-10T14:30:00.000Z");
  });

  it("rejects unsupported timeframes", async () => {
    const res = await dispatchV1(new Request("http://localhost/api/v1/stocks/AAPL/analysis?timeframe=2h"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/Unsupported timeframe/);
  });

  it("accepts UI aliases for the four core timeframes", () => {
    expect(normalizeTimeframe("30minutes")).toBe("30m");
    expect(normalizeTimeframe("60m")).toBe("1h");
    expect(normalizeTimeframe("4hours")).toBe("4h");
    expect(normalizeTimeframe("daily")).toBe("1d");
  });

  it("does not accept swing-only intervals on Signal Analyzer routes", async () => {
    expect(() => normalizeTimeframe("15m")).toThrow(/Unsupported timeframe/);
    const res = await dispatchV1(new Request("http://localhost/api/v1/stocks/AAPL/analysis?timeframe=15m"));
    expect(res.status).toBe(400);
  });
});

describe("Signal Analyzer cached market data", () => {
  afterEach(() => {
    cacheClear();
  });

  it("revives ISO timestamps from the JSON cache before analysis", async () => {
    cacheSet(
      "bars:AAPL:30m",
      {
        payload: [
          {
            symbol: "AAPL",
            timestamp: "2026-09-10T14:30:00.000Z",
            open: 1,
            high: 2,
            low: 0.5,
            close: 1.5,
            volume: 100,
            timeframe: "30m",
            source: "yfinance",
          },
        ],
        source: "yfinance",
      },
      60,
    );
    const [bars] = await analysis.bars("AAPL", "30m");
    expect(bars[0].timestamp).toBeInstanceOf(Date);
    expect(asDate(bars[0].timestamp).toISOString()).toBe("2026-09-10T14:30:00.000Z");
  });

  it("returns a clean error when fewer than 15 candles are available", async () => {
    const short = Array.from({ length: 8 }, (_, i) => ({
      symbol: "FAKE",
      timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      open: 10,
      high: 11,
      low: 9,
      close: 10.5,
      volume: 1000,
      timeframe: "1d",
      source: "yfinance",
    }));
    cacheSet("bars:FAKE:1d", { payload: short, source: "yfinance" }, 60);
    await expect(analysis.indicators("FAKE", "1d")).rejects.toBeInstanceOf(HttpError);
    await expect(analysis.indicators("FAKE", "1d")).rejects.toThrow(/enough market data/);
  });
});
