import { describe, expect, it } from "vitest";
import { computeRiskReward, rrStatus } from "@/lib/opportunity";
import { detectStructuralLevels } from "@/src/engines/opportunityResistance";
import {
  classifyBucket,
  longRiskReward,
  resolveOpportunityState,
  shortRiskReward,
  volumeLabels,
} from "@/src/engines/opportunityScoring";
import type { OHLCVBar } from "@/src/types/domain";

function bars(closes: number[], highs?: number[]): OHLCVBar[] {
  return closes.map((close, i) => ({
    symbol: "TEST",
    timestamp: new Date(Date.UTC(2025, 0, 2 + i, 21, 0, 0)),
    open: close - 0.3,
    high: highs?.[i] ?? close + 0.8,
    low: close - 0.9,
    close,
    volume: 1_000_000,
    timeframe: "1d",
    source: "test",
  }));
}

describe("risk/reward math", () => {
  it("computes long and short R:R from structural levels", () => {
    expect(computeRiskReward(100, 96, 108).rr).toBe(2);
    expect(computeRiskReward(100, 96, 100.96).rr).toBe(0.24);
    expect(computeRiskReward(100, 96, 106).rr).toBe(1.5);
    expect(computeRiskReward(100, 96, 104).rr).toBe(1);
    expect(computeRiskReward(100, 96, 112).rr).toBe(3);
    expect(shortRiskReward(100, 104, 92).rr).toBe(2);
    expect(longRiskReward(null, 96, 108).rr).toBeNull();
    expect(rrStatus(0.24)).toBe("POOR / NO TRADE");
    expect(rrStatus(1.5)).toBe("ACCEPTABLE");
    expect(rrStatus(3)).toBe("VERY STRONG");
  });

  it("does not fabricate R:R when a level is missing", () => {
    expect(computeRiskReward(100, null, 108).status).toBe("N/A");
    expect(computeRiskReward(100, 100, 108).rr).toBeNull();
  });
});

describe("volume labels", () => {
  it("does not say Breakout Volume before a breakout", () => {
    const pre = volumeLabels({ rvol: 1.42, trend: "Improving", broken: false, confirmed: false });
    expect(pre.breakoutVolume).toBe("NOT YET CONFIRMED");
    expect(pre.display).not.toMatch(/^Breakout Volume$/);
    expect(pre.display).toMatch(/1\.42x/);
    const trig = volumeLabels({ rvol: 2.18, trend: "Improving", broken: true, confirmed: false });
    expect(trig.breakoutVolume).toBe("DETECTED");
    const conf = volumeLabels({ rvol: 2.18, trend: "Improving", broken: true, confirmed: true });
    expect(conf.breakoutVolume).toBe("CONFIRMED");
  });
});

describe("state machine", () => {
  it("keeps failed breakouts as history and current DEVELOPING", () => {
    const failed = resolveOpportunityState({
      nearRes: false,
      closedAbove: false,
      heldAbove: false,
      volumeOk: false,
      vwapOk: true,
      retestHold: false,
      failedBreakout: true,
      lostVwapAfterBreak: false,
      dailyBullish: true,
      structureConflict: false,
      insufficient: false,
    });
    expect(failed.state).toBe("DEVELOPING");
    expect(failed.event).toBe("FAILED_BREAKOUT");
  });

  it("transitions through pre-breakout, trigger, confirm, retest", () => {
    expect(resolveOpportunityState({
      nearRes: true, closedAbove: false, heldAbove: false, volumeOk: false, vwapOk: true, retestHold: false,
      failedBreakout: false, lostVwapAfterBreak: false, dailyBullish: true, structureConflict: false, insufficient: false,
    }).state).toBe("PRE-BREAKOUT");
    expect(resolveOpportunityState({
      nearRes: true, closedAbove: true, heldAbove: true, volumeOk: false, vwapOk: true, retestHold: false,
      failedBreakout: false, lostVwapAfterBreak: false, dailyBullish: true, structureConflict: false, insufficient: false,
    }).state).toBe("TRIGGERED");
    expect(resolveOpportunityState({
      nearRes: false, closedAbove: true, heldAbove: true, volumeOk: true, vwapOk: true, retestHold: false,
      failedBreakout: false, lostVwapAfterBreak: false, dailyBullish: true, structureConflict: false, insufficient: false,
    }).state).toBe("CONFIRMED");
    expect(resolveOpportunityState({
      nearRes: false, closedAbove: true, heldAbove: true, volumeOk: true, vwapOk: true, retestHold: true,
      failedBreakout: false, lostVwapAfterBreak: false, dailyBullish: true, structureConflict: false, insufficient: false,
    }).state).toBe("RETEST");
    expect(resolveOpportunityState({
      nearRes: false, closedAbove: false, heldAbove: false, volumeOk: false, vwapOk: false, retestHold: false,
      failedBreakout: false, lostVwapAfterBreak: false, dailyBullish: false, structureConflict: false, insufficient: true,
    }).state).toBe("INSUFFICIENT DATA");
  });
});

describe("structural resistance", () => {
  it("uses swing highs, previous day high, and 52-week high instead of price + percent", () => {
    const closes = [...Array.from({ length: 40 }, (_, i) => 90 + i * 0.2), ...Array.from({ length: 15 }, () => 99.2)];
    const highs = closes.map((c, i) => (i === 30 ? 102.4 : c + 0.6));
    const daily = bars(closes, highs);
    daily[daily.length - 2].high = 101.1;
    const { resistances } = detectStructuralLevels({ price: 99.2, daily, week52High: 110 });
    expect(resistances.some((r) => r.source === "52_WEEK_HIGH" && r.price === 110)).toBe(true);
    expect(resistances.some((r) => r.source === "PREVIOUS_DAY_HIGH")).toBe(true);
    expect(resistances.every((r) => r.price !== 99.2 * 1.004)).toBe(true);
    expect(resistances.some((r) => r.testCount >= 1 && r.source !== "52_WEEK_HIGH")).toBe(true);
  });

  it("detects a consolidation high from a tight range", () => {
    const daily = bars(Array.from({ length: 30 }, () => 50 + Math.random() * 0.4));
    const { resistances } = detectStructuralLevels({ price: 50.1, daily });
    expect(resistances.some((r) => r.source === "CONSOLIDATION_HIGH" || r.source === "SWING_HIGH" || r.source === "PREVIOUS_DAY_HIGH")).toBe(true);
  });
});

describe("buckets", () => {
  it("sends poor R:R to technical watch instead of breakout watch", () => {
    expect(classifyBucket({
      state: "PRE-BREAKOUT",
      technical: 81,
      rr: 0.24,
      minRR: 1.5,
      minTechnical: 65,
      conflict: false,
      negativeCatalyst: false,
      vwapOk: true,
    })).toBe("TECHNICAL_WATCH");
    expect(classifyBucket({
      state: "PRE-BREAKOUT",
      technical: 81,
      rr: 1.8,
      minRR: 1.5,
      minTechnical: 65,
      conflict: false,
      negativeCatalyst: false,
      vwapOk: true,
    })).toBe("BREAKOUT_WATCH");
  });
});
