import { atr, ema, macd, rsi, swingPoints } from "@/src/engines/indicators";
import type { OHLCVBar } from "@/src/types/domain";
import type {
  BreakoutSettings,
  CandleKind,
  CompressionState,
  DemandClass,
  DemandScoreWeights,
  SellingPressureState,
  StructureShift,
  SupportReaction,
  VolumeState,
} from "@/lib/breakoutPotential";

export type CandleMetrics = {
  index: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  body: number;
  bodyPercent: number;
  upperWick: number;
  lowerWick: number;
  range: number;
  bodyToRange: number;
  closeLocation: number;
  direction: -1 | 0 | 1;
  kind: CandleKind;
  rvol: number | null;
  moveAtr: number | null;
};

function barDate(bar: OHLCVBar) {
  return bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
}

export function classifyCandle(bar: OHLCVBar, avgRange?: number | null, avgVol?: number | null, atrVal?: number | null): Omit<CandleMetrics, "index"> {
  const range = Math.max(bar.high - bar.low, 0);
  const body = Math.abs(bar.close - bar.open);
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const bodyToRange = range > 0 ? body / range : 0;
  const closeLocation = range > 0 ? (bar.close - bar.low) / range : 0.5;
  const direction: -1 | 0 | 1 = bar.close > bar.open ? 1 : bar.close < bar.open ? -1 : 0;
  const bodyPercent = bar.open ? body / Math.abs(bar.open) : 0;
  const large = (avgRange && range >= avgRange * 1.25) || bodyPercent >= 0.018;
  let kind: CandleKind = "INDECISION";
  if (bodyToRange < 0.22) kind = "INDECISION";
  else if (direction < 0) {
    kind = bodyToRange >= 0.68 && large ? "STRONG_SELLING" : bodyToRange >= 0.42 ? "MODERATE_SELLING" : "WEAK_SELLING";
  } else if (direction > 0) {
    kind = bodyToRange >= 0.68 && large ? "STRONG_BUYING" : bodyToRange >= 0.42 ? "MODERATE_BUYING" : "WEAK_BUYING";
  }
  const rvol = avgVol && avgVol > 0 && bar.volume > 0 ? bar.volume / avgVol : bar.volume > 0 && avgVol ? bar.volume / avgVol : null;
  const moveAtr = atrVal && atrVal > 0 ? Math.abs(bar.close - bar.open) / atrVal : null;
  return {
    time: barDate(bar).toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    body,
    bodyPercent,
    upperWick,
    lowerWick,
    range,
    bodyToRange,
    closeLocation,
    direction,
    kind,
    rvol,
    moveAtr,
  };
}

export function measureCandles(bars: OHLCVBar[], settings: BreakoutSettings): CandleMetrics[] {
  if (!bars.length) return [];
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const atrs = atr(highs, lows, closes, settings.atrPeriod);
  return bars.map((bar, i) => {
    const volWindow = bars.slice(Math.max(0, i - settings.volumeSma), i).filter((b) => b.volume > 0);
    const avgVol = volWindow.length >= 5 ? volWindow.reduce((s, b) => s + b.volume, 0) / volWindow.length : null;
    const rangeWindow = bars.slice(Math.max(0, i - 20), i);
    const avgRange = rangeWindow.length ? rangeWindow.reduce((s, b) => s + (b.high - b.low), 0) / rangeWindow.length : null;
    return { index: i, ...classifyCandle(bar, avgRange, avgVol, atrs[i]) };
  });
}

export function consecutiveDirection(candles: CandleMetrics[], dir: -1 | 1) {
  let n = 0;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].direction !== dir) break;
    n += 1;
  }
  return n;
}

export function countDirection(candles: CandleMetrics[], dir: -1 | 1) {
  return candles.filter((c) => c.direction === dir).length;
}

export function analyzeSellingPressure(candles: CandleMetrics[], lookback = 12): {
  state: SellingPressureState;
  redCandleCount: number;
  greenCandleCount: number;
  consecutiveRedCandles: number;
  consecutiveGreenCandles: number;
  downDays5: number;
  downDays10: number;
  downDays20: number;
  averageDownMove: number | null;
  averageUpMove: number | null;
  reasons: string[];
} {
  if (candles.length < 6) {
    return {
      state: "UNAVAILABLE",
      redCandleCount: 0,
      greenCandleCount: 0,
      consecutiveRedCandles: 0,
      consecutiveGreenCandles: 0,
      downDays5: 0,
      downDays10: 0,
      downDays20: 0,
      averageDownMove: null,
      averageUpMove: null,
      reasons: ["Not enough candles to measure selling pressure."],
    };
  }
  const window = candles.slice(-lookback);
  const reds = window.filter((c) => c.direction < 0);
  const greens = window.filter((c) => c.direction > 0);
  const consecutiveRedCandles = consecutiveDirection(candles, -1);
  const consecutiveGreenCandles = consecutiveDirection(candles, 1);
  const downDays5 = candles.slice(-5).filter((c) => c.direction < 0).length;
  const downDays10 = candles.slice(-10).filter((c) => c.direction < 0).length;
  const downDays20 = candles.slice(-20).filter((c) => c.direction < 0).length;
  const averageDownMove = reds.length ? reds.reduce((s, c) => s + c.bodyPercent, 0) / reds.length : null;
  const averageUpMove = greens.length ? greens.reduce((s, c) => s + c.bodyPercent, 0) / greens.length : null;
  const firstHalf = reds.slice(0, Math.max(1, Math.floor(reds.length / 2)));
  const secondHalf = reds.slice(Math.floor(reds.length / 2));
  const firstBody = firstHalf.length ? firstHalf.reduce((s, c) => s + c.body, 0) / firstHalf.length : 0;
  const secondBody = secondHalf.length ? secondHalf.reduce((s, c) => s + c.body, 0) / secondHalf.length : 0;
  const firstVol = firstHalf.filter((c) => c.volume > 0);
  const secondVol = secondHalf.filter((c) => c.volume > 0);
  const firstAvgVol = firstVol.length ? firstVol.reduce((s, c) => s + c.volume, 0) / firstVol.length : 0;
  const secondAvgVol = secondVol.length ? secondVol.reduce((s, c) => s + c.volume, 0) / secondVol.length : 0;
  const lastThree = reds.slice(-3);
  const earlyThree = reds.slice(0, 3);
  const lastAvg = lastThree.length ? lastThree.reduce((s, c) => s + c.body, 0) / lastThree.length : 0;
  const earlyAvg = earlyThree.length ? earlyThree.reduce((s, c) => s + c.body, 0) / earlyThree.length : 0;
  const reasons: string[] = [];
  let state: SellingPressureState = "STABLE";
  const closeDrop = window[0] && window[window.length - 1] ? (window[0].close - window[window.length - 1].close) / window[0].close : 0;
  const lateDrop = window.length >= 4
    ? (window[window.length - 4].close - window[window.length - 1].close) / Math.max(window[window.length - 4].close, 0.01)
    : 0;
  const earlyDrop = window.length >= 4
    ? (window[0].close - window[3].close) / Math.max(window[0].close, 0.01)
    : 0;
  if ((reds.length >= 5 && lastAvg > earlyAvg * 1.12 && secondAvgVol >= firstAvgVol * 0.95) || (reds.length >= 5 && lateDrop > earlyDrop * 1.35 && closeDrop > 0.08)) {
    state = "INCREASING";
    reasons.push("Recent down candles are larger and selling volume is not contracting.");
  } else if (reds.length >= 4 && secondBody < firstBody * 0.78 && (secondAvgVol < firstAvgVol * 0.9 || lastAvg < earlyAvg * 0.85)) {
    state = "WEAKENING";
    reasons.push("Downside candle bodies and/or selling volume are shrinking after a decline.");
  } else if (reds.length >= 5 && greens.length <= 2 && consecutiveRedCandles >= 4) {
    state = "STABLE";
    reasons.push("Selling remains present without a clear contraction or acceleration.");
  }
  if (consecutiveRedCandles === 0 && greens.length >= 2 && state === "WEAKENING") {
    state = "EXHAUSTED";
    reasons.push("The red streak has ended after shrinking downside range.");
  }
  if (!reasons.length) reasons.push("Selling pressure is mixed or not clearly directional.");
  return {
    state,
    redCandleCount: reds.length,
    greenCandleCount: greens.length,
    consecutiveRedCandles,
    consecutiveGreenCandles,
    downDays5,
    downDays10,
    downDays20,
    averageDownMove,
    averageUpMove,
    reasons,
  };
}

export function detectCompression(bars: OHLCVBar[], settings: BreakoutSettings): { state: CompressionState; atrPct: number | null; rangeShrink: number | null } {
  if (bars.length < 20) return { state: "NORMAL", atrPct: null, rangeShrink: null };
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const atrs = atr(highs, lows, closes, settings.atrPeriod);
  const lastAtr = atrs[atrs.length - 1];
  const older = atrs[atrs.length - 12];
  const price = closes[closes.length - 1];
  const atrPct = lastAtr != null && price ? (lastAtr / price) * 100 : null;
  const recent = bars.slice(-6).map((b) => b.high - b.low);
  const prior = bars.slice(-18, -6).map((b) => b.high - b.low);
  const recentAvg = recent.reduce((s, n) => s + n, 0) / recent.length;
  const priorAvg = prior.reduce((s, n) => s + n, 0) / prior.length;
  const rangeShrink = priorAvg > 0 ? recentAvg / priorAvg : null;
  const expandingNow = lastAtr != null && older != null && lastAtr > older * 1.15;
  if (rangeShrink != null && rangeShrink < 0.62 && expandingNow) return { state: "COMPRESSION_TO_EXPANSION", atrPct, rangeShrink };
  if (rangeShrink != null && rangeShrink < 0.7) return { state: "VOLATILITY_CONTRACTION", atrPct, rangeShrink };
  if (expandingNow) return { state: "VOLATILITY_EXPANSION", atrPct, rangeShrink };
  return { state: "NORMAL", atrPct, rangeShrink };
}

export function detectVolumeState(candles: CandleMetrics[], settings: BreakoutSettings): VolumeState {
  const window = candles.slice(-12);
  const usable = window.filter((c) => c.volume > 0 && c.rvol != null);
  if (usable.length < 5) return "INSUFFICIENT_DATA";
  const sell = usable.filter((c) => c.direction < 0);
  const buy = usable.filter((c) => c.direction > 0);
  const sellFirst = sell.slice(0, Math.max(1, Math.floor(sell.length / 2)));
  const sellLast = sell.slice(Math.floor(sell.length / 2));
  const buyVol = buy.reduce((s, c) => s + c.volume, 0);
  const sellVol = sell.reduce((s, c) => s + c.volume, 0);
  const last = usable[usable.length - 1];
  const sellDeclining =
    sellFirst.length &&
    sellLast.length &&
    sellLast.reduce((s, c) => s + c.volume, 0) / sellLast.length < (sellFirst.reduce((s, c) => s + c.volume, 0) / sellFirst.length) * 0.85;
  if (last.direction > 0 && (last.rvol ?? 0) >= settings.rvolHigh) return "VOLUME_CONFIRMATION";
  if (last.direction > 0 && (last.rvol ?? 0) >= settings.rvolElevated && buyVol > sellVol) return "VOLUME_EXPANSION";
  if (sellDeclining && buy.length >= 1) return "SELLING_VOLUME_DECLINING";
  if (buyVol > sellVol * 1.15) return "BUYING_VOLUME_INCREASING";
  if (last.direction > 0 && (last.rvol ?? 1) < settings.rvolLow) return "VOLUME_DIVERGENCE";
  return "VOLUME_NEUTRAL";
}

export function detectStructureShift(bars: OHLCVBar[], settings: BreakoutSettings): {
  shift: StructureShift;
  hh: boolean;
  hl: boolean;
  lh: boolean;
  ll: boolean;
  firstHigherLow: { price: number; time: string; index: number } | null;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
} {
  if (bars.length < 16) {
    return { shift: "INSUFFICIENT_DATA", hh: false, hl: false, lh: false, ll: false, firstHigherLow: null, lastSwingHigh: null, lastSwingLow: null };
  }
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const [sh, sl] = swingPoints(highs, lows, settings.swingLeft, settings.swingRight);
  const swingHighs = sh.map((v, i) => (v == null ? null : { i, price: v, time: barDate(bars[i]).toISOString() })).filter((x): x is { i: number; price: number; time: string } => !!x);
  const swingLows = sl.map((v, i) => (v == null ? null : { i, price: v, time: barDate(bars[i]).toISOString() })).filter((x): x is { i: number; price: number; time: string } => !!x);
  const lastH = swingHighs.slice(-3);
  const lastL = swingLows.slice(-3);
  const hh = lastH.length >= 2 && lastH[lastH.length - 1].price > lastH[lastH.length - 2].price;
  const lh = lastH.length >= 2 && lastH[lastH.length - 1].price < lastH[lastH.length - 2].price;
  const hl = lastL.length >= 2 && lastL[lastL.length - 1].price > lastL[lastL.length - 2].price;
  const ll = lastL.length >= 2 && lastL[lastL.length - 1].price < lastL[lastL.length - 2].price;
  let firstHigherLow: { price: number; time: string; index: number } | null = null;
  for (let i = 1; i < swingLows.length; i++) {
    if (swingLows[i].price > swingLows[i - 1].price * 1.001) {
      firstHigherLow = { price: swingLows[i].price, time: swingLows[i].time, index: swingLows[i].i };
      break;
    }
  }
  const recentHL = lastL.length >= 2 && lastL[lastL.length - 1].price > lastL[lastL.length - 2].price
    ? { price: lastL[lastL.length - 1].price, time: lastL[lastL.length - 1].time, index: lastL[lastL.length - 1].i }
    : null;
  let shift: StructureShift = "TRANSITIONING_STRUCTURE";
  if (hh && hl) shift = "BULLISH_STRUCTURE";
  else if (lh && ll) shift = "BEARISH_STRUCTURE";
  return {
    shift,
    hh,
    hl,
    lh,
    ll,
    firstHigherLow: recentHL || firstHigherLow,
    lastSwingHigh: lastH.length ? lastH[lastH.length - 1].price : null,
    lastSwingLow: lastL.length ? lastL[lastL.length - 1].price : null,
  };
}

export function detectSupportReaction(bars: OHLCVBar[], support: number | null, candles: CandleMetrics[]): SupportReaction {
  if (support == null || !bars.length) return "NONE";
  const last = bars[bars.length - 1];
  const band = support * 0.006;
  const near = last.low <= support + band;
  const held = last.close >= support * 0.997;
  const rejected = near && last.close > support && (candles.at(-1)?.lowerWick || 0) > (candles.at(-1)?.body || 0);
  if (last.close < support * 0.992) return "SUPPORT_BREAKDOWN";
  if (rejected) return "SUPPORT_REJECTION";
  if (near && held) return last.low <= support * 1.002 ? "SUPPORT_TEST" : "SUPPORT_HOLD";
  if (held && last.low > support) return "SUPPORT_HOLD";
  return "NONE";
}

export function firstDemandDetector(input: {
  candles: CandleMetrics[];
  selling: ReturnType<typeof analyzeSellingPressure>;
  structure: ReturnType<typeof detectStructureShift>;
  support: SupportReaction;
  resistance: number | null;
  rsiImproving: boolean;
  macdImproving: boolean;
  settings: BreakoutSettings;
}): {
  score: number;
  classification: DemandClass;
  reasons: string[];
  factors: { name: string; score: number; max: number; note: string }[];
  candle: CandleMetrics | null;
} {
  const { candles, selling, structure, support, resistance, settings } = input;
  const last = candles[candles.length - 1] || null;
  const prior = candles.slice(0, -1);
  const redStreak = consecutiveDirection(prior, -1);
  const weights: DemandScoreWeights = settings.demandWeights;
  if (!last || last.direction <= 0 || redStreak < settings.minRedStreak) {
    return { score: 0, classification: "NONE", reasons: ["No first-demand candidate after a sustained selling streak."], factors: [], candle: null };
  }
  const exhaustionPts = selling.state === "EXHAUSTED" ? weights.exhaustion : selling.state === "WEAKENING" ? Math.round(weights.exhaustion * 0.7) : selling.state === "INCREASING" ? 2 : 6;
  const candlePts = last.kind === "STRONG_BUYING" ? weights.candleStrength : last.kind === "MODERATE_BUYING" ? Math.round(weights.candleStrength * 0.7) : Math.round(weights.candleStrength * 0.3);
  const volPts = last.rvol == null ? Math.round(weights.volume * 0.3) : last.rvol >= settings.rvolHigh ? weights.volume : last.rvol >= settings.rvolElevated ? Math.round(weights.volume * 0.7) : last.rvol < settings.rvolLow ? 2 : Math.round(weights.volume * 0.4);
  const structPts = structure.hl ? weights.structure : structure.shift === "TRANSITIONING_STRUCTURE" ? Math.round(weights.structure * 0.45) : 2;
  const supportPts = support === "SUPPORT_REJECTION" || support === "SUPPORT_HOLD" ? weights.support : support === "SUPPORT_TEST" ? Math.round(weights.support * 0.6) : 2;
  const momPts = input.rsiImproving && input.macdImproving ? weights.momentum : input.rsiImproving || input.macdImproving ? Math.round(weights.momentum * 0.55) : 2;
  const broke = resistance != null && last.close > resistance;
  const resPts = broke && (last.rvol ?? 0) >= settings.minRelVolume ? weights.resistanceBreak : broke ? Math.round(weights.resistanceBreak * 0.4) : last.high > (resistance || Infinity) ? 2 : 1;
  const score = Math.max(0, Math.min(100, exhaustionPts + candlePts + volPts + structPts + supportPts + momPts + resPts));
  const factors = [
    { name: "Selling-pressure exhaustion", score: exhaustionPts, max: weights.exhaustion, note: selling.state },
    { name: "Candle strength", score: candlePts, max: weights.candleStrength, note: last.kind },
    { name: "Volume confirmation", score: volPts, max: weights.volume, note: last.rvol != null ? `${last.rvol.toFixed(2)}x` : "unavailable" },
    { name: "Structure improvement", score: structPts, max: weights.structure, note: structure.shift },
    { name: "Support reaction", score: supportPts, max: weights.support, note: support },
    { name: "Momentum improvement", score: momPts, max: weights.momentum, note: input.rsiImproving || input.macdImproving ? "improving" : "not confirmed" },
    { name: "Resistance breakout", score: resPts, max: weights.resistanceBreak, note: broke ? "close above" : "still below" },
  ];
  let classification: DemandClass = "NOISE";
  if (broke && last.kind === "STRONG_BUYING" && (last.rvol ?? 0) >= settings.minRelVolume) classification = "BREAKOUT_CONFIRMED";
  else if (score >= 58 && last.kind !== "WEAK_BUYING" && selling.state !== "INCREASING") classification = "EARLY_DEMAND_RETURN";
  else if (last.kind === "WEAK_BUYING" || (last.rvol ?? 1) < settings.rvolLow || selling.state === "INCREASING") classification = "WEAK_BOUNCE";
  else classification = score >= 40 ? "EARLY_DEMAND_RETURN" : "WEAK_BOUNCE";
  const reasons = [
    `${redStreak} down candles preceded this bar.`,
    `Candle is ${last.kind.toLowerCase().replaceAll("_", " ")} with close location ${(last.closeLocation * 100).toFixed(0)}%.`,
    last.rvol != null ? `Relative volume ${last.rvol.toFixed(2)}x.` : "Volume confirmation is unavailable.",
    selling.reasons[0],
  ];
  return { score, classification, reasons, factors, candle: last };
}

export function priceVolumePressure(candles: CandleMetrics[]) {
  const window = candles.slice(-20).filter((c) => c.volume > 0);
  if (window.length < 6) return { upVolumeRatio: null as number | null, downVolumeRatio: null as number | null, label: "INSUFFICIENT_DATA" };
  const up = window.filter((c) => c.direction > 0).reduce((s, c) => s + c.volume, 0);
  const down = window.filter((c) => c.direction < 0).reduce((s, c) => s + c.volume, 0);
  const tot = up + down;
  return {
    upVolumeRatio: tot ? up / tot : null,
    downVolumeRatio: tot ? down / tot : null,
    label: "Price/Volume Pressure",
  };
}

export function seriesImproving(values: Array<number | null>, lookback = 4) {
  const nums = values.filter((v): v is number => v != null).slice(-lookback);
  if (nums.length < 3) return false;
  return nums[nums.length - 1] > nums[0] && nums[nums.length - 1] >= nums[nums.length - 2];
}

export function bullishDivergence(priceLows: number[], indicatorLows: number[]) {
  if (priceLows.length < 2 || indicatorLows.length < 2) return false;
  const p1 = priceLows[priceLows.length - 2];
  const p2 = priceLows[priceLows.length - 1];
  const i1 = indicatorLows[indicatorLows.length - 2];
  const i2 = indicatorLows[indicatorLows.length - 1];
  return p2 < p1 && i2 > i1;
}

export function lastSwingLows(bars: OHLCVBar[], settings: BreakoutSettings, n = 3) {
  const [ , sl] = swingPoints(bars.map((b) => b.high), bars.map((b) => b.low), settings.swingLeft, settings.swingRight);
  return sl.map((v, i) => (v == null ? null : v)).filter((v): v is number => v != null).slice(-n);
}

export { ema, rsi, macd };
