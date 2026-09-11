import { describe, expect, it } from "vitest";
import { buildPayoff, cashToday, createLeg, intrinsic, legPnl } from "@/src/engines/optionsPayoff";

describe("options payoff", () => {
  it("computes intrinsic call and put", () => {
    expect(intrinsic("call", 110, 100)).toBe(10);
    expect(intrinsic("call", 90, 100)).toBe(0);
    expect(intrinsic("put", 90, 100)).toBe(10);
    expect(intrinsic("put", 110, 100)).toBe(0);
  });

  it("long call max loss is premium", () => {
    const leg = createLeg({ right: "call", side: "buy", strike: 100, premium: 2.5, quantity: 1 });
    expect(cashToday([leg])).toBe(-250);
    expect(legPnl(leg, 100)).toBe(-250);
    expect(Math.abs(legPnl(leg, 110) - 750)).toBeLessThan(1e-6);
    const out = buildPayoff([leg], 100) as Record<string, unknown>;
    expect(out.max_loss).toBe(-250);
    expect(out.max_gain).toBeNull();
    expect(Math.abs((out.breakevens as number[])[0] - 102.5)).toBeLessThan(0.05);
  });

  it("long put breakeven", () => {
    const leg = createLeg({ right: "put", side: "buy", strike: 50, premium: 1, quantity: 1 });
    const out = buildPayoff([leg], 50) as Record<string, unknown>;
    expect(out.max_loss).toBe(-100);
    expect(Math.abs((out.breakevens as number[])[0] - 49)).toBeLessThan(0.05);
    expect(out.cash_today).toBe(-100);
  });

  it("short call has unlimited loss", () => {
    const leg = createLeg({ right: "call", side: "sell", strike: 100, premium: 3, quantity: 1 });
    const out = buildPayoff([leg], 100) as Record<string, unknown>;
    expect(out.max_gain).toBe(300);
    expect(out.max_loss).toBeNull();
    expect(out.cash_today).toBe(300);
  });

  it("call spread is defined risk", () => {
    const legs = [
      createLeg({ right: "call", side: "buy", strike: 100, premium: 4, quantity: 1 }),
      createLeg({ right: "call", side: "sell", strike: 110, premium: 1.5, quantity: 1 }),
    ];
    const out = buildPayoff(legs, 100) as Record<string, unknown>;
    expect(out.cash_today).toBe(-250);
    expect(out.max_loss).toBe(-250);
    expect(Math.abs((out.max_gain as number) - 750)).toBeLessThan(1);
  });

  it("covered call includes stock", () => {
    const leg = createLeg({ right: "call", side: "sell", strike: 105, premium: 2, quantity: 1 });
    const out = buildPayoff([leg], 100, 100, 100) as Record<string, unknown>;
    expect(out.cash_today).toBe(-9800);
    expect(out.max_gain).toBe(700);
  });

  it("long straddle loses if unchanged", () => {
    const legs = [
      createLeg({ right: "call", side: "buy", strike: 50, premium: 2, quantity: 1 }),
      createLeg({ right: "put", side: "buy", strike: 50, premium: 2, quantity: 1 }),
    ];
    const out = buildPayoff(legs, 50) as Record<string, unknown>;
    expect(out.cash_today).toBe(-400);
    expect(out.at_spot_pnl).toBe(-400);
    expect((out.plain as { if_flat: string }).if_flat).toBeTruthy();
  });

  it("scenarios use percent of spot", () => {
    const leg = createLeg({ right: "call", side: "buy", strike: 20, premium: 1, quantity: 2 });
    const out = buildPayoff([leg], 20) as Record<string, unknown>;
    const labels = (out.scenarios as Array<{ label: string; pnl: number }>).map((s) => s.label);
    expect(labels).toEqual(["-20%", "-10%", "Unchanged", "+10%", "+20%"]);
    const unchanged = (out.scenarios as Array<{ label: string; pnl: number }>).find((s) => s.label === "Unchanged")!;
    expect(unchanged.pnl).toBe(-200);
  });
});
