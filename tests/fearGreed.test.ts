import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampFearGreedValue, FEAR_GREED_ZONES, formatFearGreedZone, getFearGreedClassification } from "@/lib/fearGreed";
import { normalizeFearGreed, parseAlternativeFearGreed, parseCnnFearGreed } from "@/src/engines/fearGreed";
import { orderMarketTiles, TILE_LEAD, TILE_TRAIL } from "@/lib/tileOrder";
import { cacheClear, cacheSet } from "@/src/lib/cache";
import { buildMarketGauge, unavailableGauge } from "@/src/services/marketGauge";
import { dispatchV1 } from "@/src/server/apiRouter";

describe("getFearGreedClassification", () => {
  it("maps inclusive boundaries", () => {
    expect(getFearGreedClassification(0)).toBe("Extreme Fear");
    expect(getFearGreedClassification(24)).toBe("Extreme Fear");
    expect(getFearGreedClassification(25)).toBe("Fear");
    expect(getFearGreedClassification(44)).toBe("Fear");
    expect(getFearGreedClassification(45)).toBe("Neutral");
    expect(getFearGreedClassification(50)).toBe("Neutral");
    expect(getFearGreedClassification(55)).toBe("Neutral");
    expect(getFearGreedClassification(56)).toBe("Greed");
    expect(getFearGreedClassification(74)).toBe("Greed");
    expect(getFearGreedClassification(75)).toBe("Extreme Greed");
    expect(getFearGreedClassification(100)).toBe("Extreme Greed");
  });

  it("rejects invalid values and clamps out-of-range numbers", () => {
    expect(getFearGreedClassification(null)).toBeNull();
    expect(getFearGreedClassification(undefined)).toBeNull();
    expect(getFearGreedClassification(Number.NaN)).toBeNull();
    expect(getFearGreedClassification(-4)).toBe("Extreme Fear");
    expect(getFearGreedClassification(140)).toBe("Extreme Greed");
    expect(clampFearGreedValue(-4)).toBe(0);
    expect(clampFearGreedValue(140)).toBe(100);
  });

  it("keeps zone copy generated from the same table", () => {
    expect(FEAR_GREED_ZONES.map((zone, index) => formatFearGreedZone(zone, index))).toEqual([
      "0–24 Extreme Fear",
      "25–44 Fear",
      "45–55 Neutral",
      "56–74 Greed",
      "75–100 Extreme Greed",
    ]);
  });
});

describe("fear greed normalization", () => {
  it("uses provider history and does not invent screenshot values", () => {
    const data = parseAlternativeFearGreed({
      data: [
        { value: "41", timestamp: "1717200000" },
        { value: "39", timestamp: "1717113600" },
        { value: "48", timestamp: "1716595200" },
        { value: "52", timestamp: "1714608000" },
        { value: "61", timestamp: "1685577600" },
      ],
    });
    expect(data).toBeTruthy();
    expect(data!.current.value).toBe(41);
    expect(data!.current.classification).toBe("Fear");
    expect(data!.previousClose?.value).toBe(39);
    expect([36, 33, 27, 54, 66]).not.toContain(data!.current.value);
    expect(data!.source).toBe("alternative.me");
  });

  it("reads labeled CNN history when present", () => {
    const data = parseCnnFearGreed({
      fear_and_greed: {
        score: 58,
        timestamp: "2026-09-22T14:00:00.000Z",
        previous_close: 51,
        previous_1_week: 47,
        previous_1_month: 62,
        previous_1_year: 71,
      },
    });
    expect(data?.current.classification).toBe("Greed");
    expect(data?.previousClose?.value).toBe(51);
    expect(data?.oneWeekAgo?.value).toBe(47);
    expect(data?.oneMonthAgo?.value).toBe(62);
    expect(data?.oneYearAgo?.value).toBe(71);
  });

  it("maps a live CNN stock-market reading of ~35 to Fear, not Greed", () => {
    const data = parseCnnFearGreed({
      fear_and_greed: {
        score: 35.2571428571429,
        rating: "fear",
        timestamp: "2026-09-22T21:45:46+00:00",
        previous_close: 33.7142857142857,
        previous_1_week: 27.9714285714286,
        previous_1_month: 54.65714285714286,
        previous_1_year: 66.51428571428572,
      },
    });
    expect(data?.current.value).toBeCloseTo(35.26, 1);
    expect(data?.current.classification).toBe("Fear");
    expect(getFearGreedClassification(data?.current.value)).toBe("Fear");
    expect(data?.previousClose?.classification).toBe("Fear");
    expect(data?.oneWeekAgo?.classification).toBe("Fear");
    expect(data?.source).toBe("CNN Fear & Greed");
  });

  it("returns null without a current reading", () => {
    expect(normalizeFearGreed({ current: null, source: "x" })).toBeNull();
    expect(parseAlternativeFearGreed({ data: [] })).toBeNull();
  });

  it("omits missing historical points instead of inventing them", () => {
    const data = parseAlternativeFearGreed({
      data: [{ value: "50", timestamp: "1717200000" }],
    });
    expect(data?.current.value).toBe(50);
    expect(data?.previousClose).toBeUndefined();
    expect(data?.oneWeekAgo).toBeUndefined();
    expect(data?.oneMonthAgo).toBeUndefined();
    expect(data?.oneYearAgo).toBeUndefined();
  });
});

describe("market tile order", () => {
  it("places the gauge in IWM's former slot and keeps IWM last exactly once", () => {
    expect([...TILE_LEAD]).toEqual(["BTC", "VIX", "BRENT", "WTI", "SPY", "GAUGE", "US2Y", "US10Y", "CPI"]);
    expect([...TILE_TRAIL]).toEqual(["IWM"]);
    const cards = [
      { symbol: "IWM" },
      { symbol: "CPI" },
      { symbol: "QQQ" },
      { symbol: "BTC" },
      { symbol: "SPY" },
      { symbol: "GAUGE" },
      { symbol: "VIX" },
      { symbol: "US2Y" },
      { symbol: "WTI" },
      { symbol: "BRENT" },
      { symbol: "US10Y" },
    ];
    const ordered = orderMarketTiles(cards).map((c) => c.symbol);
    expect(ordered.filter((s) => s === "IWM")).toHaveLength(1);
    expect(ordered.at(-1)).toBe("IWM");
    expect(ordered.slice(0, 6)).toEqual(["BTC", "VIX", "BRENT", "WTI", "SPY", "GAUGE"]);
    expect(ordered.indexOf("GAUGE")).toBe(ordered.indexOf("SPY") + 1);
    expect(ordered.indexOf("IWM")).toBeGreaterThan(ordered.indexOf("CPI"));
  });
});

describe("market gauge service", () => {
  beforeEach(() => {
    cacheClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cacheClear();
  });

  it("never treats an unavailable gauge as a 0 reading", () => {
    const data = unavailableGauge();
    expect(data.data_status).toBe("UNAVAILABLE");
    expect(Number.isFinite(data.current.value)).toBe(false);
    expect(data.current.value).not.toBe(0);
  });

  it("uses the CNN stock-market index and maps ~35 to Fear", async () => {
    let userAgent = "";
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      userAgent = headers.get("User-Agent") || "";
      if (url.includes("cnn.io")) {
        return Response.json({
          fear_and_greed: {
            score: 35.2571428571429,
            rating: "fear",
            timestamp: "2026-09-22T21:45:46+00:00",
            previous_close: 33.7142857142857,
            previous_1_week: 27.9714285714286,
            previous_1_month: 54.65714285714286,
            previous_1_year: 66.51428571428572,
          },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const data = await buildMarketGauge();
    expect(userAgent).toMatch(/Mozilla\/5\.0/);
    expect(data.data_status).toBe("LIVE");
    expect(data.source).toBe("CNN Fear & Greed");
    expect(data.current.value).toBeCloseTo(35.26, 1);
    expect(data.current.classification).toBe("Fear");
    expect(data.previousClose?.classification).toBe("Fear");
    expect([36, 33, 27, 54, 66, 78]).not.toContain(Math.round(data.current.value));
  });

  it("does not substitute the crypto Fear & Greed index when CNN is blocked", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("cnn.io")) return new Response("I'm a teapot. You're a bot.", { status: 418 });
      if (url.includes("alternative.me")) {
        return Response.json({ data: [{ value: "78", timestamp: "1790035200" }] });
      }
      return new Response("not found", { status: 404 });
    });
    const data = await buildMarketGauge();
    expect(data.data_status).toBe("UNAVAILABLE");
    expect(data.current.value).not.toBe(78);
    expect(data.current.classification).not.toBe("Extreme Greed");
  });

  it("serves last-known stale data instead of inventing 0 when the provider fails", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      if (url.includes("cnn.io")) {
        return Response.json({
          fear_and_greed: { score: 41, timestamp: "2026-09-22T14:00:00.000Z", previous_close: 39 },
        });
      }
      return new Response("not found", { status: 404 });
    });
    const live = await buildMarketGauge();
    expect(live.data_status).toBe("LIVE");
    cacheClear();
    cacheSet("market-gauge:last:v2", { ...live, data_status: "LIVE" }, 86_400);
    vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));
    const stale = await buildMarketGauge();
    expect(stale.data_status).toBe("STALE");
    expect(stale.current.value).toBe(41);
    expect(stale.current.value).not.toBe(0);
  });

  it("marks the dedicated gauge route unavailable without a 0 value", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));
    const res = await dispatchV1(new Request("http://localhost/api/v1/market/gauge"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.data_status).toBe("UNAVAILABLE");
    expect(Number.isFinite(json.data.current.value)).toBe(false);
  });
});
