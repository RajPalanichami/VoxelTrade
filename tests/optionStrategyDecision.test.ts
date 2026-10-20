import { describe, expect, it } from "vitest";
import { buildAnalyzerStrategy } from "@/lib/optionAnalyzerStrategies";
import type { ChainContract, OptionChain } from "@/lib/optionsMath";
import { buildOptionDecision, scoreFromFactors, SCORE_BANDS } from "@/src/engines/optionStrategyDecision";
import type { DecisionInput } from "@/src/engines/optionStrategyDecision";

function base(over: Partial<DecisionInput> & Pick<DecisionInput, "strategyId" | "strategyLabel">): DecisionInput {
  return {
    symbol: "META",
    spot: 100,
    expiration: "2026-12-18",
    now: new Date("2026-10-07T16:00:00Z"),
    maxProfit: 500,
    maxLoss: 200,
    breakevens: [105],
    riskReward: 2.5,
    profitZones: [{ from: 105, to: null }],
    legs: [
      {
        right: "call",
        side: "buy",
        strike: 100,
        premium: 5,
        quantity: 1,
        expiration: "2026-12-18",
        iv: 0.5,
        bid: 4.8,
        ask: 5.2,
        volume: 400,
        openInterest: 2000,
      },
    ],
    context: {
      hv: 0.3,
      shortTrend: "Bullish",
      mediumTrend: "Bullish",
      longTrend: "Bullish",
      support: 92,
      resistance: 110,
      rsi: 55,
      earningsDays: 40,
    },
    ...over,
  };
}

describe("strategy-aware option decision", () => {
  it("treats rich IV as favorable for a short put and caution for a long call", () => {
    const shared = {
      spot: 100,
      expiration: "2026-12-18",
      now: new Date("2026-10-07T16:00:00Z"),
      context: { hv: 0.3, shortTrend: "Bullish" as const, mediumTrend: "Bullish" as const, longTrend: "Bullish" as const, earningsDays: 40 },
    };
    const shortPut = buildOptionDecision(
      base({
        ...shared,
        strategyId: "short_put",
        strategyLabel: "Short Put",
        maxProfit: 250,
        maxLoss: 9000,
        breakevens: [92],
        riskReward: 0.03,
        profitZones: [{ from: 92, to: null }],
        legs: [
          {
            right: "put",
            side: "sell",
            strike: 95,
            premium: 2.5,
            quantity: 1,
            expiration: "2026-12-18",
            iv: 0.5,
            bid: 2.4,
            ask: 2.6,
            volume: 300,
            openInterest: 1500,
          },
        ],
      }),
    );
    const longCall = buildOptionDecision(base({ ...shared, strategyId: "long_call", strategyLabel: "Long Call" }));
    expect(shortPut.factors.find((f) => f.factor === "IV vs HV")?.impact).toBe("positive");
    expect(longCall.factors.find((f) => f.factor === "IV vs HV")?.impact).toBe("caution");
    expect(shortPut.factors.find((f) => f.factor === "Theta")?.impact).toBe("positive");
    expect(longCall.factors.find((f) => f.factor === "Theta")?.impact).toBe("caution");
    expect(shortPut.net.delta).not.toBeNull();
    expect(shortPut.net.delta!).toBeGreaterThan(0);
    expect(longCall.net.delta!).toBeGreaterThan(0);
    expect(shortPut.net.vega!).toBeLessThan(0);
    expect(longCall.net.vega!).toBeGreaterThan(0);
    expect(shortPut.mainRisk).toMatch(/Sharp downside move in META/i);
    expect(longCall.mainRisk).toMatch(/fails to rally/i);
    expect(shortPut.score).not.toBe(longCall.score);
  });

  it("keeps IV rank and percentile unavailable instead of inventing them", () => {
    const decision = buildOptionDecision(base({ strategyId: "long_call", strategyLabel: "Long Call" }));
    expect(decision.iv.rank).toBeNull();
    expect(decision.iv.percentile).toBeNull();
    expect(decision.factors.find((f) => f.factor === "52-Week IV Percentile")?.value).toBe("N/A");
    expect(decision.factors.find((f) => f.factor === "52-Week IV Percentile")?.interpretation).toMatch(/not an 80% chance/i);
  });

  it("labels unlimited loss instead of a fake dollar cap", () => {
    const decision = buildOptionDecision(
      base({
        strategyId: "short_call",
        strategyLabel: "Short Call",
        maxProfit: 400,
        maxLoss: null,
        riskReward: null,
        legs: [
          {
            right: "call",
            side: "sell",
            strike: 110,
            premium: 4,
            quantity: 1,
            expiration: "2026-12-18",
            iv: 0.4,
            bid: 3.8,
            ask: 4.2,
            volume: 100,
            openInterest: 800,
          },
        ],
      }),
    );
    expect(decision.factors.find((f) => f.factor === "Max Loss")?.value).toBe("Unlimited");
    expect(decision.mainRisk).toMatch(/unlimited/i);
  });

  it("nets multi-leg greeks", () => {
    const decision = buildOptionDecision(
      base({
        strategyId: "bull_put_spread",
        strategyLabel: "Bull Put Spread",
        profitZones: [{ from: 90, to: null }],
        legs: [
          { right: "put", side: "sell", strike: 95, premium: 3, quantity: 1, expiration: "2026-12-18", iv: 0.4, bid: 2.8, ask: 3.2, volume: 200, openInterest: 900 },
          { right: "put", side: "buy", strike: 90, premium: 1.5, quantity: 1, expiration: "2026-12-18", iv: 0.42, bid: 1.4, ask: 1.6, volume: 180, openInterest: 700 },
        ],
      }),
    );
    expect(decision.greeks.length).toBe(3);
    expect(decision.greeks[2].label).toBe("Net strategy");
    expect(decision.net.delta).not.toBeNull();
    const legDelta = (decision.greeks[0].delta || 0) + (decision.greeks[1].delta || 0);
    expect(decision.net.delta).toBeCloseTo(legDelta, 6);
  });

  it("prices what-if scenarios as estimates and withholds them when IV is missing", () => {
    const decision = buildOptionDecision(base({ strategyId: "long_call", strategyLabel: "Long Call" }));
    const up = decision.scenarios.find((row) => row.label.includes("+5%"));
    expect(up?.pnl).not.toBeNull();
    expect(up?.note).toMatch(/not a guaranteed/i);
    const missing = buildOptionDecision(
      base({
        strategyId: "long_call",
        strategyLabel: "Long Call",
        legs: [{ right: "call", side: "buy", strike: 100, premium: 5, quantity: 1, expiration: "2026-12-18", iv: null, bid: 4.8, ask: 5.2, volume: 10, openInterest: 10 }],
      }),
    );
    expect(missing.scenarios.every((row) => row.pnl == null)).toBe(true);
    expect(missing.factors.find((f) => f.factor === "Delta")?.value).toBe("N/A");
  });

  it("maps score bands from the shared thresholds", () => {
    expect(SCORE_BANDS[0].min).toBe(80);
    const factors = buildOptionDecision(base({ strategyId: "short_put", strategyLabel: "Short Put" })).factors;
    const score = scoreFromFactors("short_put", factors);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

function c(right: "call" | "put", strike: number): ChainContract {
  return { contract: `${right}${strike}`, right, strike, bid: 1, ask: 1.2, last: 1.1, premium: 1.1, volume: 10, open_interest: 10, iv: 0.3, in_the_money: false };
}

function chain(): OptionChain {
  return {
    symbol: "TEST",
    name: "Test",
    spot: 100,
    expiration: "2026-11-20",
    expirations: ["2026-11-20", "2026-12-18"],
    calls: [95, 100, 105].map((k) => c("call", k)),
    puts: [95, 100, 105].map((k) => c("put", k)),
    source: "test",
    as_of: "2026-10-07T00:00:00Z",
  };
}

describe("short volatility structures", () => {
  it("sells both legs of a short straddle and short strangle", () => {
    const near = chain();
    const straddle = buildAnalyzerStrategy("short_straddle", near, 1, null);
    expect(straddle.legs).toHaveLength(2);
    expect(straddle.legs.every((leg) => leg.side === "sell")).toBe(true);
    const strangle = buildAnalyzerStrategy("short_strangle", near, 1, null);
    expect(strangle.legs.every((leg) => leg.side === "sell")).toBe(true);
    expect(strangle.legs.map((leg) => leg.strike).sort()).not.toEqual([100, 100]);
  });
});
