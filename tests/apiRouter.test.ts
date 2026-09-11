import fs from "fs";
import { describe, expect, it, vi } from "vitest";
import { dispatchV1, handleV1 } from "@/src/server/apiRouter";
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
});
