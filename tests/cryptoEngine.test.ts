import { describe, expect, it } from "vitest";
import { altcoinSeason, computeBreadth, cryptoGauge, dominanceChange24h, oiInterpretation, periodChange } from "@/src/engines/cryptoAnalytics";
import { classifyFreshness, freshnessFromTimestamps } from "@/src/engines/cryptoFreshness";
import { quarantineQuote, validPrice, validTimestamp } from "@/src/engines/cryptoQuality";
import { normalizeBinanceTicker } from "@/src/engines/cryptoQuotes";
import { binanceSpotSymbol, normalizeCryptoSymbol } from "@/src/engines/cryptoSymbols";
import { mapCoinLoreTicker } from "@/src/providers/coinLore";
import { normalizeCryptoRange, normalizeCryptoTimeframe } from "@/src/services/crypto";
import type { CryptoAsset } from "@/lib/crypto";

function asset(partial: Partial<CryptoAsset>): CryptoAsset {
  return {
    id: "x",
    symbol: "AAA",
    name: "Aaa",
    price: 10,
    marketCap: 1e9,
    volume24h: 1e7,
    volumeChange24h: 10,
    marketCapChange24h: 1,
    change1h: 0,
    change24h: 1,
    change7d: 2,
    change14d: 0,
    change30d: 3,
    change200d: 4,
    change1y: 5,
    circulatingSupply: 1,
    totalSupply: 1,
    maxSupply: 1,
    rank: 1,
    ath: 20,
    athChange: -50,
    atl: 1,
    atlChange: 900,
    high24h: 11,
    low24h: 9,
    sparkline: Array.from({ length: 24 }, (_, i) => 9 + i / 10),
    image: null,
    timestamp: "2026-09-30T12:00:00.000Z",
    ...partial,
  };
}

describe("crypto symbols and quality", () => {
  it("normalizes exchange identifiers to BTC", () => {
    expect(normalizeCryptoSymbol("btcusdt")).toBe("BTC");
    expect(normalizeCryptoSymbol("BTC-USD")).toBe("BTC");
    expect(normalizeCryptoSymbol("XBT/USD")).toBe("BTC");
    expect(binanceSpotSymbol("ETH")).toBe("ETHUSDT");
  });

  it("rejects invalid live quotes", () => {
    expect(validPrice(0)).toBeNull();
    expect(validPrice(-2)).toBeNull();
    expect(validTimestamp(Date.now() + 120_000)).toBeNull();
    expect(quarantineQuote({ symbol: "ETH", expected: "BTC", price: 1 })).toBe("unexpected_symbol");
    expect(normalizeBinanceTicker({ s: "BTCUSDT", c: "-1", E: Date.now() })).toBeNull();
    expect(normalizeBinanceTicker({ s: "BTCUSDT", c: "68000", P: "1.2", E: Date.now() })?.symbol).toBe("BTC");
  });

  it("classifies freshness without treating stale as live", () => {
    expect(classifyFreshness(2)).toBe("LIVE");
    expect(classifyFreshness(20)).toBe("RECENT");
    expect(classifyFreshness(90)).toBe("STALE");
    expect(classifyFreshness(400)).toBe("UNAVAILABLE");
    const f = freshnessFromTimestamps({
      source: "Binance",
      providerTimestamp: new Date(Date.now() - 2000),
      receivedTimestamp: new Date(),
    });
    expect(f.state).toBe("LIVE");
    expect(f.ageSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("crypto analytics", () => {
  it("computes breadth from ranked coins without a hardcoded top 10", () => {
    const assets = Array.from({ length: 12 }, (_, i) =>
      asset({
        id: `c${i}`,
        symbol: `C${i}`,
        rank: i + 1,
        change24h: i % 2 === 0 ? 2 : -1,
        change30d: i < 8 ? 1 : -1,
        change200d: i < 4 ? 1 : -1,
      }),
    );
    const b = computeBreadth(assets, "TOP_50");
    expect(b.advancing).toBe(6);
    expect(b.declining).toBe(6);
    expect(b.advancingPct).toBe(50);
    expect(b.dmaAvailable).toBe(true);
  });

  it("labels OI interpretations as possible, not certain", () => {
    expect(oiInterpretation(2, 3)).toMatch(/Possible Interpretation/);
    expect(oiInterpretation(2, -1)).toMatch(/short covering/);
    expect(oiInterpretation(-2, 1)).toMatch(/downside positioning/);
  });

  it("builds a transparent gauge instead of an unexplained AI score", () => {
    const g = cryptoGauge({
      btcChange24h: 3,
      btcTrendUp: true,
      btcDominance: 52,
      ethChange24h: 2,
      altBreadth: 70,
      totalChange24h: 1.5,
      volumeChange24h: 10,
      stableChange: 0.4,
      funding: 0.0001,
      sentiment: 60,
    });
    expect(["RISK-ON", "NEUTRAL", "RISK-OFF"]).toContain(g.label);
    expect(g.inputs.length).toBeGreaterThan(5);
    expect(g.explanation).toMatch(/transparent average/);
  });

  it("computes altcoin season from documented inputs", () => {
    const season = altcoinSeason({
      btcDominance: 40,
      ethBtc: 2,
      top50BeatBtc: 70,
      top100BeatBtc: 65,
      altBreadth: 72,
    });
    expect(season.label).toMatch(/Altcoin|Transition|BTC/);
    expect(season.methodology).toMatch(/weighted/);
  });

  it("computes dominance change from the same snapshot, not a guessed number", () => {
    expect(dominanceChange24h(50, 0, 0)).toBeCloseTo(0);
    expect(dominanceChange24h(null, 1, 1)).toBeNull();
    const up = dominanceChange24h(58, 4, 1);
    expect(up).not.toBeNull();
    expect(up as number).toBeGreaterThan(0);
  });

  it("period change uses completed points only", () => {
    const now = Date.UTC(2026, 8, 30);
    const points = [
      { time: now / 1000 - 10 * 86400, value: 100 },
      { time: now / 1000, value: 110 },
    ];
    expect(periodChange(points, 7, now)).toBeCloseTo(10);
  });
});

describe("coinlore mapper", () => {
  it("maps public ticker fields without inventing ATH or 30d change", () => {
    const row = mapCoinLoreTicker({
      id: "90",
      symbol: "BTC",
      name: "Bitcoin",
      nameid: "bitcoin",
      rank: 1,
      price_usd: "83749.54",
      percent_change_24h: "0.15",
      percent_change_1h: "0.01",
      percent_change_7d: "-2.44",
      market_cap_usd: "1672549763006.90",
      volume24: 28966232398,
      csupply: "19970852.00",
    });
    expect(row?.symbol).toBe("BTC");
    expect(row?.price).toBeCloseTo(83749.54);
    expect(row?.marketCap).toBeCloseTo(1672549763006.9);
    expect(row?.ath).toBeNull();
    expect(row?.change30d).toBeNull();
  });
});

describe("crypto route helpers", () => {
  it("accepts crypto chart timeframes including 15m and 1M", () => {
    expect(normalizeCryptoTimeframe("15minutes")).toBe("15m");
    expect(normalizeCryptoTimeframe("1M")).toBe("1M");
    expect(() => normalizeCryptoTimeframe("2h")).toThrow(/Unsupported crypto timeframe/);
    expect(normalizeCryptoRange("1Y")).toBe("1Y");
    expect(() => normalizeCryptoRange("2Y")).toThrow(/Unsupported range/);
  });
});
