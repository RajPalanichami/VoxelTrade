import { describe, expect, it } from "vitest";
import { calculatedChangePercent, isValidMover, rankMovers, type MoverCfg } from "@/src/services/movers";

const CFG: MoverCfg = {
  min_significant: 50,
  min_gainer: 0,
  min_loser: 0,
  min_price: 1,
  min_volume: 100_000,
  exclude_etf: true,
  exclude_otc: true,
  exchanges: new Set(["NYSE", "NASDAQ", "NMS"]),
};

describe("movers", () => {
  it("percent formula", () => {
    expect(Math.round(calculatedChangePercent(12, 10) * 100) / 100).toBe(20);
    expect(Math.round(calculatedChangePercent(5, 10) * 100) / 100).toBe(-50);
  });

  it("rejects zero price and etf", () => {
    expect(isValidMover({ price: 0, previous_close: 10, volume: 200_000, quote_type: "EQUITY" }, CFG)).toBe(false);
    expect(isValidMover({ price: 5, previous_close: 4, volume: 200_000, quote_type: "ETF" }, CFG)).toBe(false);
    expect(isValidMover({ price: 5, previous_close: 4, volume: 50, quote_type: "EQUITY" }, CFG)).toBe(false);
  });

  it("prefers calculated pct on bad provider value", () => {
    const row = { price: 20, previous_close: 10, volume: 200_000, quote_type: "EQUITY", change_percent: 9999 };
    expect(isValidMover(row, CFG)).toBe(true);
    expect(Math.abs(Number(row.change_percent) - 100)).toBeLessThan(0.01);
  });

  it("top5 sorted and fills below threshold", () => {
    const rows = [
      { symbol: "A", price: 2, change_percent: 180, volume: 1e6 },
      { symbol: "B", price: 2, change_percent: 12, volume: 1e6 },
      { symbol: "C", price: 2, change_percent: 90, volume: 1e6 },
      { symbol: "D", price: 2, change_percent: 8, volume: 1e6 },
      { symbol: "E", price: 2, change_percent: 70, volume: 1e6 },
      { symbol: "F", price: 2, change_percent: 5, volume: 1e6 },
    ];
    const top = rankMovers(rows, false, CFG);
    expect(top.map((r) => r.symbol)).toEqual(["A", "C", "E", "B", "D"]);
    const losers = rankMovers(
      [
        { symbol: "X", price: 2, change_percent: -80, volume: 1e6 },
        { symbol: "Y", price: 2, change_percent: -10, volume: 1e6 },
        { symbol: "Z", price: 2, change_percent: -60, volume: 1e6 },
        { symbol: "W", price: 2, change_percent: -4, volume: 1e6 },
        { symbol: "V", price: 2, change_percent: -3, volume: 1e6 },
      ],
      true,
      CFG,
    );
    expect(losers[0].symbol).toBe("X");
    expect(losers[1].symbol).toBe("Z");
    expect(losers.length).toBe(5);
  });
});
