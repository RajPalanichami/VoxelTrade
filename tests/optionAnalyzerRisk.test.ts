import { describe, expect, it } from "vitest";
import {
  analyzePayoff,
  calculatePayoff,
  classifyRiskWarning,
  createAnalyzerLeg,
  effectiveCostBasis,
  lossToPremiumRatio,
  marketDataFreshness,
  pnlAt,
  resolveEntryPremium,
} from "@/src/engines/optionAnalyzerPayoff";

function almost(a: number, b: number, tol = 0.6) {
  expect(Math.abs(a - b)).toBeLessThan(tol);
}

describe("option analyzer maximum-loss engine", () => {
  it("resolves bid, ask, mid, last, and custom premiums", () => {
    expect(resolveEntryPremium({ side: "buy", bid: 1, ask: 1.4, mid: 1.2, last: 1.3, source: "ask" }).premium).toBe(1.4);
    expect(resolveEntryPremium({ side: "sell", bid: 1, ask: 1.4, last: 1.3, source: "bid" }).premium).toBe(1);
    expect(resolveEntryPremium({ side: "buy", bid: 1, ask: 1.4, source: "mid" }).premium).toBe(1.2);
    expect(resolveEntryPremium({ side: "buy", last: 1.7, source: "last" }).premium).toBe(1.7);
    expect(resolveEntryPremium({ side: "buy", source: "custom", custom: 2.25 }).premium).toBe(2.25);
  });

  it("long call: max loss equals premium and profit is unbounded above breakeven", () => {
    const legs = [createAnalyzerLeg({ right: "call", side: "buy", strike: 100, premium: 2.5, quantity: 1 })];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "long_call",
      strategyLabel: "Long Call",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.max_loss).toBe(250);
    expect(out.max_loss_status).toBe("LIMITED");
    expect(out.max_profit).toBeNull();
    expect(out.max_profit_status).toBe("UNLIMITED");
    expect(out.premium_paid).toBe(250);
    expect(out.net_debit).toBe(250);
    expect(out.warning.kind).toBe("limited_debit");
    expect(pnlAt(legs, 102.5)).toBeCloseTo(0, 1);
    expect(pnlAt(legs, 120)).toBeGreaterThan(pnlAt(legs, 110));
  });

  it("long put: max loss equals premium and max profit is at zero", () => {
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
    expect(pnlAt(legs, 0.01)).toBeGreaterThan(4800);
    expect(out.strike_rows.some((r) => r.price < 1 && r.status === "Maximum Profit")).toBe(true);
  });

  it("bull put spread: max profit = credit, max loss = width − credit, and loss exceeds credit", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "sell", strike: 205, premium: 5, quantity: 1, bid: 5, ask: 5.1 }),
      createAnalyzerLeg({ right: "put", side: "buy", strike: 195, premium: 2, quantity: 1, bid: 1.9, ask: 2 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 210,
      strategyId: "bull_put_spread",
      strategyLabel: "Bull Put Spread",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.net_credit).toBe(300);
    expect(out.max_profit).toBe(300);
    expect(out.max_loss).toBe(700);
    expect(out.risk_beyond_credit).toBe(400);
    expect(out.warning.kind).toBe("exceeds_credit");
    expect(out.max_loss_region).toMatch(/at or below \$195/);
    expect(out.explanation).not.toMatch(/only lose/i);
    const ten = analyzePayoff({
      symbol: "TEST",
      spot: 210,
      strategyId: "bull_put_spread",
      strategyLabel: "Bull Put Spread",
      expiration: "2026-10-16",
      legs: legs.map((l) => ({ ...l, quantity: 10 })),
      contracts: 10,
    });
    expect(ten.max_loss).toBe(7000);
    expect(ten.net_credit).toBe(3000);
  });

  it("bear call spread: width − credit and risk exceeds credit", () => {
    const legs = [
      createAnalyzerLeg({ right: "call", side: "sell", strike: 215, premium: 6, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "buy", strike: 225, premium: 2, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 210,
      strategyId: "bear_call_spread",
      strategyLabel: "Bear Call Spread",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.net_credit).toBe(400);
    expect(out.max_profit).toBe(400);
    expect(out.max_loss).toBe(600);
    expect(out.risk_beyond_credit).toBe(200);
    expect(out.max_loss_region).toMatch(/at or above \$225/);
    expect(out.warning.body).toMatch(/lose up to/);
  });

  it("iron butterfly: max loss is wing width minus credit, not the premium", () => {
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
    expect(out.max_profit).toBe(400);
    almost(out.max_loss!, 600, 1);
    expect(out.max_loss).not.toBe(out.net_credit);
    expect(out.side_losses?.putSideMaxLoss).toBe(600);
    expect(out.side_losses?.callSideMaxLoss).toBe(600);
    expect(pnlAt(legs, 100)).toBe(400);
  });

  it("iron condor: put-side, call-side, and overall max loss from the payoff", () => {
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
    expect(out.net_credit).toBe(200);
    expect(out.max_profit).toBe(200);
    expect(out.side_losses?.putSideMaxLoss).toBe(300);
    expect(out.side_losses?.callSideMaxLoss).toBe(300);
    expect(out.side_losses?.overallMaxLoss).toBe(300);
    expect(out.max_loss).toBe(300);
    expect(out.warning.kind).toBe("exceeds_credit");
  });

  it("asymmetric iron condor uses each wing independently", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "buy", strike: 80, premium: 0.5, quantity: 1 }),
      createAnalyzerLeg({ right: "put", side: "sell", strike: 95, premium: 2, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 105, premium: 2, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "buy", strike: 110, premium: 0.5, quantity: 1 }),
    ];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 100,
      strategyId: "iron_condor",
      strategyLabel: "Iron Condor",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.side_losses?.putSideMaxLoss).toBeGreaterThan(out.side_losses!.callSideMaxLoss);
    expect(out.max_loss).toBe(out.side_losses?.overallMaxLoss);
  });

  it("short call: premium is max profit and max loss is unlimited", () => {
    const legs = [createAnalyzerLeg({ right: "call", side: "sell", strike: 200, premium: 6, quantity: 1 })];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 200,
      strategyId: "short_call",
      strategyLabel: "Short Call",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.max_profit).toBe(600);
    expect(out.max_loss).toBeNull();
    expect(out.max_loss_status).toBe("UNLIMITED");
    expect(out.warning.kind).toBe("unlimited");
    expect(out.chart_domain.lossContinues).toBe(true);
    expect(pnlAt(legs, 260)).toBeLessThan(pnlAt(legs, 240));
  });

  it("short put: max loss is (strike − premium) × multiplier", () => {
    const legs = [createAnalyzerLeg({ right: "put", side: "sell", strike: 200, premium: 5, quantity: 1 })];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 210,
      strategyId: "short_put",
      strategyLabel: "Short Put",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.premium_received).toBe(500);
    expect(out.max_profit).toBe(500);
    expect(out.max_loss).toBe(19500);
    expect(out.max_loss_region || "").toMatch(/\$0\.00|at or below/);
    expect(out.loss_to_premium_ratio).toBe(39);
  });

  it("cash-secured put distinguishes collateral from maximum loss", () => {
    const legs = [createAnalyzerLeg({ right: "put", side: "sell", strike: 200, premium: 5, quantity: 1 })];
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 210,
      strategyId: "cash_secured_put",
      strategyLabel: "Cash-Secured Put",
      expiration: "2026-10-16",
      legs,
    });
    expect(out.effective_cost_basis).toBe(195);
    expect(out.max_loss).toBe(19500);
    expect(out.required_capital).toBe(20000);
    expect(out.required_capital).not.toBe(out.max_loss);
    expect(effectiveCostBasis(legs)).toBe(195);
  });

  it("covered call max loss includes the stock, not just the call premium", () => {
    const legs = [createAnalyzerLeg({ right: "call", side: "sell", strike: 220, premium: 5, quantity: 1 })];
    const stock = { shares: 100, entry: 211, side: "LONG" as const };
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 211,
      strategyId: "covered_call",
      strategyLabel: "Covered Call",
      expiration: "2026-10-16",
      legs,
      stock,
    });
    expect(out.premium_received).toBe(500);
    expect(out.effective_cost_basis).toBe(206);
    almost(out.max_loss!, 20600, 2);
    expect(out.max_loss).toBeGreaterThan(500);
    expect(out.warning.kind).toBe("stock_plus_option");
    expect(out.upside_cap).toBe(220);
  });

  it("protective put combined loss exceeds the put premium", () => {
    const legs = [createAnalyzerLeg({ right: "put", side: "buy", strike: 200, premium: 6, quantity: 1 })];
    const stock = { shares: 100, entry: 211, side: "LONG" as const };
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 211,
      strategyId: "protective_put",
      strategyLabel: "Protective Put",
      expiration: "2026-10-16",
      legs,
      stock,
    });
    expect(out.premium_paid).toBe(600);
    expect(out.max_loss).toBe(1700);
    expect(pnlAt(legs, 0.01, stock)).toBeCloseTo(-1700, 0);
    expect(out.warning.kind).toBe("stock_plus_option");
    expect(out.downside_protection).toBe(200);
  });

  it("collar uses the full stock + options payoff", () => {
    const legs = [
      createAnalyzerLeg({ right: "put", side: "buy", strike: 200, premium: 6, quantity: 1 }),
      createAnalyzerLeg({ right: "call", side: "sell", strike: 225, premium: 4, quantity: 1 }),
    ];
    const stock = { shares: 100, entry: 211, side: "LONG" as const };
    const out = analyzePayoff({
      symbol: "TEST",
      spot: 211,
      strategyId: "collar",
      strategyLabel: "Collar",
      expiration: "2026-10-16",
      legs,
      stock,
    });
    expect(out.max_loss).toBe(1300);
    expect(out.max_profit).toBe(1200);
    expect(out.max_loss).not.toBe(600);
    expect(out.downside_protection).toBe(200);
    expect(out.upside_cap).toBe(225);
  });

  it("calculatePayoff is the reusable source of truth for a generic position", () => {
    const result = calculatePayoff(
      {
        ticker: "TEST",
        underlyingPrice: 210,
        legs: [
          { side: "SELL", optionType: "PUT", strike: 205, premium: 5, quantity: 1, expiration: "2026-10-16", contractMultiplier: 100 },
          { side: "BUY", optionType: "PUT", strike: 195, premium: 2, quantity: 1, expiration: "2026-10-16", contractMultiplier: 100 },
        ],
      },
      210,
    );
    expect(result.netCredit).toBe(300);
    expect(result.maxProfit).toBe(300);
    expect(result.maxLoss).toBe(700);
    expect(result.maxLossStatus).toBe("LIMITED");
    expect(result.pnl).toBe(300);
  });

  it("handles zero premium, missing quotes, and delayed market data", () => {
    const zero = analyzePayoff({
      symbol: "TEST",
      spot: 50,
      strategyId: "long_call",
      strategyLabel: "Long Call",
      expiration: "2026-10-16",
      legs: [createAnalyzerLeg({ right: "call", side: "buy", strike: 50, premium: 0, quantity: 1 })],
    });
    expect(zero.max_loss).toBe(0);
    expect(lossToPremiumRatio(0, 0)).toBeNull();
    expect(resolveEntryPremium({ side: "buy", bid: null, ask: null, mid: 1.1 }).fallback).toBe(true);
    const delayed = marketDataFreshness("yfinance", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    expect(delayed.status).toBe("Delayed");
    expect(delayed.stale).toBe(true);
    expect(classifyRiskWarning({
      maxLoss: null,
      maxLossStatus: "UNLIMITED",
      netDebit: 0,
      netCredit: 600,
      premiumPaid: 0,
      usesStock: false,
    }).kind).toBe("unlimited");
  });

  it("rejects an inverted bull put construction", () => {
    expect(() =>
      analyzePayoff({
        symbol: "TEST",
        spot: 100,
        strategyId: "bull_put_spread",
        strategyLabel: "Bull Put Spread",
        expiration: "2026-10-16",
        legs: [
          createAnalyzerLeg({ right: "put", side: "sell", strike: 90, premium: 1, quantity: 1 }),
          createAnalyzerLeg({ right: "put", side: "buy", strike: 100, premium: 3, quantity: 1 }),
        ],
      }),
    ).toThrow(/higher-strike put/);
  });

  it("does not hardcode a strategy max loss", () => {
    const a = analyzePayoff({
      symbol: "AAA",
      spot: 100,
      strategyId: "bear_call_spread",
      strategyLabel: "Bear Call Spread",
      expiration: "2026-10-16",
      legs: [
        createAnalyzerLeg({ right: "call", side: "sell", strike: 100, premium: 4, quantity: 1 }),
        createAnalyzerLeg({ right: "call", side: "buy", strike: 105, premium: 2, quantity: 1 }),
      ],
    });
    const b = analyzePayoff({
      symbol: "BBB",
      spot: 100,
      strategyId: "bear_call_spread",
      strategyLabel: "Bear Call Spread",
      expiration: "2026-10-16",
      legs: [
        createAnalyzerLeg({ right: "call", side: "sell", strike: 100, premium: 8, quantity: 1 }),
        createAnalyzerLeg({ right: "call", side: "buy", strike: 110, premium: 2, quantity: 1 }),
      ],
    });
    expect(a.max_loss).toBe(300);
    expect(b.max_loss).toBe(400);
    expect(a.explanation).not.toContain("NVDA");
  });
});
