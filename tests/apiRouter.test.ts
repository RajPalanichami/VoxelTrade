import fs from "fs";
import { describe, expect, it, vi } from "vitest";
import { dispatchV1, handleV1, normalizePatternTimeframe, normalizeScalpTimeframe, normalizeSwingTimeframe, normalizeTimeframe } from "@/src/server/apiRouter";
import { persistSnapshot, resetStoreForTests } from "@/src/repositories/store";

describe("api router", () => {
  it("GET search returns universe hits", async () => {
    const url = new URL("http://localhost/api/v1/search?q=AAPL");
    const res = await handleV1("GET", ["search"], url, undefined);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].symbol).toBe("AAPL");
    expect(body.dataStatus).toBe("LIVE");
  });

  it("POST options payoff returns expiration P/L", async () => {
    const url = new URL("http://localhost/api/v1/options/payoff");
    const res = await handleV1("POST", ["options", "payoff"], url, {
      spot: 100,
      legs: [{ right: "call", side: "buy", strike: 100, premium: 2.5, quantity: 1 }],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.max_loss).toBe(-250);
    expect(body.source).toBe("payoff-engine");
  });

  it("POST watchlist and DELETE watchlist persist locally", async () => {
    const add = await handleV1("POST", ["watchlist", "MSFT"], new URL("http://localhost/api/v1/watchlist/MSFT"), undefined);
    expect(add.status).toBe(200);
    const del = await handleV1("DELETE", ["watchlist", "MSFT"], new URL("http://localhost/api/v1/watchlist/MSFT"), undefined);
    expect(del.status).toBe(200);
    const body = await del.json();
    expect(body.data.ok).toBe(true);
  });

  it("POST alerts and DELETE alerts", async () => {
    const created = await handleV1("POST", ["alerts"], new URL("http://localhost/api/v1/alerts"), {
      symbol: "NVDA",
      type: "BUY",
      config: { price: 100 },
    });
    expect(created.status).toBe(200);
    const id = (await created.json()).data.id as string;
    const listed = await handleV1("GET", ["alerts"], new URL("http://localhost/api/v1/alerts"), undefined);
    expect(listed.status).toBe(200);
    const removed = await handleV1("DELETE", ["alerts", id], new URL(`http://localhost/api/v1/alerts/${id}`), undefined);
    expect(removed.status).toBe(200);
  });

  it("watchlist and snapshots survive a read-only filesystem", async () => {
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementation((file) => {
      throw Object.assign(new Error(`EROFS: read-only file system, open '${String(file)}'`), { code: "EROFS" });
    });
    try {
      const add = await handleV1("POST", ["watchlist", "EROFS1"], new URL("http://localhost/api/v1/watchlist/EROFS1"), undefined);
      expect(add.status).toBe(200);
      expect((await add.json()).data.symbol).toBe("EROFS1");
      expect(() =>
        persistSnapshot({
          symbol: "AAPL",
          timeframe: "1h",
          score: 70,
          signal: "WAIT",
          confidence: "MEDIUM",
          evidence: {},
          data_timestamp: "2026-09-11T15:00:00.000Z",
          algorithm_version: "1.0.0",
        }),
      ).not.toThrow();
    } finally {
      spy.mockRestore();
      resetStoreForTests();
    }
  });

  it("rejects unknown sector", async () => {
    const res = await dispatchV1(new Request("http://localhost/api/v1/market/sector/not-a-sector"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toMatch(/Unknown sector/);
  });

  it("accepts scalp 5m/15m/30m without changing Signal Analyzer timeframes", async () => {
    expect(normalizeScalpTimeframe("15minutes")).toBe("15m");
    expect(normalizeScalpTimeframe("5M")).toBe("5m");
    expect(() => normalizeScalpTimeframe("1h")).toThrow(/Unsupported scalp timeframe/);
    const analysis15 = await dispatchV1(new Request("http://localhost/api/v1/stocks/AAPL/analysis?timeframe=15m"));
    expect(analysis15.status).toBe(400);
    const scalpHour = await dispatchV1(new Request("http://localhost/api/v1/stocks/AAPL/scalp?timeframe=1h"));
    expect(scalpHour.status).toBe(400);
    const missing = await dispatchV1(new Request("http://localhost/api/v1/scalp-analyzer"));
    expect(missing.status).toBe(400);
    const noTicker = await dispatchV1(new Request("http://localhost/api/v1/market/ticker"));
    expect(noTicker.status).toBe(400);
  });

  it("keeps Signal Analyzer timeframes separate from swing timeframes", async () => {
    expect(normalizeSwingTimeframe("15minutes")).toBe("15m");
    expect(normalizeSwingTimeframe("weekly")).toBe("1w");
    expect(normalizeSwingTimeframe("4hours")).toBe("4h");
    expect(() => normalizeTimeframe("15m")).toThrow(/Unsupported timeframe/);
    expect(() => normalizeSwingTimeframe("5m")).toThrow(/Unsupported swing timeframe/);
    const analysis15 = await dispatchV1(new Request("http://localhost/api/v1/stocks/AAPL/analysis?timeframe=15m"));
    expect(analysis15.status).toBe(400);
    const swing5 = await dispatchV1(new Request("http://localhost/api/v1/stocks/AAPL/swing?timeframe=5m"));
    expect(swing5.status).toBe(400);
  });

  it("accepts pattern-only 15m and monthly without changing Signal Analyzer", () => {
    expect(normalizePatternTimeframe("15 Minutes")).toBe("15m");
    expect(normalizePatternTimeframe("monthly")).toBe("1M");
    expect(normalizePatternTimeframe("1M")).toBe("1M");
    expect(normalizePatternTimeframe("5m")).toBe("5m");
    expect(() => normalizeTimeframe("1M")).toThrow(/Unsupported timeframe/);
    expect(() => normalizeSwingTimeframe("1M")).toThrow(/Unsupported swing timeframe/);
    expect(() => normalizePatternTimeframe("2h")).toThrow(/Unsupported pattern timeframe/);
  });

  it("POST compare validates tickers and timeframe without changing Signal Analyzer TFs", async () => {
    const missing = await dispatchV1(new Request("http://localhost/api/v1/compare", { method: "POST", body: "{}" }));
    expect(missing.status).toBe(400);
    const badTf = await dispatchV1(
      new Request("http://localhost/api/v1/compare", {
        method: "POST",
        body: JSON.stringify({ ticker1: "AAPL", ticker2: "MSFT", timeframe: "1M", period: "1Y" }),
      }),
    );
    expect(badTf.status).toBe(400);
    const analysis15 = await dispatchV1(new Request("http://localhost/api/v1/stocks/AAPL/analysis?timeframe=15m"));
    expect(analysis15.status).toBe(400);
    const mag7Bad = await dispatchV1(new Request("http://localhost/api/v1/compare/mag7?timeframe=5m"));
    expect(mag7Bad.status).toBe(400);
    const basketEmpty = await dispatchV1(new Request("http://localhost/api/v1/compare/basket", { method: "POST", body: "{}" }));
    expect(basketEmpty.status).toBe(400);
    const basketTooMany = await dispatchV1(
      new Request("http://localhost/api/v1/compare/basket", {
        method: "POST",
        body: JSON.stringify({ tickers: ["AAPL", "MSFT", "NVDA", "AMD", "TSLA", "META", "AMZN", "GOOGL", "AVGO", "MU", "PLTR"], timeframe: "4h" }),
      }),
    );
    expect(basketTooMany.status).toBe(400);
    const basketDup = await dispatchV1(
      new Request("http://localhost/api/v1/compare/basket", {
        method: "POST",
        body: JSON.stringify({ tickers: ["AAPL", "aapl"], timeframe: "4h" }),
      }),
    );
    expect(basketDup.status).toBe(400);
    const basketTf = await dispatchV1(
      new Request("http://localhost/api/v1/compare/basket", {
        method: "POST",
        body: JSON.stringify({ tickers: ["AAPL", "MSFT"], timeframe: "5m" }),
      }),
    );
    expect(basketTf.status).toBe(400);
  });

  it("opportunity universe persists defaults and rejects duplicates", async () => {
    const listed = await handleV1("GET", ["opportunity", "universe"], new URL("http://localhost/api/v1/opportunity/universe"), undefined);
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.data.tickers).toHaveLength(20);
    expect(body.data.tickers[0]).toBe("NVDA");
    expect(body.data.tickers[19]).toBe("DELL");
    const dup = await dispatchV1(
      new Request("http://localhost/api/v1/opportunity/universe", {
        method: "POST",
        body: JSON.stringify({ tickers: ["NVDA", "NVDA"] }),
      }),
    );
    expect(dup.status).toBe(400);
  });

  it("validates crypto routes without inventing prices", async () => {
    const missing = await dispatchV1(new Request("http://localhost/api/v1/crypto/search"));
    expect(missing.status).toBe(400);
    const badLimit = await dispatchV1(new Request("http://localhost/api/v1/crypto/assets?limit=7"));
    expect(badLimit.status).toBe(400);
    const badTf = await dispatchV1(new Request("http://localhost/api/v1/crypto/asset/BTC/history?timeframe=2h"));
    expect(badTf.status).toBe(400);
    const badRange = await dispatchV1(new Request("http://localhost/api/v1/crypto/market-chart?range=2Y"));
    expect(badRange.status).toBe(400);
    const unknown = await dispatchV1(new Request("http://localhost/api/v1/crypto/not-a-route"));
    expect(unknown.status).toBe(404);
  });

  it("lists breakout-potential universes without locking to one ticker", async () => {
    const listed = await handleV1("GET", ["breakout-potential", "universes"], new URL("http://localhost/api/v1/breakout-potential/universes"), undefined);
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.data.default).toHaveLength(20);
    expect(body.data.etf).toContain("SPY");
    expect(body.data.sectors.some((s: { slug: string }) => s.slug === "technology")).toBe(true);
  });
});
