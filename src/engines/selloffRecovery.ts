import { atr, ema, macd, rsi, swingPoints } from "@/src/engines/indicators";
import type { OHLCVBar } from "@/src/types/domain";
import type {
  BattleWinner,
  BreakoutSettings,
  DetectionFlag,
  PullbackType,
  RecoveryPhase,
  SelloffSeverity,
} from "@/lib/breakoutPotential";
import { detectCompression, measureCandles, seriesImproving } from "@/src/engines/breakoutCandles";

export type RecoveryEvent = {
  phase: RecoveryPhase;
  time: string;
  index: number;
  price: number;
  evidence: string[];
  rvol: number | null;
  rsi: number | null;
  macdHist: number | null;
  atr: number | null;
  support: number | null;
  resistance: number | null;
};

export type SelloffInfo = {
  startIndex: number;
  peakIndex: number;
  troughIndex: number;
  startTime: string;
  troughTime: string;
  peak: number;
  trough: number;
  declinePct: number;
  atrDecline: number | null;
  severity: SelloffSeverity;
  consecutiveDown: number;
};

export type VolumeBattle = {
  detected: boolean;
  level: number | null;
  volume: number | null;
  rvol: number | null;
  range: number | null;
  closeLocation: number | null;
  winner: BattleWinner;
};

function iso(bar: OHLCVBar) {
  return (bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp)).toISOString();
}

function lastNum(arr: Array<number | null>) {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i] as number;
  return null;
}

export function classifySelloffSeverity(atrDecline: number | null, settings: BreakoutSettings): SelloffSeverity {
  if (atrDecline == null) return "None";
  if (atrDecline >= settings.selloffAtrExtreme) return "Extreme";
  if (atrDecline >= settings.selloffAtrSevere) return "Severe";
  if (atrDecline >= settings.selloffAtrLarge) return "Large";
  if (atrDecline >= settings.selloffAtrMinor) return "Moderate";
  return "Minor";
}

export function detectSelloff(bars: OHLCVBar[], settings: BreakoutSettings): SelloffInfo | null {
  if (bars.length < 24) return null;
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const atrs = atr(highs, lows, closes, settings.atrPeriod);
  const [sh] = swingPoints(highs, lows, settings.swingLeft, settings.swingRight);
  let peakIndex = 0;
  let peak = highs[0];
  const searchFrom = Math.max(0, bars.length - Math.min(bars.length, 180));
  for (let i = searchFrom; i < bars.length - 3; i++) {
    if (sh[i] != null && highs[i] >= peak) {
      peak = highs[i];
      peakIndex = i;
    } else if (highs[i] > peak * 1.01) {
      peak = highs[i];
      peakIndex = i;
    }
  }
  let troughIndex = peakIndex;
  let trough = lows[peakIndex];
  for (let i = peakIndex; i < bars.length; i++) {
    if (lows[i] < trough) {
      trough = lows[i];
      troughIndex = i;
    }
  }
  if (troughIndex <= peakIndex) return null;
  const declinePct = ((peak - trough) / peak) * 100;
  const atrAtPeak = atrs[peakIndex] || lastNum(atrs.slice(0, peakIndex + 1)) || lastNum(atrs);
  const atrDecline = atrAtPeak && atrAtPeak > 0 ? (peak - trough) / atrAtPeak : null;
  let consecutiveDown = 0;
  let run = 0;
  for (let i = peakIndex; i <= troughIndex; i++) {
    if (bars[i].close < bars[i].open) {
      run += 1;
      consecutiveDown = Math.max(consecutiveDown, run);
    } else run = 0;
  }
  const severity = classifySelloffSeverity(atrDecline, settings);
  if (severity === "None" && declinePct < 4) return null;
  return {
    startIndex: peakIndex,
    peakIndex,
    troughIndex,
    startTime: iso(bars[peakIndex]),
    troughTime: iso(bars[troughIndex]),
    peak,
    trough,
    declinePct,
    atrDecline,
    severity,
    consecutiveDown,
  };
}

export function detectExhaustion(bars: OHLCVBar[], selloff: SelloffInfo | null, settings: BreakoutSettings): {
  flag: DetectionFlag;
  date: string | null;
  evidence: string[];
} {
  if (!selloff || bars.length < 8) return { flag: "INSUFFICIENT_DATA", date: null, evidence: ["Not enough data to judge selling exhaustion."] };
  const slice = bars.slice(selloff.peakIndex, Math.min(bars.length, selloff.troughIndex + 6));
  if (slice.length < 4) return { flag: "NOT_DETECTED", date: null, evidence: ["The decline window is too short to confirm exhaustion."] };
  const candles = measureCandles(slice, settings);
  const reds = candles.filter((c) => c.direction < 0);
  const bodies = reds.map((c) => c.bodyPercent);
  const shrinking = bodies.length >= 3 && bodies[bodies.length - 1] < bodies[0] * 0.55 && bodies[bodies.length - 1] < (bodies[1] || bodies[0]);
  const climax = reds.some((c) => (c.rvol ?? 0) >= settings.rvolHigh && c.kind === "STRONG_SELLING");
  const last = candles[candles.length - 1];
  const failedLow = last && last.low <= selloff.trough * 1.004 && last.close > selloff.trough * 1.004 && last.lowerWick > last.body;
  const closes = slice.map((b) => b.close);
  const rsiV = rsi(closes, 14);
  const [, , hist] = macd(closes);
  const priceLows = [selloff.trough, last?.low ?? selloff.trough];
  const rsiLows = [rsiV[Math.max(0, selloff.troughIndex - selloff.peakIndex)] ?? 30, lastNum(rsiV) ?? 30];
  const divergence = priceLows[1] <= priceLows[0] && rsiLows[1] > rsiLows[0];
  const evidence: string[] = [];
  if (shrinking) evidence.push("Downside candle size is contracting after the decline.");
  if (climax) evidence.push("A high-volume downside climax candle appeared.");
  if (failedLow) evidence.push("Price probed the low and closed back above it.");
  if (divergence) evidence.push("Momentum made a higher low while price did not expand the decline.");
  if (last && last.lowerWick > last.body * 1.2 && last.direction <= 0) evidence.push("A long lower wick rejected lower prices (not used alone).");
  if (evidence.length >= 2) return { flag: "DETECTED", date: last?.time || iso(slice[slice.length - 1]), evidence };
  if (evidence.length === 1) return { flag: "DEVELOPING", date: last?.time || null, evidence };
  return { flag: "NOT_DETECTED", date: null, evidence: ["Selling force has not clearly lost momentum."] };
}

export function detectStabilization(bars: OHLCVBar[], selloff: SelloffInfo | null, settings: BreakoutSettings): {
  flag: DetectionFlag;
  date: string | null;
  support: number | null;
  evidence: string[];
} {
  if (!selloff) return { flag: "NOT_DETECTED", date: null, support: null, evidence: [] };
  const after = bars.slice(selloff.troughIndex);
  if (after.length < 3) return { flag: "NOT_DETECTED", date: null, support: selloff.trough, evidence: ["Not enough candles after the trough."] };
  const lows = after.slice(0, Math.min(8, after.length)).map((b) => b.low);
  const newLowsStopped = Math.min(...lows.slice(-3)) >= selloff.trough * 0.997;
  const ranges = after.slice(0, 6).map((b) => b.high - b.low);
  const rangeDown = ranges.length >= 3 && ranges[ranges.length - 1] < ranges[0] * 0.85;
  const hold = after.slice(0, 5).every((b) => b.close >= selloff.trough * 0.992);
  const compression = detectCompression(after.slice(0, 20).length >= 12 ? after.slice(0, 20) : bars.slice(-20), settings);
  const evidence: string[] = [];
  if (newLowsStopped) evidence.push("New lows stopped.");
  if (rangeDown) evidence.push("Selling range decreased.");
  if (hold) evidence.push("Support held.");
  if (compression.state === "VOLATILITY_CONTRACTION" || compression.state === "COMPRESSION_TO_EXPANSION") evidence.push("Volatility contracted.");
  if (evidence.length >= 3) return { flag: "DETECTED", date: iso(after[Math.min(2, after.length - 1)]), support: selloff.trough, evidence };
  if (evidence.length >= 1) return { flag: "DEVELOPING", date: iso(after[0]), support: selloff.trough, evidence };
  return { flag: "NOT_DETECTED", date: null, support: selloff.trough, evidence };
}

export function detectFirstHigherLow(bars: OHLCVBar[], selloff: SelloffInfo | null, settings: BreakoutSettings) {
  if (!selloff) return { found: false as const, price: null as number | null, time: null as string | null, index: null as number | null };
  const lows = bars.map((b) => b.low);
  const highs = bars.map((b) => b.high);
  const [, sl] = swingPoints(highs, lows, settings.swingLeft, settings.swingRight);
  for (let i = selloff.troughIndex + 2; i < sl.length; i++) {
    const v = sl[i];
    if (v == null) continue;
    if (v > selloff.trough * 1.003) {
      return { found: true as const, price: v, time: iso(bars[i]), index: i };
    }
  }
  return { found: false as const, price: null, time: null, index: null };
}

export function detectVolumeBattle(bars: OHLCVBar[], level: number | null, settings: BreakoutSettings): VolumeBattle {
  if (!bars.length || level == null) {
    return { detected: false, level: null, volume: null, rvol: null, range: null, closeLocation: null, winner: "UNRESOLVED" };
  }
  const last = bars[bars.length - 1];
  const candles = measureCandles(bars.slice(-24), settings);
  const cur = candles[candles.length - 1];
  if (!cur || (cur.rvol ?? 0) < settings.rvolHigh) {
    return { detected: false, level, volume: last.volume, rvol: cur?.rvol ?? null, range: cur?.range ?? null, closeLocation: cur?.closeLocation ?? null, winner: "UNRESOLVED" };
  }
  const near = Math.abs(last.close - level) / level <= 0.012 || (last.low <= level && last.high >= level);
  if (!near) {
    return { detected: false, level, volume: last.volume, rvol: cur.rvol, range: cur.range, closeLocation: cur.closeLocation, winner: "UNRESOLVED" };
  }
  const winner: BattleWinner = cur.closeLocation >= 0.62 ? "BUYERS" : cur.closeLocation <= 0.38 ? "SELLERS" : "UNRESOLVED";
  return { detected: true, level, volume: last.volume, rvol: cur.rvol, range: cur.range, closeLocation: cur.closeLocation, winner };
}

export function classifyPullback(bars: OHLCVBar[], higherLow: number | null, settings: BreakoutSettings): PullbackType {
  if (bars.length < 6 || higherLow == null) return "None";
  const last = bars[bars.length - 1];
  const recentHigh = Math.max(...bars.slice(-8).map((b) => b.high));
  const offHigh = (recentHigh - last.close) / recentHigh;
  const candles = measureCandles(bars.slice(-8), settings);
  const lastC = candles[candles.length - 1];
  const highSell = lastC && lastC.direction < 0 && (lastC.rvol ?? 0) >= settings.rvolHigh;
  if (last.close < higherLow * 0.995) return highSell ? "Trend Breakdown" : "Dangerous";
  if (highSell && offHigh > 0.04) return "Dangerous";
  if (offHigh > 0.06) return "Deep";
  if (lastC && lastC.direction < 0 && (lastC.rvol ?? 1) < settings.rvolLow) return "Healthy";
  if (offHigh > 0.015) return "Normal";
  return "None";
}

export function walkRecovery(bars: OHLCVBar[], settings: BreakoutSettings, resistance: number | null): {
  events: RecoveryEvent[];
  current: RecoveryPhase;
  selloff: SelloffInfo | null;
  exhaustion: ReturnType<typeof detectExhaustion>;
  stabilization: ReturnType<typeof detectStabilization>;
  firstHL: ReturnType<typeof detectFirstHigherLow>;
  battle: VolumeBattle;
  pullback: PullbackType;
  primarySupport: number | null;
  secondarySupport: number | null;
} {
  const candles = measureCandles(bars, settings);
  const selloff = detectSelloff(bars, settings);
  const exhaustion = detectExhaustion(bars, selloff, settings);
  const stabilization = detectStabilization(bars, selloff, settings);
  const firstHL = detectFirstHigherLow(bars, selloff, settings);
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const rsiV = rsi(closes, 14);
  const [, , hist] = macd(closes);
  const atrs = atr(highs, lows, closes, settings.atrPeriod);
  const ema20 = ema(closes, 20);
  const events: RecoveryEvent[] = [];
  const push = (phase: RecoveryPhase, index: number, evidence: string[]) => {
    const bar = bars[index];
    if (!bar) return;
    events.push({
      phase,
      time: iso(bar),
      index,
      price: bar.close,
      evidence,
      rvol: candles[index]?.rvol ?? null,
      rsi: rsiV[index] ?? null,
      macdHist: hist[index] ?? null,
      atr: atrs[index] ?? null,
      support: firstHL.price ?? selloff?.trough ?? null,
      resistance,
    });
  };

  if (selloff && (selloff.severity === "Large" || selloff.severity === "Severe" || selloff.severity === "Extreme" || selloff.severity === "Moderate")) {
    push("LARGE_SELLOFF", selloff.peakIndex, [`Peak-to-trough ${selloff.declinePct.toFixed(1)}%`, `ATR-normalized ${selloff.atrDecline?.toFixed(2) ?? "n/a"}`, `Severity ${selloff.severity}`]);
  }
  if (exhaustion.flag !== "NOT_DETECTED" && exhaustion.flag !== "INSUFFICIENT_DATA" && selloff) {
    push("SELLING_EXHAUSTION", Math.min(bars.length - 1, selloff.troughIndex), exhaustion.evidence);
  }
  if (stabilization.flag === "DETECTED" && selloff) {
    const idx = Math.min(bars.length - 1, selloff.troughIndex + 2);
    push("STABILIZATION", idx, stabilization.evidence);
  }
  if (firstHL.found && firstHL.index != null) {
    push("FIRST_HIGHER_LOW", firstHL.index, [`First higher low at ${firstHL.price?.toFixed(2)} after selloff low ${selloff?.trough.toFixed(2)}.`]);
  }

  const last = bars[bars.length - 1];
  const lastC = candles[candles.length - 1];
  const hl = firstHL.price;
  const recovered = hl != null && last.close > hl && last.close > (selloff?.trough || last.close);
  const rsiUp = seriesImproving(rsiV);
  const macdUp = seriesImproving(hist);
  const emaReclaim = ema20[ema20.length - 1] != null && last.close > (ema20[ema20.length - 1] as number);
  if (recovered && firstHL.found) {
    const recIdx = Math.min(bars.length - 1, (firstHL.index || 0) + 1);
    push("EARLY_RECOVERY", recIdx, ["Price held the higher low and began printing higher closes."]);
    if (rsiUp || macdUp || emaReclaim) {
      push("RECOVERY", Math.min(bars.length - 1, recIdx + 1), ["Recovery evidence includes structure plus momentum and/or EMA reclaim."]);
    }
  }

  const nearRes = resistance != null && last.close < resistance && ((resistance - last.close) / last.close) * 100 <= settings.breakoutProximityPct;
  if (nearRes && recovered) push("RESISTANCE_TEST", bars.length - 1, [`Price is approaching resistance at ${resistance?.toFixed(2)}.`]);

  const closedAbove = resistance != null && last.close > resistance;
  const wickAbove = resistance != null && last.high > resistance && last.close <= resistance;
  const volOk = (lastC?.rvol ?? 0) >= settings.minRelVolume;
  if (wickAbove) push("BREAKOUT", bars.length - 1, ["Intraday trade above resistance without a confirming close."]);
  if (closedAbove) {
    push("BREAKOUT", bars.length - 1, [`Close above resistance ${resistance?.toFixed(2)}.`]);
    if (volOk && lastC && lastC.closeLocation >= 0.58) {
      push("BULLISH_RECOVERY_CONFIRMATION", bars.length - 1, ["Close, volume, and candle quality confirm the recovery/breakout."]);
    }
  }

  if (closedAbove && bars.length >= 2) {
    const prev = bars[bars.length - 2];
    if (prev.close > (resistance || 0) && last.close > (resistance || 0)) {
      push("FOLLOW_THROUGH", bars.length - 1, ["Subsequent candle remained above the breakout zone."]);
    }
    if (prev.close > (resistance || 0) && last.close < (resistance || 0) && lastC && lastC.direction < 0) {
      push("FAILED_BREAKOUT", bars.length - 1, ["Price closed back below the breakout level."]);
    }
  }

  const lastAtr = atrs[atrs.length - 1];
  const lastRange = last.high - last.low;
  if (lastAtr && lastRange > lastAtr * 1.5 && (lastC?.rvol ?? 0) >= settings.rvolHigh && last.direction) {
    push(lastRange > lastAtr * 2 && (lastC?.rvol ?? 0) >= settings.rvolExtreme ? "MAJOR_EXPANSION" : "MOMENTUM_EXPANSION", bars.length - 1, [
      `Range ${ (lastRange / lastAtr).toFixed(2)} × ATR`,
      `RVOL ${lastC?.rvol?.toFixed(2) ?? "n/a"}`,
    ]);
  }

  const pullback = classifyPullback(bars, hl, settings);
  if (pullback !== "None" && recovered) {
    push(pullback === "Trend Breakdown" ? "TREND_BREAKDOWN" : "PULLBACK", bars.length - 1, [`Pullback classified as ${pullback}.`]);
    if (pullback === "Healthy" || pullback === "Normal") push("SUPPORT_TEST", bars.length - 1, ["Price is testing prior support / higher-low area."]);
    if (pullback === "Healthy" && last.close > (hl || 0) && (ema20[ema20.length - 1] == null || last.close > (ema20[ema20.length - 1] as number) * 0.997)) {
      push("PROFIT_TAKING", bars.length - 1, ["Red/off-high action while structure remains intact — profit-taking, not a reversal."]);
    }
  }

  const swingHighs = swingPoints(highs, lows, settings.swingLeft, settings.swingRight)[0]
    .map((v, i) => (v == null ? null : { i, v }))
    .filter((x): x is { i: number; v: number } => !!x);
  if (swingHighs.length >= 2 && swingHighs[swingHighs.length - 1].v > swingHighs[swingHighs.length - 2].v && hl != null) {
    push("HIGHER_HIGH", swingHighs[swingHighs.length - 1].i, [`New swing high ${swingHighs[swingHighs.length - 1].v.toFixed(2)}.`]);
    if (events.some((e) => e.phase === "HIGHER_HIGH") && events.some((e) => e.phase === "FIRST_HIGHER_LOW")) {
      push("CONTINUATION", bars.length - 1, ["HH + HL sequence is intact."]);
    }
  }

  const compression = detectCompression(bars, settings);
  if (compression.state === "VOLATILITY_CONTRACTION" && recovered && !closedAbove) {
    push("CONSOLIDATION", bars.length - 1, ["Range contracted while bullish structure is still intact."]);
  }

  const rank: RecoveryPhase[] = [
    "TREND_BREAKDOWN",
    "FAILED_BREAKOUT",
    "MAJOR_EXPANSION",
    "MOMENTUM_EXPANSION",
    "CONTINUATION",
    "HIGHER_HIGH",
    "FOLLOW_THROUGH",
    "BULLISH_RECOVERY_CONFIRMATION",
    "BREAKOUT",
    "PROFIT_TAKING",
    "PULLBACK",
    "SUPPORT_TEST",
    "RESISTANCE_TEST",
    "RECOVERY",
    "EARLY_RECOVERY",
    "FIRST_HIGHER_LOW",
    "STABILIZATION",
    "SELLING_EXHAUSTION",
    "CONSOLIDATION",
    "LARGE_SELLOFF",
    "INSUFFICIENT_DATA",
  ];
  let current: RecoveryPhase = "INSUFFICIENT_DATA";
  if (!bars.length) current = "INSUFFICIENT_DATA";
  else {
    for (const phase of rank) {
      if (events.some((e) => e.phase === phase)) {
        current = phase;
        break;
      }
    }
    if (current === "INSUFFICIENT_DATA" && selloff) current = "LARGE_SELLOFF";
  }

  const battle = detectVolumeBattle(bars, resistance ?? hl ?? selloff?.trough ?? null, settings);
  const primarySupport = hl ?? selloff?.trough ?? null;
  const secondarySupport = ema20[ema20.length - 1] ?? null;

  return { events, current, selloff, exhaustion, stabilization, firstHL, battle, pullback, primarySupport, secondarySupport };
}
