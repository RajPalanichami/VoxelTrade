import { describe, expect, it } from "vitest";
import { contractGreeks, expectedMove, historicalVolatility, probabilityInBands } from "@/src/engines/bsGreeks";

describe("option model greeks", () => {
  it("gives an at-the-money call a delta near one half and a negative put delta", () => {
    const call = contractGreeks({ right: "call", spot: 100, strike: 100, iv: 0.2, years: 1, rate: 0 });
    const put = contractGreeks({ right: "put", spot: 100, strike: 100, iv: 0.2, years: 1, rate: 0 });
    expect(call).not.toBeNull();
    expect(put).not.toBeNull();
    expect(call!.delta).toBeGreaterThan(0.45);
    expect(call!.delta).toBeLessThan(0.65);
    expect(put!.delta).toBeLessThan(-0.35);
    expect(put!.delta).toBeGreaterThan(-0.55);
    expect(call!.gamma).toBeGreaterThan(0);
    expect(call!.vega).toBeGreaterThan(0);
    expect(call!.theta).toBeLessThan(0);
    expect(call!.probItm).not.toBeCloseTo(call!.delta, 2);
  });

  it("flips nothing inside the contract greek — selling is a position sign", () => {
    const put = contractGreeks({ right: "put", spot: 100, strike: 100, iv: 0.3, years: 0.25, rate: 0 });
    expect(put!.delta).toBeLessThan(0);
    expect(-put!.delta).toBeGreaterThan(0);
  });

  it("sizes the expected move from spot, IV, and time", () => {
    const move = expectedMove(100, 0.2, 1);
    expect(move?.dollars).toBeCloseTo(20, 5);
    expect(move?.upper).toBeCloseTo(120, 5);
    expect(move?.lower).toBeCloseTo(80, 5);
    expect(expectedMove(100, 0, 1)).toBeNull();
  });

  it("annualizes close-to-close historical volatility and refuses a short sample", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 * Math.exp(i * 0.001));
    const hv = historicalVolatility(closes, 20);
    expect(hv).not.toBeNull();
    expect(hv!).toBeGreaterThan(0);
    expect(historicalVolatility([100, 101], 20)).toBeNull();
  });

  it("estimates probability inside a profit band without treating delta as that probability", () => {
    const pop = probabilityInBands(100, 0.2, 1, [{ from: 110, to: null }]);
    expect(pop).not.toBeNull();
    expect(pop!).toBeGreaterThan(0);
    expect(pop!).toBeLessThan(0.5);
    expect(probabilityInBands(100, 0, 1, [{ from: 110, to: null }])).toBeNull();
  });
});
