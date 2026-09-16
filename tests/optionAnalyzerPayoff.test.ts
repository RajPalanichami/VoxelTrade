import { describe, expect, it } from "vitest";
import {
  analyzePayoff,
  blackScholesPrice,
  cashToday,
  createAnalyzerLeg,
  fillLivePremium,
  moneyness,
  pnlAt,
  yearFraction,
} from "@/src/engines/optionAnalyzerPayoff";

function almost(a: number, b: number, tol = 0.6) {
  expect(Math.abs(a - b)).toBeLessThan(tol);
}

describe("option analyzer payoff engine", () => {
  it("uses live ask for buys and live bid for sells", () => {
    expect(fillLivePremium("buy", 1.1, 1.4, 1.25)).toBe(1.4);
    expect(fillLivePremium("sell", 1.1, 1.4, 1.25)).toBe(1.1);
    expect(fillLivePremium("buy", 0, 0, 1.25)).toBe(1.25);
  });

  it("classifies ITM ATM OTM from the live spot", () => {
    expect(moneyness("call", 100, 100)).toBe("ATM");
    expect(moneyness("call", 110, 100)).toBe("ITM");
    expect(moneyness("call", 90, 100)).toBe("OTM");
    expect(moneyness("put", 90, 100)).toBe("ITM");
    expect(moneyness("put", 110, 100)).toBe("OTM");
  });

  it("long call: debit, capped loss, unlimited gain, BE = strike + premium", () => {
    const legs = [createAnalyzerLeg({ right: "call", side: "buy", strike: 100, premium: 2.5, quantity: 1 })];
    expect(cashToday(legs)).toBe(-250);
    expect(pnlAt(legs, 100)).toBe(-250);
    expect(pnlAt(legs, 110)).toBe(750);
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "long_call",
      strategyLabel: "Long Call",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.max_loss).toBe(250);
    expect(out.max_profit).toBeNull();
    almost(out.breakevens[0], 102.5, 0.05);
    expect(out.entry_label).toContain("Debit");
    expect(out.profit_zones.some((z) => z.to == null && z.from && z.from > 102)).toBe(true);
    expect(out.explanation).toContain("TEST");
    expect(out.explanation).toContain("100.00");
    expect(out.legs[0].moneyness).toBe("ATM");
  });

  it("long put: BE = strike - premium", () => {
    const legs = [createAnalyzerLeg({ right: "put", side: "buy", strike: 50, premium: 1, quantity: 1 })];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 50,
      strategyId: "long_put",
      strategyLabel: "Long Put",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.max_loss).toBe(100);
    almost(out.breakevens[0], 49, 0.05);
    expect(pnlAt(legs, 0.01)).toBeGreaterThan(4800);
    expect(out.max_profit).toBeGreaterThan(4800);
  });

  it("scales a long call by contract count", () => {
    const one = [createAnalyzerLeg({ right: "call", side: "buy", strike: 20, premium: 1, quantity: 1 })];
    const two = [createAnalyzerLeg({ right: "call", side: "buy", strike: 20, premium: 1, quantity: 2 })];
    expect(cashToday(two)).toBe(cashToday(one) * 2);
    expect(pnlAt(two, 25)).toBe(pnlAt(one, 25) * 2);
  });

  it("bull call spread is defined-risk debit", () => {
    const legs = [
      createAnalyzerLeg({ right: "call", side: "buy", strike: 100, premium: 4, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 110, premium: 1.5, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "bull_call_spread",
      strategyLabel: "Bull Call Spread",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(-250);
    expect(out.max_loss).toBe(250);
    almost(out.max_profit!, 750, 1);
    almost(out.breakevens[0], 102.5, 0.08);
    expect(out.risk_reward).toBeCloseTo(3, 1);
  });

  it("bear put spread is defined-risk debit", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "buy", strike: 50, premium: 3, quantity: 1 }),
      createAnalyzerLeg({ right: "put", side: "sell", strike: 45, premium: 1, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 50,
      strategyId: "bear_put_spread",
      strategyLabel: "Bear Put Spread",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(-200);
    expect(out.max_loss).toBe(200);
    almost(out.max_profit!, 300, 1);
    almost(out.breakevens[0], 48, 0.08);
  });

  it("bear call spread is a credit with defined risk", () => {
    const legs = [
      createAnalyzerLeg({ right: "call", side: "sell", strike: 100, premium: 4, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "buy", strike: 110, premium: 1.5, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "bear_call_spread",
      strategyLabel: "Bear Call Spread",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(250);
    expect(out.max_profit).toBe(250);
    almost(out.max_loss!, 750, 1);
  });

  it("bull put spread is a credit with defined risk", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "sell", strike: 50, premium: 3, quantity: 1 }),
      createAnalyzerLeg({ right: "put", side: "buy", strike: 45, premium: 1, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 50,
      strategyId: "bull_put_spread",
      strategyLabel: "Bull Put Spread",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(200);
    expect(out.max_profit).toBe(200);
    almost(out.max_loss!, 300, 1);
  });

  it("long straddle has two breakevens and loses the debit if unchanged", () => {
    const legs = [
      createAnalyzerLeg({ right: "call", side: "buy", strike: 50, premium: 2, quantity: 1 }),
      createAnalyzerLeg({ right: "put", side: "buy", strike: 50, premium: 2, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 50,
      strategyId: "straddle",
      strategyLabel: "Straddle",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(-400);
    expect(out.at_spot_pnl).toBe(-400);
    expect(out.max_loss).toBe(400);
    expect(out.max_profit).toBeNull();
    almost(out.breakevens[0], 46, 0.08);
    almost(out.breakevens[1], 54, 0.08);
  });

  it("long strangle needs a larger move than a straddle", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "buy", strike: 45, premium: 1, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "buy", strike: 55, premium: 1, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 50,
      strategyId: "strangle",
      strategyLabel: "Strangle",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(-200);
    expect(out.max_loss).toBe(200);
    almost(out.breakevens[0], 43, 0.08);
    almost(out.breakevens[1], 57, 0.08);
  });

  it("call butterfly peaks at the body strike", () => {
    const legs = [
      createAnalyzerLeg({ right: "call", side: "buy", strike: 90, premium: 8, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 100, premium: 3, quantity: 2 }),
      createAnalyzerLeg({ right: "call", side: "buy", strike: 110, premium: 1, quantity: 1 }),
    ];
    expect(cashToday(legs)).toBe(-300);
    expect(pnlAt(legs, 100)).toBe(700);
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "butterfly",
      strategyLabel: "Butterfly",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.max_loss).toBe(300);
    almost(out.max_profit!, 700, 1);
  });

  it("iron butterfly collects a credit and has two breakevens", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "buy", strike: 90, premium: 1, quantity: 1 }),
      createAnalyzerLeg({ right: "put", side: "sell", strike: 100, premium: 3, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 100, premium: 3, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "buy", strike: 110, premium: 1, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "iron_butterfly",
      strategyLabel: "Iron Butterfly",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(400);
    expect(out.max_profit).toBe(400);
    almost(out.max_loss!, 600, 1);
    almost(out.breakevens[0], 96, 0.1);
    almost(out.breakevens[1], 104, 0.1);
  });

  it("iron condor profit sits between the short strikes", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "buy", strike: 90, premium: 1, quantity: 1 }),
      createAnalyzerLeg({ right: "put", side: "sell", strike: 95, premium: 2, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 105, premium: 2, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "buy", strike: 110, premium: 1, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "iron_condor",
      strategyLabel: "Iron Condor",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(200);
    expect(out.max_profit).toBe(200);
    almost(out.max_loss!, 300, 1);
    expect(pnlAt(legs, 100)).toBe(200);
    almost(out.breakevens[0], 93, 0.1);
    almost(out.breakevens[1], 107, 0.1);
  });

  it("long call condor is a debit with a defined range profit", () => {
    const legs = [
      createAnalyzerLeg({ right: "call", side: "buy", strike: 90, premium: 12, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 95, premium: 8, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 105, premium: 3, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "buy", strike: 110, premium: 1, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "condor",
      strategyLabel: "Condor",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(-200);
    expect(out.max_loss).toBe(200);
    almost(out.max_profit!, 300, 1);
    expect(pnlAt(legs, 100)).toBe(300);
  });

  it("covered call includes the stock and caps upside at the short strike", () => {
    const legs = [createAnalyzerLeg({ right: "call", side: "sell", strike: 105, premium: 2, quantity: 1 })];
    const stock = { shares: 100, entry: 100 };
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "covered_call",
      strategyLabel: "Covered Call",
      expiration: "2026-10-16",
      legs,
      stock,
    });
    expect(out.option_premium).toBe(200);
    expect(out.cash_today).toBe(-9800);
    expect(out.max_profit).toBe(700);
    almost(out.breakevens[0], 98, 0.08);
    expect(pnlAt(legs, 0.01, stock)).toBeCloseTo(-9799, 0);
  });

  it("protective put floors the stock loss", () => {
    const legs = [createAnalyzerLeg({ right: "put", side: "buy", strike: 95, premium: 2, quantity: 1 })];
    const stock = { shares: 100, entry: 100 };
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "protective_put",
      strategyLabel: "Protective Put",
      expiration: "2026-10-16",
      legs,
      stock,
    });
    expect(out.option_premium).toBe(-200);
    expect(out.max_loss).toBe(700);
    expect(out.max_profit).toBeNull();
    almost(out.breakevens[0], 102, 0.08);
    expect(pnlAt(legs, 80, stock)).toBe(-700);
  });

  it("collar caps both the gain and the loss", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "buy", strike: 95, premium: 2, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 105, premium: 3, quantity: 1 }),
    ];
    const stock = { shares: 100, entry: 100 };
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "collar",
      strategyLabel: "Collar",
      expiration: "2026-10-16",
      legs,
      stock,
    });
    expect(out.option_premium).toBe(100);
    expect(out.max_profit).toBe(600);
    expect(out.max_loss).toBe(400);
    almost(out.breakevens[0], 99, 0.1);
  });

  it("cash-secured put keeps the credit if the stock stays above the strike", () => {
    const legs = [createAnalyzerLeg({ right: "put", side: "sell", strike: 95, premium: 2, quantity: 1 })];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "cash_secured_put",
      strategyLabel: "Cash-Secured Put",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.cash_today).toBe(200);
    expect(out.max_profit).toBe(200);
    almost(out.breakevens[0], 93, 0.08);
    almost(out.max_loss!, 9300, 2);
  });

  it("calendar values the far option with listed IV at the near expiration", () => {
    const near = createAnalyzerLeg({
      right: "call",
      side: "sell",
      strike: 100,
      premium: 3,
      quantity: 1,
      expiration: "2026-10-16",
    });
    const far = createAnalyzerLeg({
      right: "call",
      side: "buy",
      strike: 100,
      premium: 5,
      quantity: 1,
      expiration: "2026-12-18",
      iv: 0.3,
    });
    const years = yearFraction("2026-10-16", "2026-12-18");
    expect(years).toBeGreaterThan(0.1);
    const residual = { farExpiration: "2026-12-18", years };
    const farStill = blackScholesPrice("call", 100, 100, years, 0, 0.3);
    expect(farStill).toBeGreaterThan(2);
    const atPin = pnlAt([near, far], 100, null, residual);
    almost(atPin, 3 * 100 + (farStill - 5) * 100, 1);
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "calendar",
      strategyLabel: "Calendar Spread",
      expiration: "2026-10-16",
      farExpiration: "2026-12-18",
      legs: [near, far],
    });
    expect(out.cash_today).toBe(-200);
    expect(out.residual).toBe(true);
    expect(out.explanation).toContain("listed IV");
  });

  it("diagonal is a calendar with different strikes", () => {
    const near = createAnalyzerLeg({
      right: "call",
      side: "sell",
      strike: 105,
      premium: 2,
      quantity: 1,
      expiration: "2026-10-16",
    });
    const far = createAnalyzerLeg({
      right: "call",
      side: "buy",
      strike: 100,
      premium: 6,
      quantity: 1,
      expiration: "2026-12-18",
      iv: 0.28,
    });
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "diagonal",
      strategyLabel: "Diagonal Spread",
      expiration: "2026-10-16",
      farExpiration: "2026-12-18",
      legs: [near, far],
    });
    expect(out.cash_today).toBe(-400);
    expect(out.residual).toBe(true);
    expect(out.legs).toHaveLength(2);
  });

  it("does not invent payoff numbers — they come only from the supplied legs", () => {
    const cheap = analyzePayoff({
      symbol: "AAA",
      spot: 10,
      strategyId: "long_call",
      strategyLabel: "Long Call",
      expiration: "2026-11-20",
      legs: [createAnalyzerLeg({ right: "call", side: "buy", strike: 10, premium: 0.4, quantity: 1 })],
    });
    const rich = analyzePayoff({
      symbol: "BBB",
      spot: 10,
      strategyId: "long_call",
      strategyLabel: "Long Call",
      expiration: "2026-11-20",
      legs: [createAnalyzerLeg({ right: "call", side: "buy", strike: 10, premium: 1.2, quantity: 1 })],
    });
    expect(cheap.max_loss).toBe(40);
    expect(rich.max_loss).toBe(120);
    expect(cheap.explanation).toContain("AAA");
    expect(rich.explanation).toContain("BBB");
    expect(cheap.explanation).not.toContain("NVDA");
  });

  it("scenarios are percent moves of the live spot", () => {
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 80,
      strategyId: "long_call",
      strategyLabel: "Long Call",
      expiration: "2026-10-16",
      legs: [createAnalyzerLeg({ right: "call", side: "buy", strike: 80, premium: 2, quantity: 1 })],
    });
    expect(out.scenarios.map((s) => s.label)).toEqual(["-20%", "-10%", "Unchanged", "+10%", "+20%"]);
    expect(out.scenarios.find((s) => s.label === "Unchanged")!.price).toBe(80);
    expect(out.scenarios.find((s) => s.label === "+10%")!.price).toBe(88);
  });
});

