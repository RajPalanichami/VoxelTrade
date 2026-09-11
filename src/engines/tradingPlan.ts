import { getSettings } from "@/src/config/env";
import type { Indicators, SRLevels, TradingPlan } from "@/src/types/domain";
import { emptyPlan } from "@/src/types/domain";

function mid(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  return (a + b) / 2;
}

export function buildPlans(ind: Indicators, levels: SRLevels, _timeframe: string): [TradingPlan, TradingPlan] {
  const settings = getSettings();
  const px = ind.last_close ?? null;
  const atr = ind.atr ?? null;
  const notesL: string[] = [];
  const notesS: string[] = [];

  const magnets = [ind.ema9, ind.ema21 ?? ind.ema20, ind.vwap, levels.s1].filter((x): x is number => x != null);
  let entryLow: number | null = px;
  let entryHigh: number | null = px;
  let ideal: number | null = px;
  let setup = "Insufficient structure for a refined entry zone";

  if (px != null && magnets.length) {
    const below = magnets.filter((m) => m <= px);
    const pullback = below.length ? Math.max(...below) : Math.min(...magnets);
    entryLow = Math.min(pullback, levels.s1 ?? pullback);
    entryHigh = Math.max(pullback, mid(pullback, px) ?? pullback);
    if (levels.s1 != null) entryLow = Math.min(entryLow, levels.s1);
    if (entryHigh > px) entryHigh = px;
    if (entryLow > entryHigh) [entryLow, entryHigh] = [entryHigh, entryLow];
    ideal = mid(entryLow, entryHigh);
    setup = "Buy pullback to VWAP / EMA / support";
    notesL.push("Preferred entry is a pullback, not chasing extended price.");
  }

  if (px != null && levels.r1 != null && px > levels.r1 && (ind.volume_ratio || 0) >= 1.2) {
    setup = "Breakout above R1 with volume confirmation";
    entryLow = levels.r1;
    entryHigh = levels.r1 * 1.001;
    ideal = mid(entryLow, entryHigh);
    notesL.push("Breakout path selected because price cleared R1 with volume.");
  }

  const stopCandidates: [string, number][] = [];
  if (levels.s2 != null) stopCandidates.push(["S2 structure", levels.s2]);
  if (levels.s1 != null) stopCandidates.push(["below S1", levels.s1 * 0.998]);
  if (levels.swing_low != null) stopCandidates.push(["swing low", levels.swing_low]);
  if (atr != null && (ideal ?? px) != null) stopCandidates.push(["1.25 ATR", (ideal ?? px)! - 1.25 * atr]);

  let longStop: number | null = null;
  let longStopWhy = "";
  const ref = ideal ?? px;
  if (ref != null && stopCandidates.length) {
    let valid = stopCandidates.filter(([, s]) => s < ref);
    if (valid.length) {
      if (atr != null) {
        const cap = ref - 2.5 * atr;
        const valid2 = valid.filter(([, s]) => s >= cap);
        if (valid2.length) valid = valid2;
      }
      const [why, s] = valid.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
      longStop = s;
      longStopWhy = why;
    }
  }
  if (longStopWhy) notesL.push(`Stop placed via ${longStopWhy} (structure, not a % rule).`);

  const t1 = levels.r1 ?? null;
  const t2 = levels.r2 ?? null;
  const t3 = levels.r3 ?? null;
  let risk: number | null = null;
  let reward: number | null = null;
  let rr: number | null = null;
  let allowed = false;
  let block: string | null = null;
  if (ref != null && longStop != null && t1 != null) {
    risk = ref - longStop;
    reward = t1 - ref;
    if (risk > 0) {
      rr = reward / risk;
      allowed = rr >= settings.minRiskReward;
      if (!allowed) block = `R:R ${rr.toFixed(2)} < ${settings.minRiskReward.toFixed(1)} minimum — NO TRADE`;
    } else block = "Non-positive risk distance — NO TRADE";
  } else if (ref == null) block = "No price — cannot form a plan";

  const longPlan = emptyPlan({
    bias: "BULLISH",
    setup,
    entry_low: entryLow != null ? Math.round(entryLow * 100) / 100 : null,
    entry_high: entryHigh != null ? Math.round(entryHigh * 100) / 100 : null,
    ideal_entry: ideal != null ? Math.round(ideal * 100) / 100 : null,
    stop: longStop != null ? Math.round(longStop * 100) / 100 : null,
    invalidation: longStop != null ? Math.round(longStop * 100) / 100 : null,
    target1: t1 != null ? Math.round(t1 * 100) / 100 : null,
    target2: t2 != null ? Math.round(t2 * 100) / 100 : null,
    target3: t3 != null ? Math.round(t3 * 100) / 100 : null,
    risk: risk != null ? Math.round(risk * 100) / 100 : null,
    reward: reward != null ? Math.round(reward * 100) / 100 : null,
    risk_reward: rr != null ? Math.round(rr * 100) / 100 : null,
    trade_allowed: allowed,
    block_reason: block,
    notes: notesL,
  });

  let sEntry = levels.s1 ?? (px != null ? px * 0.998 : null);
  let sStop: number | null = null;
  if (levels.r1 != null) sStop = levels.r1;
  else if (atr != null && sEntry != null) sStop = sEntry + 1.25 * atr;
  else if (levels.swing_high != null) sStop = levels.swing_high;
  let st1 = levels.s1 ?? null;
  let st2 = levels.s2 ?? null;
  let st3 = levels.s3 ?? null;
  if (sEntry != null && st1 != null && sEntry <= st1) {
    st1 = levels.s2 ?? null;
    st2 = levels.s3 ?? null;
    st3 = levels.s3 != null && atr != null ? levels.s3 - atr : null;
  }
  let sRisk: number | null = null;
  let sReward: number | null = null;
  let sRr: number | null = null;
  let sAllowed = false;
  let sBlock: string | null = null;
  if (sEntry != null && sStop != null && st1 != null) {
    sRisk = sStop - sEntry;
    sReward = sEntry - st1;
    if (sRisk > 0) {
      sRr = sReward / sRisk;
      sAllowed = sRr >= settings.minRiskReward;
      if (!sAllowed) sBlock = `Short R:R ${sRr.toFixed(2)} < ${settings.minRiskReward.toFixed(1)}`;
    } else sBlock = "Non-positive short risk";
  }
  notesS.push("Short triggers on failure to hold support / failed retest.");

  const shortPlan = emptyPlan({
    bias: "BEARISH",
    setup: "Short on loss of support / failed retest",
    entry_low: sEntry != null ? Math.round(sEntry * 0.999 * 100) / 100 : null,
    entry_high: sEntry != null ? Math.round(sEntry * 100) / 100 : null,
    ideal_entry: sEntry != null ? Math.round(sEntry * 100) / 100 : null,
    stop: sStop != null ? Math.round(sStop * 100) / 100 : null,
    invalidation: sStop != null ? Math.round(sStop * 100) / 100 : null,
    target1: st1 != null ? Math.round(st1 * 100) / 100 : null,
    target2: st2 != null ? Math.round(st2 * 100) / 100 : null,
    target3: st3 != null ? Math.round(st3 * 100) / 100 : null,
    risk: sRisk != null ? Math.round(sRisk * 100) / 100 : null,
    reward: sReward != null ? Math.round(sReward * 100) / 100 : null,
    risk_reward: sRr != null ? Math.round(sRr * 100) / 100 : null,
    trade_allowed: sAllowed,
    block_reason: sBlock,
    notes: notesS,
  });

  return [longPlan, shortPlan];
}
