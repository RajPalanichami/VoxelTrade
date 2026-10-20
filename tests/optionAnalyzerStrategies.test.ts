import { describe, expect, it } from "vitest";
import { ANALYZER_STRATEGIES, buildAnalyzerStrategy } from "@/lib/optionAnalyzerStrategies";
import type { ChainContract, OptionChain } from "@/lib/optionsMath";

function c(right: "call" | "put", strike: number, bid: number, ask: number): ChainContract {
  return {
    contract: `${right}${strike}`,
    right,
    strike,
    bid,
    ask,
    last: (bid + ask) / 2,
    premium: (bid + ask) / 2,
    volume: 10,
    open_interest: 10,
    iv: 0.3,
    in_the_money: false,
  };
}

function chain(): OptionChain {
  const calls = [90, 95, 100, 105, 110].map((k) => c("call", k, k === 100 ? 4.8 : 2, k === 100 ? 5.2 : 2.4));
  const puts = [90, 95, 100, 105, 110].map((k) => c("put", k, 1.8, 2.2));
  return {
    symbol: "TEST",
    name: "Test Corp",
    spot: 100,
    expiration: "2026-10-16",
    expirations: ["2026-10-16", "2026-11-20", "2026-12-18"],
    calls,
    puts,
    source: "test",
    as_of: "2026-09-15T00:00:00Z",
  };
}

describe("option analyzer strategies", () => {
  it("lists every required strategy once", () => {
    const labels = ANALYZER_STRATEGIES.map((s) => s.label);
    for (const name of [
      "Long Call",
      "Long Put",
      "Short Call",
      "Short Put",
      "Bull Call Spread",
      "Bear Put Spread",
      "Long Straddle",
      "Short Straddle",
      "Long Strangle",
      "Short Strangle",
      "Butterfly",
      "Iron Butterfly",
      "Iron Condor",
      "Condor",
      "Covered Call",
      "Protective Put",
      "Collar",
      "Cash-Secured Put",
      "Calendar Spread",
      "Diagonal Spread",
    ]) {
      expect(labels).toContain(name);
    }
    expect(new Set(ANALYZER_STRATEGIES.map((s) => s.id)).size).toBe(ANALYZER_STRATEGIES.length);
  });

  it("fills long-call premium from the live ask", () => {
    const built = buildAnalyzerStrategy("long_call", chain(), 1, chain().calls.find((x) => x.strike === 100) || null);
    expect(built.missing).toBeNull();
    expect(built.legs[0].premium).toBe(5.2);
    expect(built.legs[0].side).toBe("buy");
  });

  it("builds collar, condor, and protective put from listed strikes", () => {
    const near = chain();
    expect(buildAnalyzerStrategy("collar", near, 1, null).legs).toHaveLength(2);
    expect(buildAnalyzerStrategy("collar", near, 1, null).stock?.shares).toBe(100);
    expect(buildAnalyzerStrategy("condor", near, 1, null).legs).toHaveLength(4);
    expect(buildAnalyzerStrategy("protective_put", near, 2, null).stock?.shares).toBe(200);
  });
});
