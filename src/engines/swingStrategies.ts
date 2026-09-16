import { getSettings } from "@/src/config/env";
import { swingHigherTimeframe, type SwingTimeframe } from "@/src/config/timeframes";
import { swingPoints, volumeProfileNodes } from "@/src/engines/indicators";
import type { Frame } from "@/src/lib/series";
import type { Indicators, OHLCVBar, Quote, SRLevels } from "@/src/types/domain";

export type SwingSignal = "BULLISH" | "BEARISH" | "NEUTRAL" | "NO_TRADE";

export type SwingStrategyId =
  | "ellipse"
  | "swing-sr"
  | "fibonacci"
  | "liquidity-sweep"
  | "liquidity-analysis"
  | "swing-algo"
  | "big-trend"
  | "mtf-swing"
  | "weighted"
  | "target-isolator";

export type SwingOverlayLine = { price: number; color: string; title: string; style?: "solid" | "dashed" };
export type SwingMarker = { time: number; price: number; kind: "high" | "low" | "sweep" | "signal" };

export type SwingOverlays = {
  emas: boolean;
  fibonacci: boolean;
  supportResistance: boolean;
  liquidity: boolean;
  entryExit: boolean;
  targets: boolean;
  historical: boolean;
  lines: SwingOverlayLine[];
  markers: SwingMarker[];
};

export type SwingPlan = {
  allowed: boolean;
  entry: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  riskReward: number | null;
  invalidation: number | null;
};

export type SwingStrategyResult = {
  id: SwingStrategyId;
  name: string;
  score: number;
  signal: SwingSignal;
  plan: SwingPlan;
  overlays: SwingOverlays;
  why: string;
  whenEnter: string;
  whenExit: string;
  risks: string;
  scoreWhy: string;
  noTradeReason: string | null;
};

export type SwingContext = {
  symbol: string;
  timeframe: SwingTimeframe;
  timeframeLabel: string;
  price: number;
  quote: Quote;
  bars: OHLCVBar[];
  frame: Frame;
  indicators: Indicators;
  levels: SRLevels;
  higherTrend: "BULLISH" | "BEARISH" | "NEUTRAL";
  higherLabel: string;
};

export const SWING_STRATEGY_DEFS: { id: SwingStrategyId; name: string }[] = [
  { id: "ellipse", name: "ELLIPSE / Bidirectional Swing Trading" },
  { id: "swing-sr", name: "Swing High/Low Support & Resistance" },
  { id: "fibonacci", name: "Fibonacci Clusters" },
  { id: "liquidity-sweep", name: "Liquidity Sweep Confirmation" },
  { id: "liquidity-analysis", name: "AetherEdge-Style Liquidity Analysis" },
  { id: "swing-algo", name: "Swing Trader Algo" },
  { id: "big-trend", name: "Big Trend Catcher" },
  { id: "mtf-swing", name: "Multi-Timeframe Swing Analysis" },
  { id: "weighted", name: "Multi-Indicator Weighted Swing Strategy" },
  { id: "target-isolator", name: "Target Isolator / Swing Setup Scoring" },
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number | null) => (n == null ? "—" : `$${r2(n).toFixed(2)}`);

export function fibonacciRetracements(high: number, low: number) {
  const range = high - low;
  const fromHigh = (ratio: number) => r2(high - range * ratio);
  return {
    high: r2(high),
    low: r2(low),
    range: r2(range),
    r236: fromHigh(0.236),
    r382: fromHigh(0.382),
    r500: fromHigh(0.5),
    r618: fromHigh(0.618),
    r786: fromHigh(0.786),
  };
}

export function recentSwingExtremes(frame: Frame, left = 3, right = 3) {
  const look = Math.min(frame.rows.length, 120);
  const recent = frame.tail(look);
  const [sh, sl] = swingPoints(recent.get("high"), recent.get("low"), left, right);
  const highs: { index: number; price: number; time: Date }[] = [];
  const lows: { index: number; price: number; time: Date }[] = [];
  recent.rows.forEach((row, i) => {
    if (sh[i] != null) highs.push({ index: i, price: sh[i] as number, time: row.timestamp });
    if (sl[i] != null) lows.push({ index: i, price: sl[i] as number, time: row.timestamp });
  });
  const lastHigh = highs.length ? highs[highs.length - 1] : null;
  const lastLow = lows.length ? lows[lows.length - 1] : null;
  const swingHigh = lastHigh?.price ?? Math.max(...recent.get("high").filter((x): x is number => x != null));
  const swingLow = lastLow?.price ?? Math.min(...recent.get("low").filter((x): x is number => x != null));
  return { highs, lows, lastHigh, lastLow, swingHigh, swingLow };
}

function emptyOverlays(partial: Partial<SwingOverlays> = {}): SwingOverlays {
  return {
    emas: false,
    fibonacci: false,
    supportResistance: false,
    liquidity: false,
    entryExit: true,
    targets: true,
    historical: false,
    lines: [],
    markers: [],
    ...partial,
  };
}

function emptyPlan(): SwingPlan {
  return {
    allowed: false,
    entry: null,
    entryLow: null,
    entryHigh: null,
    stop: null,
    target1: null,
    target2: null,
    target3: null,
    riskReward: null,
    invalidation: null,
  };
}

export function buildDirectionalPlan(
  bias: "BULLISH" | "BEARISH",
  entry: number,
  stop: number,
  t1: number,
  t2?: number | null,
  t3?: number | null,
  zone = 0.004,
): SwingPlan {
  const minRr = getSettings().minRiskReward;
  const plan = emptyPlan();
  plan.entry = r2(entry);
  plan.entryLow = r2(bias === "BULLISH" ? entry * (1 - zone) : entry);
  plan.entryHigh = r2(bias === "BULLISH" ? entry : entry * (1 + zone));
  if (plan.entryLow > plan.entryHigh) [plan.entryLow, plan.entryHigh] = [plan.entryHigh, plan.entryLow];
  plan.stop = r2(stop);
  plan.invalidation = r2(stop);
  plan.target1 = r2(t1);
  plan.target2 = t2 != null ? r2(t2) : null;
  plan.target3 = t3 != null ? r2(t3) : null;
  const risk = bias === "BULLISH" ? plan.entry - plan.stop : plan.stop - plan.entry;
  const reward = bias === "BULLISH" ? plan.target1 - plan.entry : plan.entry - plan.target1;
  if (risk > 0 && reward > 0) {
    plan.riskReward = r2(reward / risk);
    plan.allowed = plan.riskReward >= minRr;
  }
  return plan;
}

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function conservativeNoTrade(tf: SwingTimeframe) {
  return tf === "15m" || tf === "30m";
}

function line(price: number | null | undefined, color: string, title: string, style: "solid" | "dashed" = "dashed"): SwingOverlayLine[] {
  if (price == null || !Number.isFinite(price)) return [];
  return [{ price, color, title, style }];
}

function explain(
  ctx: SwingContext,
  signal: SwingSignal,
  plan: SwingPlan,
  whyCore: string,
): Pick<SwingStrategyResult, "why" | "whenEnter" | "whenExit" | "risks"> {
  const tf = ctx.timeframeLabel.toUpperCase();
  if (signal === "NO_TRADE" || !plan.allowed) {
    const reason = plan.riskReward != null && plan.riskReward < getSettings().minRiskReward
      ? `Risk/reward ${plan.riskReward.toFixed(2)} is below the ${getSettings().minRiskReward.toFixed(1)} minimum.`
      : "Price is between major levels and confirmation is missing.";
    return {
      why: `${whyCore} ${reason}`.trim(),
      whenEnter: `No Trade — wait for a cleaner ${tf} confirmation before committing capital.`,
      whenExit: "There is no active trade to exit.",
      risks: conservativeNoTrade(ctx.timeframe)
        ? "Lower timeframes produce more noise. Do not force a setup."
        : "Forcing a mid-range trade often leads to stops being hit without follow-through.",
    };
  }
  const zone = `${usd(plan.entryLow)}–${usd(plan.entryHigh)}`;
  const dir = signal === "BEARISH" ? "bearish" : "bullish";
  return {
    why: whyCore,
    whenEnter: `${tf} Entry: Consider entering between ${zone} if price confirms and the ${dir} signal remains valid. Preferred entry ${usd(plan.entry)}.`,
    whenExit: `Stop Loss: ${usd(plan.stop)}. Target 1: ${usd(plan.target1)}. Target 2: ${usd(plan.target2)}. Target 3: ${usd(plan.target3)}. Exit or reconsider if price breaks and sustains beyond ${usd(plan.invalidation)} (invalidation). R:R ${plan.riskReward?.toFixed(2) ?? "—"}.`,
    risks: "Targets are structure-based, not guarantees. Size the position from the stop, and skip the trade if the stop is too wide for your risk.",
  };
}

function result(
  def: { id: SwingStrategyId; name: string },
  ctx: SwingContext,
  score: number,
  signal: SwingSignal,
  plan: SwingPlan,
  overlays: SwingOverlays,
  whyCore: string,
  scoreWhy: string,
  noTradeReason: string | null = null,
): SwingStrategyResult {
  const copy = explain(ctx, signal, plan, whyCore);
  return {
    id: def.id,
    name: def.name,
    score: clampScore(score),
    signal,
    plan,
    overlays,
    scoreWhy,
    noTradeReason,
    ...copy,
  };
}

function noTrade(def: { id: SwingStrategyId; name: string }, ctx: SwingContext, score: number, overlays: SwingOverlays, reason: string, scoreWhy: string) {
  return result(def, ctx, score, "NO_TRADE", emptyPlan(), overlays, reason, scoreWhy, reason);
}

export function analyzeEllipse(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[0];
  const { indicators: ind, price, levels } = ctx;
  const upper = ind.bb_upper;
  const lower = ind.bb_lower;
  const mid = ind.bb_mid;
  const atr = ind.atr;
  const overlays = emptyOverlays({
    emas: false,
    lines: [
      ...line(upper, "#c084fc", "BB Upper"),
      ...line(mid, "#a78bfa", "BB Mid"),
      ...line(lower, "#c084fc", "BB Lower"),
    ],
  });
  if (upper == null || lower == null || mid == null || atr == null) {
    return noTrade(def, ctx, 35, overlays, "Bollinger bands are incomplete for this history.", "Score is muted because the volatility envelope is not defined.");
  }
  const width = (upper - lower) / price;
  let score = 45;
  let signal: SwingSignal = "NEUTRAL";
  let plan = emptyPlan();
  if (price <= lower * 1.005 && (ind.rsi || 50) < 40) {
    signal = "BULLISH";
    score = 78 + (width < 0.04 ? 6 : 0);
    plan = buildDirectionalPlan("BULLISH", Math.max(lower, levels.s1 ?? lower), lower - 1.1 * atr, mid, upper, upper + atr);
  } else if (price >= upper * 0.995 && (ind.rsi || 50) > 60) {
    signal = "BEARISH";
    score = 76 + (width < 0.04 ? 6 : 0);
    plan = buildDirectionalPlan("BEARISH", Math.min(upper, levels.r1 ?? upper), upper + 1.1 * atr, mid, lower, lower - atr);
  } else {
    score = 42;
    signal = conservativeNoTrade(ctx.timeframe) ? "NO_TRADE" : "NEUTRAL";
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = `ELLIPSE uses the Bollinger envelope as a bidirectional swing cage. Price is ${usd(price)} vs lower ${usd(lower)} / mid ${usd(mid)} / upper ${usd(upper)}.`;
  return result(def, ctx, score, signal, plan, overlays, why, `Envelope width ${(width * 100).toFixed(1)}% of price. Mean-reversion scores higher at the band edges.`);
}

export function analyzeSwingSr(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[1];
  const swings = recentSwingExtremes(ctx.frame);
  const { price, levels, indicators: ind } = ctx;
  const overlays = emptyOverlays({
    supportResistance: true,
    historical: true,
    lines: [
      ...line(swings.swingHigh, "#f87171", "Swing High"),
      ...line(swings.swingLow, "#4ade80", "Swing Low"),
      ...line(levels.s1, "#4ade80", "S1"),
      ...line(levels.r1, "#f87171", "R1"),
    ],
    markers: [
      ...swings.highs.slice(-6).map((h) => ({ time: Math.floor(h.time.getTime() / 1000), price: h.price, kind: "high" as const })),
      ...swings.lows.slice(-6).map((l) => ({ time: Math.floor(l.time.getTime() / 1000), price: l.price, kind: "low" as const })),
    ].sort((a, b) => a.time - b.time),
  });
  const atr = ind.atr ?? price * 0.015;
  const distLow = Math.abs(price - swings.swingLow) / price;
  const distHigh = Math.abs(price - swings.swingHigh) / price;
  let score = 40;
  let signal: SwingSignal = "NEUTRAL";
  let plan = emptyPlan();
  if (distLow <= 0.012 && price > swings.swingLow) {
    signal = "BULLISH";
    score = 86;
    plan = buildDirectionalPlan("BULLISH", swings.swingLow, swings.swingLow - 0.8 * atr, levels.r1 ?? price + 1.5 * atr, levels.r2 ?? price + 2.5 * atr, swings.swingHigh);
  } else if (distHigh <= 0.012 && price < swings.swingHigh) {
    signal = "BEARISH";
    score = 84;
    plan = buildDirectionalPlan("BEARISH", swings.swingHigh, swings.swingHigh + 0.8 * atr, levels.s1 ?? price - 1.5 * atr, levels.s2 ?? price - 2.5 * atr, swings.swingLow);
  } else {
    score = 38;
    signal = "NO_TRADE";
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = `Last swing high ${usd(swings.swingHigh)}, last swing low ${usd(swings.swingLow)}. Price ${usd(price)} is judged against those pivots, not a moving average.`;
  return result(def, ctx, score, signal, plan, overlays, why, "Score rises when price is testing a mapped swing pivot rather than mid-range.");
}

export function analyzeFibonacci(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[2];
  const swings = recentSwingExtremes(ctx.frame);
  const fib = fibonacciRetracements(swings.swingHigh, swings.swingLow);
  const { price, indicators: ind } = ctx;
  const overlays = emptyOverlays({
    fibonacci: true,
    lines: [
      ...line(fib.high, "#94a3b8", "Fib 0%"),
      ...line(fib.r382, "#38bdf8", "Fib 38.2%"),
      ...line(fib.r500, "#22d3ee", "Fib 50%"),
      ...line(fib.r618, "#818cf8", "Fib 61.8%"),
      ...line(fib.r786, "#a78bfa", "Fib 78.6%"),
      ...line(fib.low, "#94a3b8", "Fib 100%"),
    ],
  });
  const cluster = [fib.r500, fib.r618];
  const near = cluster.find((lvl) => Math.abs(price - lvl) / price <= 0.01);
  const atr = ind.atr ?? price * 0.015;
  let score = 44;
  let signal: SwingSignal = "NEUTRAL";
  let plan = emptyPlan();
  if (near && price >= fib.r618) {
    signal = "BULLISH";
    score = 82;
    plan = buildDirectionalPlan("BULLISH", near, fib.r786 - 0.3 * atr, fib.r382, fib.r236, fib.high);
  } else if (near && price <= fib.r500) {
    signal = "BEARISH";
    score = 80;
    plan = buildDirectionalPlan("BEARISH", near, fib.r382 + 0.3 * atr, fib.r618, fib.r786, fib.low);
  } else {
    signal = "NO_TRADE";
    score = 36;
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = `Fibonacci is measured from swing high ${usd(fib.high)} to swing low ${usd(fib.low)}. 50% is ${usd(fib.r500)} and 61.8% is ${usd(fib.r618)}.`;
  return result(def, ctx, score, signal, plan, overlays, why, "Cluster scores increase when price sits on 50–61.8% and structure agrees.");
}

export function analyzeLiquiditySweep(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[3];
  const rows = ctx.frame.rows;
  const lastBar = rows[rows.length - 1];
  const swings = recentSwingExtremes(ctx.frame);
  const liqLow = swings.lastLow?.price ?? swings.swingLow;
  const liqHigh = swings.lastHigh?.price ?? swings.swingHigh;
  const lastIsNewLowPivot = Boolean(swings.lastLow && swings.lastLow.time.getTime() === lastBar.timestamp.getTime());
  const lastIsNewHighPivot = Boolean(swings.lastHigh && swings.lastHigh.time.getTime() === lastBar.timestamp.getTime());
  const sweptLow = !lastIsNewLowPivot && lastBar.low < liqLow && lastBar.close > liqLow;
  const sweptHigh = !lastIsNewHighPivot && lastBar.high > liqHigh && lastBar.close < liqHigh;
  const atr = ctx.indicators.atr ?? ctx.price * 0.015;
  const overlays = emptyOverlays({
    liquidity: true,
    historical: true,
    lines: [...line(liqLow, "#facc15", "Buy-side liquidity"), ...line(liqHigh, "#fb7185", "Sell-side liquidity")],
    markers: [
      {
        time: Math.floor(lastBar.timestamp.getTime() / 1000),
        price: sweptLow ? lastBar.low : lastBar.high,
        kind: "sweep",
      },
    ],
  });
  let score = 40;
  let signal: SwingSignal = "NO_TRADE";
  let plan = emptyPlan();
  if (sweptLow) {
    signal = "BULLISH";
    score = 90;
    plan = buildDirectionalPlan("BULLISH", lastBar.close, lastBar.low - 0.25 * atr, ctx.levels.r1 ?? ctx.price + 1.6 * atr, ctx.levels.r2 ?? ctx.price + 2.4 * atr, liqHigh);
  } else if (sweptHigh) {
    signal = "BEARISH";
    score = 88;
    plan = buildDirectionalPlan("BEARISH", lastBar.close, lastBar.high + 0.25 * atr, ctx.levels.s1 ?? ctx.price - 1.6 * atr, ctx.levels.s2 ?? ctx.price - 2.4 * atr, liqLow);
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = sweptLow
    ? `Price wicked below swing liquidity at ${usd(liqLow)} then closed back above it — a liquidity sweep and reclaim.`
    : sweptHigh
      ? `Price wicked above swing liquidity at ${usd(liqHigh)} then closed back below it — a liquidity sweep and reject.`
      : `No sweep of swing liquidity at ${usd(liqLow)} / ${usd(liqHigh)} on the latest candle.`;
  return result(def, ctx, score, signal, plan, overlays, why, "A confirmed sweep+reclaim of a mapped swing high/low scores near the top of this model; a trend candle that simply makes a new high is not a sweep.");
}

export function analyzeLiquidityPools(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[4];
  const nodes = volumeProfileNodes(ctx.frame.get("close"), ctx.frame.get("volume"), 18).slice(0, 5);
  const atr = ctx.indicators.atr ?? ctx.price * 0.015;
  const overlays = emptyOverlays({
    liquidity: true,
    lines: nodes.map(([px], i) => ({ price: r2(px), color: "#fbbf24", title: `HVN ${i + 1}`, style: "dashed" as const })),
  });
  if (!nodes.length) {
    return noTrade(def, ctx, 30, overlays, "Volume profile nodes could not be formed.", "No high-volume nodes, so liquidity analysis is incomplete.");
  }
  const nearest = nodes.reduce((best, n) => (Math.abs(n[0] - ctx.price) < Math.abs(best[0] - ctx.price) ? n : best));
  const dist = Math.abs(nearest[0] - ctx.price) / ctx.price;
  let score = 50;
  let signal: SwingSignal = "NEUTRAL";
  let plan = emptyPlan();
  if (dist <= 0.008 && ctx.price >= nearest[0]) {
    signal = "BULLISH";
    score = 81;
    plan = buildDirectionalPlan("BULLISH", nearest[0], nearest[0] - atr, ctx.levels.r1 ?? ctx.price + 1.8 * atr, ctx.levels.r2, ctx.levels.r3);
  } else if (dist <= 0.008 && ctx.price < nearest[0]) {
    signal = "BEARISH";
    score = 79;
    plan = buildDirectionalPlan("BEARISH", nearest[0], nearest[0] + atr, ctx.levels.s1 ?? ctx.price - 1.8 * atr, ctx.levels.s2, ctx.levels.s3);
  } else {
    signal = "NO_TRADE";
    score = 41;
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = `AetherEdge-style map treats high-volume nodes as liquidity. Nearest pool is ${usd(nearest[0])} (${(dist * 100).toFixed(2)}% from price).`;
  return result(def, ctx, score, signal, plan, overlays, why, "Score is high only when price is interacting with a high-volume node.");
}

export function analyzeSwingAlgo(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[5];
  const { indicators: ind, price, levels } = ctx;
  const overlays = emptyOverlays({
    emas: true,
    lines: [...line(ind.ema9, "#38bdf8", "EMA9"), ...line(ind.ema21 ?? ind.ema20, "#818cf8", "EMA21")],
  });
  const emaFast = ind.ema9;
  const emaSlow = ind.ema21 ?? ind.ema20;
  const rsi = ind.rsi;
  const volOk = (ind.volume_ratio || 0) >= 1.0;
  const atr = ind.atr ?? price * 0.015;
  if (emaFast == null || emaSlow == null || rsi == null) {
    return noTrade(def, ctx, 32, overlays, "EMA/RSI inputs are incomplete.", "Algo score requires EMA9, EMA21, and RSI.");
  }
  let score = 40;
  let signal: SwingSignal = "NO_TRADE";
  let plan = emptyPlan();
  const bull = emaFast > emaSlow && rsi >= 42 && rsi <= 62 && price >= (ind.vwap ?? price);
  const bear = emaFast < emaSlow && rsi <= 58 && rsi >= 38 && price <= (ind.vwap ?? price);
  if (bull) {
    signal = "BULLISH";
    score = 70 + (volOk ? 12 : 0) + (ind.macd != null && ind.macd_signal != null && ind.macd > ind.macd_signal ? 8 : 0);
    plan = buildDirectionalPlan("BULLISH", emaSlow, emaSlow - 1.15 * atr, levels.r1 ?? price + 1.7 * atr, levels.r2, levels.r3);
  } else if (bear) {
    signal = "BEARISH";
    score = 68 + (volOk ? 12 : 0);
    plan = buildDirectionalPlan("BEARISH", emaSlow, emaSlow + 1.15 * atr, levels.s1 ?? price - 1.7 * atr, levels.s2, levels.s3);
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = `Swing Trader Algo wants EMA9 ${usd(emaFast)} vs EMA21 ${usd(emaSlow)}, RSI ${rsi.toFixed(1)}, volume ratio ${(ind.volume_ratio ?? 0).toFixed(2)}.`;
  return result(def, ctx, score, signal, plan, overlays, why, "Points come from EMA alignment, RSI mid-zone pullback, and participation.");
}

export function analyzeBigTrend(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[6];
  const { indicators: ind, price } = ctx;
  const overlays = emptyOverlays({
    emas: true,
    lines: [
      ...line(ind.ema20, "#60a5fa", "EMA20"),
      ...line(ind.ema50, "#fbbf24", "EMA50"),
      ...line(ind.ema200, "#c084fc", "EMA200"),
    ],
  });
  const a20 = ind.ema20;
  const a50 = ind.ema50;
  const a200 = ind.ema200;
  const atr = ind.atr;
  if (a20 == null || a50 == null || atr == null) {
    return noTrade(def, ctx, 34, overlays, "EMA/ATR stack is incomplete.", "Trend catcher needs EMA20, EMA50, and ATR.");
  }
  const stackedUp = a20 > a50 && (a200 == null || a50 > a200) && price > a20;
  const stackedDown = a20 < a50 && (a200 == null || a50 < a200) && price < a20;
  let score = 40;
  let signal: SwingSignal = "NO_TRADE";
  let plan = emptyPlan();
  if (stackedUp) {
    signal = "BULLISH";
    score = 92;
    const trail = price - 2 * atr;
    plan = buildDirectionalPlan("BULLISH", a20, Math.min(trail, a50 - 0.2 * atr), price + 1.5 * atr, price + 2.5 * atr, price + 4 * atr);
  } else if (stackedDown) {
    signal = "BEARISH";
    score = 90;
    const trail = price + 2 * atr;
    plan = buildDirectionalPlan("BEARISH", a20, Math.max(trail, a50 + 0.2 * atr), price - 1.5 * atr, price - 2.5 * atr, price - 4 * atr);
  } else {
    score = 37;
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = `Big Trend Catcher requires EMA20/50/200 alignment. EMA20 ${usd(a20)}, EMA50 ${usd(a50)}, EMA200 ${usd(a200 ?? null)}, ATR ${usd(atr)}. Stops trail at 2× ATR.`;
  return result(def, ctx, score, signal, plan, overlays, why, "A full bullish or bearish stack scores in the 90s; mixed EMAs are a no-trade.");
}

export function analyzeMtfSwing(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[7];
  const higherTf = swingHigherTimeframe(ctx.timeframe);
  const overlays = emptyOverlays({
    emas: true,
    lines: [...line(ctx.indicators.ema50, "#fbbf24", `${ctx.timeframeLabel} EMA50`)],
  });
  const localUp = (ctx.indicators.ema20 ?? 0) > (ctx.indicators.ema50 ?? 0);
  const agree = (localUp && ctx.higherTrend === "BULLISH") || (!localUp && ctx.higherTrend === "BEARISH");
  const atr = ctx.indicators.atr ?? ctx.price * 0.015;
  let score = ctx.higherTrend === "NEUTRAL" ? 45 : 55;
  let signal: SwingSignal = "NO_TRADE";
  let plan = emptyPlan();
  if (agree && ctx.higherTrend === "BULLISH") {
    signal = "BULLISH";
    score = 91;
    plan = buildDirectionalPlan("BULLISH", ctx.indicators.ema20 ?? ctx.price, ctx.price - 1.3 * atr, ctx.levels.r1 ?? ctx.price + 1.8 * atr, ctx.levels.r2, ctx.levels.r3);
  } else if (agree && ctx.higherTrend === "BEARISH") {
    signal = "BEARISH";
    score = 89;
    plan = buildDirectionalPlan("BEARISH", ctx.indicators.ema20 ?? ctx.price, ctx.price + 1.3 * atr, ctx.levels.s1 ?? ctx.price - 1.8 * atr, ctx.levels.s2, ctx.levels.s3);
  } else {
    score = 40;
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = `Selected ${ctx.timeframeLabel} is read against the higher ${ctx.higherLabel} trend (${ctx.higherTrend}). Trades are only allowed when both agree.`;
  return result(def, ctx, score, signal, plan, overlays, why, `Alignment with ${higherTf} is the primary score driver.`);
}

export function analyzeWeighted(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[8];
  const ind = ctx.indicators;
  const parts: { name: string; pts: number }[] = [];
  parts.push({ name: "EMA trend", pts: (ind.ema20 ?? 0) > (ind.ema50 ?? 0) ? 22 : 6 });
  parts.push({ name: "RSI", pts: ind.rsi != null && ind.rsi >= 45 && ind.rsi <= 65 ? 18 : ind.rsi != null && ind.rsi < 35 ? 8 : 12 });
  parts.push({ name: "MACD", pts: ind.macd != null && ind.macd_signal != null && ind.macd > ind.macd_signal ? 18 : 7 });
  parts.push({ name: "VWAP", pts: ind.vwap != null && ctx.price >= ind.vwap ? 16 : 6 });
  parts.push({ name: "Volume", pts: (ind.volume_ratio || 0) >= 1.1 ? 16 : 8 });
  const score = parts.reduce((s, p) => s + p.pts, 0);
  const overlays = emptyOverlays({
    emas: true,
    lines: [...line(ind.ema20, "#60a5fa", "EMA20"), ...line(ind.vwap, "#e2e8f0", "VWAP")],
  });
  const atr = ind.atr ?? ctx.price * 0.015;
  let signal: SwingSignal = score >= 70 ? "BULLISH" : score <= 45 ? "BEARISH" : "NO_TRADE";
  let plan = emptyPlan();
  if (signal === "BULLISH") {
    plan = buildDirectionalPlan("BULLISH", ind.vwap ?? ctx.price, ctx.price - 1.2 * atr, ctx.levels.r1 ?? ctx.price + 1.6 * atr, ctx.levels.r2, ctx.levels.r3);
  } else if (signal === "BEARISH") {
    plan = buildDirectionalPlan("BEARISH", ind.vwap ?? ctx.price, ctx.price + 1.2 * atr, ctx.levels.s1 ?? ctx.price - 1.6 * atr, ctx.levels.s2, ctx.levels.s3);
  }
  if (!plan.allowed) signal = "NO_TRADE";
  const why = `Weighted stack: ${parts.map((p) => `${p.name} ${p.pts}`).join(", ")}.`;
  return result(def, ctx, score, signal, plan, overlays, why, parts.map((p) => `${p.name} ${p.pts}/20-ish`).join("; "));
}

export function analyzeTargetIsolator(ctx: SwingContext): SwingStrategyResult {
  const def = SWING_STRATEGY_DEFS[9];
  const atr = ctx.indicators.atr;
  const overlays = emptyOverlays({
    supportResistance: true,
    targets: true,
    lines: [...line(ctx.levels.s1, "#4ade80", "S1"), ...line(ctx.levels.r1, "#f87171", "R1")],
  });
  if (atr == null || ctx.levels.s1 == null || ctx.levels.r1 == null) {
    return noTrade(def, ctx, 33, overlays, "Need ATR plus S1/R1 to isolate a swing target.", "Isolator score is low without a complete structure map.");
  }
  const long = buildDirectionalPlan("BULLISH", ctx.price, ctx.levels.s1 * 0.997, ctx.levels.r1, ctx.levels.r2 ?? ctx.price + 2 * atr, ctx.levels.r3 ?? ctx.price + 3 * atr);
  const short = buildDirectionalPlan("BEARISH", ctx.price, ctx.levels.r1 * 1.003, ctx.levels.s1, ctx.levels.s2 ?? ctx.price - 2 * atr, ctx.levels.s3 ?? ctx.price - 3 * atr);
  const best = (long.riskReward ?? 0) >= (short.riskReward ?? 0) ? { bias: "BULLISH" as const, plan: long } : { bias: "BEARISH" as const, plan: short };
  let signal: SwingSignal = best.plan.allowed ? best.bias : "NO_TRADE";
  const score = best.plan.allowed ? clampScore(70 + (best.plan.riskReward || 0) * 8) : 35;
  const why = `Target Isolator compares the long R:R (${long.riskReward ?? "—"}) against the short R:R (${short.riskReward ?? "—"}) using S/R and ATR multiples.`;
  return result(def, ctx, score, signal, best.plan, overlays, why, "The side with the better structure R:R is isolated; otherwise no trade.");
}

const RUNNERS: Record<SwingStrategyId, (ctx: SwingContext) => SwingStrategyResult> = {
  ellipse: analyzeEllipse,
  "swing-sr": analyzeSwingSr,
  fibonacci: analyzeFibonacci,
  "liquidity-sweep": analyzeLiquiditySweep,
  "liquidity-analysis": analyzeLiquidityPools,
  "swing-algo": analyzeSwingAlgo,
  "big-trend": analyzeBigTrend,
  "mtf-swing": analyzeMtfSwing,
  weighted: analyzeWeighted,
  "target-isolator": analyzeTargetIsolator,
};

export function runAllSwingStrategies(ctx: SwingContext): SwingStrategyResult[] {
  return SWING_STRATEGY_DEFS.map((d) => RUNNERS[d.id](ctx));
}

export function summarizeSwing(strategies: SwingStrategyResult[], ctx: SwingContext) {
  const n = strategies.length || 1;
  const overall = clampScore(strategies.reduce((s, x) => s + x.score, 0) / n);
  const bull = strategies.filter((s) => s.signal === "BULLISH").length;
  const bear = strategies.filter((s) => s.signal === "BEARISH").length;
  const live = strategies.filter((s) => s.plan.allowed);
  let overallSignal: SwingSignal = "NO_TRADE";
  if (bull >= 6) overallSignal = "BULLISH";
  else if (bear >= 6) overallSignal = "BEARISH";
  else if (bull >= 4 && bull > bear) overallSignal = "BULLISH";
  else if (bear >= 4 && bear > bull) overallSignal = "BEARISH";
  else if (overall >= 55 && overall < 70) overallSignal = "NEUTRAL";
  const preferred = live.find((s) => s.signal === overallSignal) || live[0];
  const overallLabel =
    overallSignal === "BULLISH" ? "BUY SETUP" : overallSignal === "BEARISH" ? "SELL SETUP" : overallSignal === "NEUTRAL" ? "WAIT" : "NO TRADE";
  const action =
    overallSignal === "NO_TRADE" || !preferred?.plan.allowed
      ? `Do not enter a ${ctx.timeframeLabel} swing yet. ${bull} strategies are bullish and ${bear} are bearish. Wait until more strategies agree and a stop with at least ${getSettings().minRiskReward.toFixed(1)} R:R is available.`
      : `On the ${ctx.timeframeLabel} chart, wait for the price to enter the ${usd(preferred.plan.entryLow)}–${usd(preferred.plan.entryHigh)} zone. Enter only if the ${overallSignal.toLowerCase()} confirmation holds. Place the stop at ${usd(preferred.plan.stop)}. The first target is ${usd(preferred.plan.target1)}, then ${usd(preferred.plan.target2)} and ${usd(preferred.plan.target3)}. If price closes beyond ${usd(preferred.plan.invalidation)}, the setup is invalid.`;
  return {
    overallScore: overall,
    overallSignal,
    overallLabel,
    agreement: `${bull} bullish / ${bear} bearish / ${strategies.length - bull - bear} no-trade or neutral`,
    preferredEntryLow: preferred?.plan.entryLow ?? null,
    preferredEntryHigh: preferred?.plan.entryHigh ?? null,
    preferredEntry: preferred?.plan.entry ?? null,
    stop: preferred?.plan.stop ?? null,
    target1: preferred?.plan.target1 ?? null,
    target2: preferred?.plan.target2 ?? null,
    target3: preferred?.plan.target3 ?? null,
    riskReward: preferred?.plan.riskReward ?? null,
    summary:
      overallSignal === "NO_TRADE"
        ? `No consensus swing setup on ${ctx.timeframeLabel}. ${bull} strategies are bullish and ${bear} are bearish. Wait for agreement.`
        : `Overall ${overallSignal.toLowerCase()} swing bias on ${ctx.timeframeLabel}. Preferred entry ${usd(preferred?.plan.entryLow ?? null)}–${usd(preferred?.plan.entryHigh ?? null)}, stop ${usd(preferred?.plan.stop ?? null)}, first target ${usd(preferred?.plan.target1 ?? null)}.`,
    action,
  };
}
