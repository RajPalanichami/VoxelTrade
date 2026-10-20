import {
  computeRiskReward,
  type OpportunityEventFlag,
  type OpportunitySettings,
  type OpportunityState,
  type OpportunityBucket,
  type RrStatus,
  type TradeReadiness,
  type VwapDistanceStatus,
  type VwapStatus,
  type VolumeBreakoutLabel,
} from "@/lib/opportunity";

export function volumeLabels(input: {
  rvol: number | null;
  trend: "Improving" | "Stable" | "Fading" | string;
  broken: boolean;
  confirmed: boolean;
}): { display: string; breakoutVolume: VolumeBreakoutLabel; trendLabel: string } {
  const rvol = input.rvol;
  const rvolText = rvol != null ? `Relative Volume ${rvol.toFixed(2)}x` : "Relative Volume unavailable";
  let trendLabel = "Volume Neutral";
  if (input.trend === "Improving") trendLabel = rvol != null && rvol >= 1.2 ? "Volume Expansion" : "Volume Building";
  else if (input.trend === "Fading") trendLabel = "Volume Contracting";
  else if (rvol != null && rvol >= 1) trendLabel = "Above Average Volume";
  else if (rvol != null && rvol < 0.85) trendLabel = "Volume Contracting";
  let breakoutVolume: VolumeBreakoutLabel = "NOT YET CONFIRMED";
  if (input.confirmed) breakoutVolume = "CONFIRMED";
  else if (input.broken) breakoutVolume = "DETECTED";
  const display = input.confirmed
    ? `Breakout Volume Confirmed · ${rvolText}`
    : input.broken
      ? `Breakout Volume Detected · ${rvolText}`
      : `${rvolText} · ${trendLabel}`;
  return { display, breakoutVolume, trendLabel };
}

export function classifyVwapStatus(distPct: number | null, slope: number | null, reclaiming: boolean, lost: boolean): VwapStatus {
  if (lost) return "LOST_VWAP";
  if (reclaiming) return "RECLAIMING";
  if (distPct == null) return "NEUTRAL";
  if (distPct >= 0.2 && (slope ?? 0) >= 0) return distPct > 2.4 ? "STRONG_SUPPORT" : "SUPPORT";
  if (distPct >= 0.05) return "ABOVE_VWAP";
  if (distPct > -0.15) return "NEUTRAL";
  if (distPct <= -2.2) return "STRONG_RESISTANCE";
  if (distPct <= -0.2) return "RESISTANCE";
  return "BELOW_VWAP";
}

export function vwapDistanceStatus(distPct: number | null, threshold: number): VwapDistanceStatus {
  if (distPct == null) return "NORMAL";
  if (distPct >= threshold * 1.4) return "VERY EXTENDED";
  if (distPct >= threshold) return "EXTENDED";
  return "NORMAL";
}

export function describeRr(rr: number | null, status: RrStatus, entry: number | null, stop: number | null, target: number | null) {
  if (entry == null) return { label: "R:R: N/A", reason: "No confirmed entry trigger." };
  if (stop == null) return { label: "R:R: N/A", reason: "No valid structural invalidation." };
  if (target == null) return { label: "R:R: N/A", reason: "No valid structural target." };
  if (rr == null) return { label: "R:R: N/A", reason: "Risk or reward is not positive from the structural levels." };
  if (status === "POOR / NO TRADE" || status === "WEAK") {
    return {
      label: `R:R ${rr.toFixed(2)} : 1`,
      reason: "Nearest structural resistance is too close relative to the required invalidation distance.",
    };
  }
  return { label: `R:R ${rr.toFixed(2)} : 1`, reason: `${status} risk/reward from structural invalidation to T1.` };
}

export function readinessFromParts(input: {
  technical: number;
  entry: number;
  rr: number | null;
  minRR: number;
  vwapOk: boolean;
  overextended: boolean;
  regime: string;
  negativeCatalyst: boolean;
  conflict: boolean;
  state: OpportunityState;
}): { label: TradeReadiness; score: number } {
  let score = Math.round(input.technical * 0.28 + input.entry * 0.22 + (input.rr == null ? 20 : Math.min(100, input.rr * 28)) * 0.22 + (input.vwapOk ? 18 : 6));
  if (input.rr != null && input.rr < 1) score = Math.min(score, 34);
  if (input.rr != null && input.rr < input.minRR) score = Math.min(score, 48);
  if (input.overextended) score -= 14;
  if (input.regime === "BEARISH") score -= 16;
  if (input.regime === "CAUTIOUS") score -= 6;
  if (input.negativeCatalyst) score -= 10;
  if (input.conflict) score -= 8;
  if (input.state === "NO TRADE" || input.state === "INSUFFICIENT DATA") score = Math.min(score, 20);
  score = Math.max(0, Math.min(100, score));
  let label: TradeReadiness = "MODERATE";
  if (input.state === "NO TRADE" || score < 28) label = "NO TRADE";
  else if (score < 40) label = "VERY LOW";
  else if (score < 52) label = "LOW";
  else if (score < 68) label = "MODERATE";
  else if (score < 82) label = "HIGH";
  else label = "VERY HIGH";
  if (input.rr != null && input.rr < 1 && label !== "NO TRADE") label = label === "VERY LOW" ? "VERY LOW" : "LOW";
  if (input.rr != null && input.rr < 1) {
    if (label === "VERY HIGH" || label === "HIGH" || label === "MODERATE") label = "LOW";
  }
  return { label, score };
}

export function resolveOpportunityState(input: {
  nearRes: boolean;
  closedAbove: boolean;
  heldAbove: boolean;
  volumeOk: boolean;
  vwapOk: boolean;
  retestHold: boolean;
  failedBreakout: boolean;
  lostVwapAfterBreak: boolean;
  dailyBullish: boolean;
  structureConflict: boolean;
  insufficient: boolean;
}): { state: OpportunityState; event: OpportunityEventFlag | null; reason: string } {
  if (input.insufficient) return { state: "INSUFFICIENT DATA", event: null, reason: "Required market data is unavailable." };
  if (input.failedBreakout) {
    return {
      state: "DEVELOPING",
      event: "FAILED_BREAKOUT",
      reason: "Price closed back below the breakout level. Previous setup failed; current conditions are rebuilding.",
    };
  }
  if (input.lostVwapAfterBreak) {
    return {
      state: "DEVELOPING",
      event: "LOST_VWAP",
      reason: "Breakout lost VWAP support. Previous event remains in history.",
    };
  }
  if (input.retestHold && input.closedAbove && input.volumeOk) {
    return { state: "RETEST", event: null, reason: "Breakout level is being retested and holding." };
  }
  if (input.closedAbove && input.heldAbove && input.volumeOk && input.vwapOk) {
    return { state: "CONFIRMED", event: null, reason: "Close above resistance with volume and VWAP support." };
  }
  if (input.closedAbove && input.heldAbove) {
    return { state: "TRIGGERED", event: null, reason: "Close above resistance is waiting for volume/VWAP confirmation." };
  }
  if (input.nearRes && input.dailyBullish && !input.structureConflict) {
    return { state: "PRE-BREAKOUT", event: null, reason: "Price is approaching a structural resistance with constructive structure." };
  }
  if (input.dailyBullish) return { state: "DEVELOPING", event: null, reason: "Structure is constructive but the trigger is not close." };
  if (input.structureConflict) return { state: "NO TRADE", event: null, reason: "Timeframe or pattern/structure conflict blocks an actionable setup." };
  return { state: "NO TRADE", event: null, reason: "Technical conditions are not sufficiently aligned." };
}

export function classifyBucket(input: {
  state: OpportunityState;
  technical: number | null;
  rr: number | null;
  minRR: number;
  minTechnical: number;
  conflict: boolean;
  negativeCatalyst: boolean;
  vwapOk: boolean;
}): OpportunityBucket {
  if (input.state === "INSUFFICIENT DATA") return "INSUFFICIENT";
  const actionableState = ["PRE-BREAKOUT", "TRIGGERED", "CONFIRMED", "RETEST", "ACTIVE"].includes(input.state);
  const tradeable =
    actionableState &&
    (input.technical ?? 0) >= input.minTechnical &&
    input.rr != null &&
    input.rr >= input.minRR &&
    !input.conflict &&
    !input.negativeCatalyst &&
    input.vwapOk;
  if (tradeable) return "BREAKOUT_WATCH";
  if ((input.technical ?? 0) >= input.minTechnical && input.state !== "NO TRADE") return "TECHNICAL_WATCH";
  return "NO_TRADE";
}

export function longRiskReward(entry: number | null, invalidation: number | null, target: number | null) {
  return computeRiskReward(entry, invalidation, target, "long");
}

export function shortRiskReward(entry: number | null, invalidation: number | null, target: number | null) {
  return computeRiskReward(entry, invalidation, target, "short");
}
