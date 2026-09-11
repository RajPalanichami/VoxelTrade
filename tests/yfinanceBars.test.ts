import { afterEach, describe, expect, it, vi } from "vitest";
import { YFinanceProvider } from "@/src/providers/yfinance";

function chartPayload(bars = 120) {
  const now = Math.floor(Date.now() / 1000);
  const ts = Array.from({ length: bars }, (_, i) => now - (bars - i) * 1800);
  const px = Array.from({ length: bars }, (_, i) => 100 + i * 0.1);
  return {
    chart: {
      result: [
        {
          timestamp: ts,
          indicators: {
            quote: [{ open: px, high: px.map((v) => v + 1), low: px.map((v) => v - 1), close: px, volume: Array(bars).fill(1_000_000) }],
          },
        },
      ],
    },
  };
}

function installFetch(handler: (url: URL) => unknown) {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "fc.yahoo.com" || url.pathname === "/") {
      return new Response("", { headers: { "set-cookie": "A=1; Path=/" } });
    }
    if (url.pathname.includes("getcrumb")) return new Response("abc");
    const payload = handler(url);
    if (payload instanceof Response) return payload;
    return Response.json(payload);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Yahoo bar requests", () => {
  it.each([
    ["30m", "30m", 60 * 86400],
    ["1h", "60m", 730 * 86400],
    ["4h", "60m", 730 * 86400],
    ["1d", "1d", 5 * 365 * 86400],
  ] as const)("uses a valid %s interval and lookback", async (tf, interval, maxLookback) => {
    let seen: URL | null = null;
    installFetch((url) => {
      if (url.pathname.includes("/v8/finance/chart/")) seen = url;
      return chartPayload();
    });
    const bars = await new YFinanceProvider().fetchBars("AAPL", tf);
    expect(bars.length).toBeGreaterThan(10);
    expect(seen).toBeTruthy();
    expect(seen!.searchParams.get("interval")).toBe(interval);
    expect(seen!.searchParams.get("range")).toBeNull();
    const lookback = Number(seen!.searchParams.get("period2")) - Number(seen!.searchParams.get("period1"));
    expect(lookback).toBeLessThanOrEqual(maxLookback);
    expect(lookback).toBeGreaterThan(0);
  });

  it("retries a shorter window after Yahoo 422", async () => {
    let chartCalls = 0;
    installFetch((url) => {
      if (!url.pathname.includes("/v8/finance/chart/")) return {};
      chartCalls += 1;
      if (chartCalls === 1) return new Response(JSON.stringify({ chart: { error: { description: "Invalid input" } } }), { status: 422 });
      return chartPayload();
    });
    const bars = await new YFinanceProvider().fetchBars("MSFT", "30m");
    expect(chartCalls).toBeGreaterThan(1);
    expect(bars.length).toBeGreaterThan(0);
  });

  it("maps a Yahoo 404 to a clean unknown-symbol error", async () => {
    installFetch(
      () =>
        new Response(JSON.stringify({ chart: { result: null, error: { description: "No data found, symbol may be delisted" } } }), {
          status: 404,
        }),
    );
    await expect(new YFinanceProvider().fetchQuote("INVALIDXYZ")).rejects.toThrow(/No market data found for this symbol/);
  });

  it("returns a clean error when Yahoo has no candles", async () => {
    installFetch(() => new Response(JSON.stringify({ chart: { result: null, error: { description: "Not found" } } }), { status: 422 }));
    await expect(new YFinanceProvider().fetchBars("ZZZZZ", "1d")).rejects.toThrow(/enough market data/);
  });
});
