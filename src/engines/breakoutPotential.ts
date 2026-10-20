import { detectStructuralLevels, nearestAbove, nearestBelow, sourceLabel } from "@/src/engines/opportunityResistance";
import { assessMarketRegime, sectorForTicker, snapshotTimeframe, type MarketRegime } from "@/src/engines/opportunityEngine";
import { atr, ema, macd, rsi } from "@/src/engines/indicators";
import type { OHLCVBar, Quote } from "@/src/types/domain";
import {
  breakoutScoreBand,
  type BreakoutChartBar,
  type BreakoutLifecycleTimeframe,
  type BreakoutScanTimeframe,
  type BreakoutScoreBand,
  type BreakoutSettings,
  type BreakoutState,
  type ConfidenceLabel,
  type RecoveryPhase,
  type ScoreFactor,
} from "@/lib/breakoutPotential";
import {
  analyzeSellingPressure,
  bullishDivergence,
  detectCompression,
  detectStructureShift,
  detectSupportReaction,
  detectVolumeState,
  firstDemandDetector,
  lastSwingLows,
  measureCandles,
  priceVolumePressure,
  seriesImproving,
} from "@/src/engines/breakoutCandles";
import { walkRecovery, type RecoveryEvent, type SelloffInfo } from "@/src/engines/selloffRecovery";

export type AnalogOutcome = {
  sample: number | "INSUFFICIENT_SAMPLE";
  median1: number | null;
  median3: number | null;
  median5: number | null;
  median10: number | null;
  mean1: number | null;
  positive1: number | null;
  mfe: number | null;
  mae: number | null;
};

export type TfBreakoutView = {
  timeframe: string;
  state: BreakoutState;
  phase: RecoveryPhase;
  trend: string;
  structure: string;
  momentum: string;
  score: number | null;
  resistance: number | null;
};

export type BreakoutRow = {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  state: BreakoutState;
  score: number | null;
  band: BreakoutScoreBand;
  keySignal: string;
  structure: string;
  momentum: string;
  volume: string;
  compression: string;
  resistance: number | null;
  resistanceSource: string | null;
  distanceToResistancePct: number | null;
  timeframeAlignment: number | null;
  alignmentNote: string;
  breakoutStatus: string;
  demandClass: string;
  sellingPressure: string;
  error?: string;
};

export type BreakoutDetail = BreakoutRow & {
  whatChanged: string;
  earlySignals: string[];
  confirmationRequired: string[];
  invalidation: string[];
  nextTrigger: string;
  scoreFactors: ScoreFactor[];
  demandFactors: ScoreFactor[];
  demandScore: number;
  candleSequence: { time: string; kind: string; label: string; highlight: boolean }[];
  mtf: TfBreakoutView[];
  lifecycle: {
    timeframe: string;
    current: RecoveryPhase;
    events: RecoveryEvent[];
    selloff: SelloffInfo | null;
    exhaustion: { flag: string; date: string | null; evidence: string[] };
    stabilization: { flag: string; date: string | null; evidence: string[]; support: number | null };
    firstHigherLow: { found: boolean; price: number | null; time: string | null };
    battle: ReturnType<typeof walkRecovery>["battle"];
    pullback: string;
    primarySupport: number | null;
    secondarySupport: number | null;
    confidence: ConfidenceLabel;
    evidence: string[];
  };
  analogs: AnalogOutcome;
  overlays: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    vwap: number | null;
    high20: number | null;
    high50: number | null;
    swingHigh: number | null;
    swingLow: number | null;
    support: number | null;
    resistance: number | null;
    firstDemandTime: string | null;
  };
  chart: BreakoutChartBar[];
  rs: { spy1: number | null; spy5: number | null; spy20: number | null; sector20: number | null; vsMarket: string; vsSector: string };
  regime: MarketRegime | null;
};

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

function toChart(bars: OHLCVBar[]): BreakoutChartBar[] {
  return bars.slice(-180).map((b) => {
    const t = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return { time: Math.floor(t.getTime() / 1000), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
  });
}

function periodReturn(closes: number[], n: number) {
  if (closes.length <= n) return null;
  const a = closes[closes.length - 1];
  const b = closes[closes.length - 1 - n];
  if (!b) return null;
  return ((a - b) / b) * 100;
}

export function analogFeatures(input: {
  redStreak: number;
  rsi: number | null;
  distRes: number | null;
  hl: boolean;
  rvol: number | null;
  compressed: boolean;
  macdUp: boolean;
}) {
  return [
    Math.min(input.redStreak, 12) / 12,
    (input.rsi ?? 50) / 100,
    input.distRes == null ? 0.5 : Math.min(Math.max(input.distRes, 0), 8) / 8,
    input.hl ? 1 : 0,
    Math.min(input.rvol ?? 1, 3) / 3,
    input.compressed ? 1 : 0,
    input.macdUp ? 1 : 0,
  ];
}

function featureDistance(a: number[], b: number[]) {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
}

export function historicalAnalogs(bars: OHLCVBar[], current: number[], settings: BreakoutSettings): AnalogOutcome {
  const empty: AnalogOutcome = {
    sample: "INSUFFICIENT_SAMPLE",
    median1: null,
    median3: null,
    median5: null,
    median10: null,
    mean1: null,
    positive1: null,
    mfe: null,
    mae: null,
  };
  if (bars.length < settings.analogLookback / 2 || current.length < 7) return empty;
  const r1: number[] = [];
  const r3: number[] = [];
  const r5: number[] = [];
  const r10: number[] = [];
  const mfe: number[] = [];
  const mae: number[] = [];
  const start = Math.max(30, bars.length - settings.analogLookback);
  const end = bars.length - 11;
  for (let i = start; i < end; i++) {
    const hist = bars.slice(0, i + 1);
    const candles = measureCandles(hist, settings);
    const last = candles[candles.length - 1];
    if (!last) continue;
    const selling = analyzeSellingPressure(candles);
    const structure = detectStructureShift(hist, settings);
    const closes = hist.map((b) => b.close);
    const rsiV = rsi(closes, 14);
    const [, , histMacd] = macd(closes);
    const levels = detectStructuralLevels({ price: last.close, daily: hist });
    const res = nearestAbove(levels.resistances, last.close);
    const dist = res ? ((res.price - last.close) / last.close) * 100 : null;
    const feat = analogFeatures({
      redStreak: selling.consecutiveRedCandles,
      rsi: rsiV[rsiV.length - 1],
      distRes: dist,
      hl: structure.hl,
      rvol: last.rvol,
      compressed: detectCompression(hist, settings).state !== "NORMAL" && detectCompression(hist, settings).state !== "VOLATILITY_EXPANSION",
      macdUp: seriesImproving(histMacd),
    });
    if (featureDistance(feat, current) > settings.analogDistance) continue;
    const fwd = (n: number) => ((bars[i + n].close - bars[i].close) / bars[i].close) * 100;
    r1.push(fwd(1));
    r3.push(fwd(3));
    r5.push(fwd(5));
    r10.push(fwd(10));
    let fav = 0;
    let adv = 0;
    for (let k = 1; k <= 10; k++) {
      const chg = ((bars[i + k].high - bars[i].close) / bars[i].close) * 100;
      const dn = ((bars[i + k].low - bars[i].close) / bars[i].close) * 100;
      fav = Math.max(fav, chg);
      adv = Math.min(adv, dn);
    }
    mfe.push(fav);
    mae.push(adv);
  }
  if (r1.length < settings.analogMinSample) return empty;
  return {
    sample: r1.length,
    median1: median(r1),
    median3: median(r3),
    median5: median(r5),
    median10: median(r10),
    mean1: mean(r1),
    positive1: r1.filter((n) => n > 0).length / r1.length,
    mfe: median(mfe),
    mae: median(mae),
  };
}

export function resolveBreakoutState(input: {
  insufficient: boolean;
  selling: ReturnType<typeof analyzeSellingPressure>;
  demand: ReturnType<typeof firstDemandDetector>;
  structure: ReturnType<typeof detectStructureShift>;
  compression: ReturnType<typeof detectCompression>;
  nearRes: boolean;
  closedAbove: boolean;
  wickAbove: boolean;
  heldAbove: boolean;
  volumeOk: boolean;
  failed: boolean;
  extended: boolean;
  phase: RecoveryPhase;
}): BreakoutState {
  if (input.insufficient) return "INSUFFICIENT_DATA";
  if (input.failed) return "BREAKOUT_FAILED";
  if (input.closedAbove && input.heldAbove && input.volumeOk) {
    return input.extended ? "EXHAUSTION_AFTER_BREAKOUT" : "BREAKOUT_CONFIRMED";
  }
  if (input.closedAbove || input.wickAbove) return "BREAKOUT_ATTEMPT";
  if (input.phase === "CONTINUATION" || input.phase === "HIGHER_HIGH" || input.phase === "FOLLOW_THROUGH" || input.phase === "MOMENTUM_EXPANSION") {
    return "POST_BREAKOUT_CONTINUATION";
  }
  if (input.nearRes && (input.structure.hl || input.selling.state === "WEAKENING" || input.compression.state !== "NORMAL")) {
    return "PRE_BREAKOUT";
  }
  if (input.demand.classification === "EARLY_DEMAND_RETURN") return "EARLY_DEMAND_RETURN";
  if (input.demand.classification === "WEAK_BOUNCE" && input.structure.shift !== "BEARISH_STRUCTURE") return "ACCUMULATION_POTENTIAL";
  if (input.phase === "STABILIZATION" || input.structure.shift === "TRANSITIONING_STRUCTURE") return "BASE_FORMING";
  if (input.selling.state === "EXHAUSTED" || input.phase === "SELLING_EXHAUSTION") return "SELLING_EXHAUSTION";
  if (input.selling.state === "WEAKENING") return "DOWNTREND_WEAKENING";
  if (input.selling.state === "INCREASING" || input.structure.shift === "BEARISH_STRUCTURE") return "STRONG_DOWNTREND";
  if (input.structure.hl) return "ACCUMULATION_POTENTIAL";
  return "BASE_FORMING";
}

export function keySignalFor(state: BreakoutState, demand: ReturnType<typeof firstDemandDetector>, selling: ReturnType<typeof analyzeSellingPressure>, structure: ReturnType<typeof detectStructureShift>, volume: string) {
  if (state === "BREAKOUT_CONFIRMED") return "Confirmed close + volume";
  if (state === "BREAKOUT_ATTEMPT") return "Resistance test / unconfirmed";
  if (state === "PRE_BREAKOUT") return "Range tightening";
  if (state === "EARLY_DEMAND_RETURN") return "First demand candle";
  if (state === "SELLING_EXHAUSTION") return "Selling climax / stall";
  if (state === "DOWNTREND_WEAKENING") return selling.reasons[0] || "Selling pressure weakening";
  if (state === "BREAKOUT_FAILED") return "Failed breakout";
  if (structure.hl) return "Higher low";
  if (demand.classification === "WEAK_BOUNCE") return "Weak bounce";
  if (volume.includes("VOLUME")) return "Volume transition";
  return "Base formation";
}

export function analyzeBreakoutSeries(input: {
  bars: OHLCVBar[];
  settings: BreakoutSettings;
  timeframe: string;
  spyCloses?: number[];
  sectorCloses?: number[];
  regime?: MarketRegime | null;
  skipAnalogs?: boolean;
}): {
  state: BreakoutState;
  score: number | null;
  band: BreakoutScoreBand;
  factors: ScoreFactor[];
  selling: ReturnType<typeof analyzeSellingPressure>;
  demand: ReturnType<typeof firstDemandDetector>;
  structure: ReturnType<typeof detectStructureShift>;
  compression: ReturnType<typeof detectCompression>;
  volumeState: ReturnType<typeof detectVolumeState>;
  recovery: ReturnType<typeof walkRecovery>;
  resistance: number | null;
  resistanceSource: string | null;
  support: number | null;
  distRes: number | null;
  candles: ReturnType<typeof measureCandles>;
  analogs: AnalogOutcome;
  overlays: BreakoutDetail["overlays"];
  rsi: number | null;
  macdHist: number | null;
  alignmentNoteParts: string[];
} {
  const { bars, settings, timeframe } = input;
  if (bars.length < 16) {
    const emptyDemand = firstDemandDetector({
      candles: [],
      selling: analyzeSellingPressure([]),
      structure: detectStructureShift([], settings),
      support: "NONE",
      resistance: null,
      rsiImproving: false,
      macdImproving: false,
      settings,
    });
    return {
      state: "INSUFFICIENT_DATA",
      score: null,
      band: "INSUFFICIENT_DATA",
      factors: [],
      selling: analyzeSellingPressure([]),
      demand: emptyDemand,
      structure: detectStructureShift([], settings),
      compression: detectCompression([], settings),
      volumeState: "INSUFFICIENT_DATA",
      recovery: walkRecovery([], settings, null),
      resistance: null,
      resistanceSource: null,
      support: null,
      distRes: null,
      candles: [],
      analogs: historicalAnalogs([], [], settings),
      overlays: { ema20: null, ema50: null, ema200: null, vwap: null, high20: null, high50: null, swingHigh: null, swingLow: null, support: null, resistance: null, firstDemandTime: null },
      rsi: null,
      macdHist: null,
      alignmentNoteParts: [],
    };
  }
  const candles = measureCandles(bars, settings);
  const last = candles[candles.length - 1];
  const price = last.close;
  const levels = detectStructuralLevels({
    price,
    daily: timeframe === "1d" || timeframe === "1w" || timeframe === "1M" ? bars : bars,
    weekly: timeframe === "1w" || timeframe === "1M" ? bars : undefined,
    h4: timeframe === "4h" ? bars : undefined,
    h1: timeframe === "1h" ? bars : undefined,
    m30: timeframe === "30m" || timeframe === "15m" || timeframe === "5m" ? bars : undefined,
    week52High: Math.max(...bars.map((b) => b.high)),
  });
  const resLevel = nearestAbove(levels.resistances, price);
  const supLevel = nearestBelow(levels.supports, price);
  const resistance = resLevel?.price ?? null;
  const support = supLevel?.price ?? lastSwingLows(bars, settings, 1)[0] ?? null;
  const selling = analyzeSellingPressure(candles);
  const structure = detectStructureShift(bars, settings);
  const compression = detectCompression(bars, settings);
  const volumeState = detectVolumeState(candles, settings);
  const supportRx = detectSupportReaction(bars, support, candles);
  const closes = bars.map((b) => b.close);
  const rsiV = rsi(closes, 14);
  const [, , hist] = macd(closes);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsiImproving = seriesImproving(rsiV);
  const macdImproving = seriesImproving(hist);
  const demand = firstDemandDetector({
    candles,
    selling,
    structure,
    support: supportRx,
    resistance,
    rsiImproving,
    macdImproving,
    settings,
  });
  const recovery = walkRecovery(bars, settings, resistance);
  const distRes = resistance != null ? ((resistance - price) / price) * 100 : null;
  const nearRes = distRes != null && distRes >= 0 && distRes <= settings.breakoutProximityPct;
  const closedAbove = resistance != null && last.close > resistance;
  const wickAbove = resistance != null && last.high > resistance && last.close <= resistance;
  const heldAbove = resistance != null && bars.slice(-2).every((b) => b.close > resistance);
  const volumeOk = (last.rvol ?? 0) >= settings.minRelVolume;
  const failed = recovery.events.some((e) => e.phase === "FAILED_BREAKOUT") && !closedAbove;
  const e20 = ema20[ema20.length - 1];
  const atrs = atr(bars.map((b) => b.high), bars.map((b) => b.low), closes, settings.atrPeriod);
  const lastAtr = atrs[atrs.length - 1];
  const extended = e20 != null && lastAtr != null && (price - e20) / lastAtr > 2.6;
  const state = resolveBreakoutState({
    insufficient: false,
    selling,
    demand,
    structure,
    compression,
    nearRes,
    closedAbove,
    wickAbove,
    heldAbove,
    volumeOk,
    failed,
    extended,
    phase: recovery.current,
  });

  const w = settings.scoreWeights;
  const exhPts = selling.state === "EXHAUSTED" || recovery.exhaustion.flag === "DETECTED" ? w.sellingExhaustion : selling.state === "WEAKENING" ? Math.round(w.sellingExhaustion * 0.7) : 2;
  const candlePts = last.kind.includes("BUYING") ? last.kind === "STRONG_BUYING" ? w.candleQuality : Math.round(w.candleQuality * 0.6) : last.kind === "INDECISION" ? 4 : 2;
  const volPts = volumeState === "VOLUME_CONFIRMATION" || volumeState === "VOLUME_EXPANSION" ? w.volumeTransition : volumeState === "BUYING_VOLUME_INCREASING" || volumeState === "SELLING_VOLUME_DECLINING" ? Math.round(w.volumeTransition * 0.65) : 3;
  const compPts = compression.state === "COMPRESSION_TO_EXPANSION" ? w.priceCompression : compression.state === "VOLATILITY_CONTRACTION" ? Math.round(w.priceCompression * 0.75) : 3;
  const hlPts = structure.hl ? w.higherLow : recovery.firstHL.found ? Math.round(w.higherLow * 0.7) : 2;
  const momPts = rsiImproving && macdImproving ? w.momentum : rsiImproving || macdImproving ? Math.round(w.momentum * 0.55) : 2;
  const proxPts = nearRes ? w.resistanceProximity : distRes != null && distRes > 0 && distRes < 5 ? Math.round(w.resistanceProximity * 0.55) : distRes != null && distRes < 0 ? 2 : 3;
  const prePts = state === "PRE_BREAKOUT" || state === "BREAKOUT_ATTEMPT" ? w.preBreakout : state === "EARLY_DEMAND_RETURN" ? Math.round(w.preBreakout * 0.6) : 3;
  const mktPts = input.regime?.label === "BULLISH" ? w.marketSector : input.regime?.label === "BEARISH" ? 1 : Math.round(w.marketSector * 0.5);
  const feat = analogFeatures({
    redStreak: selling.consecutiveRedCandles,
    rsi: rsiV[rsiV.length - 1],
    distRes,
    hl: structure.hl,
    rvol: last.rvol,
    compressed: compression.state === "VOLATILITY_CONTRACTION" || compression.state === "COMPRESSION_TO_EXPANSION",
    macdUp: macdImproving,
  });
  const analogs = input.skipAnalogs ? historicalAnalogs([], [], settings) : historicalAnalogs(bars, feat, settings);
  const histPts = analogs.sample === "INSUFFICIENT_SAMPLE" ? Math.round(w.historicalSimilarity * 0.3) : (analogs.positive1 ?? 0) >= 0.55 ? w.historicalSimilarity : 2;
  const score = clamp(exhPts + candlePts + volPts + compPts + hlPts + momPts + proxPts + prePts + mktPts + histPts);
  const factors: ScoreFactor[] = [
    { name: "Selling-pressure exhaustion", score: exhPts, max: w.sellingExhaustion, note: selling.state },
    { name: "Candle quality", score: candlePts, max: w.candleQuality, note: last.kind },
    { name: "Volume transition", score: volPts, max: w.volumeTransition, note: volumeState },
    { name: "Price compression", score: compPts, max: w.priceCompression, note: compression.state },
    { name: "Higher-low formation", score: hlPts, max: w.higherLow, note: structure.hl ? "HL" : "not yet" },
    { name: "Momentum improvement", score: momPts, max: w.momentum, note: rsiImproving || macdImproving ? "improving" : "flat" },
    { name: "Resistance proximity", score: proxPts, max: w.resistanceProximity, note: distRes != null ? `${distRes.toFixed(2)}%` : "n/a" },
    { name: "Pre-breakout structure", score: prePts, max: w.preBreakout, note: state },
    { name: "Market/sector confirmation", score: mktPts, max: w.marketSector, note: input.regime?.label || "n/a" },
    { name: "Historical setup similarity", score: histPts, max: w.historicalSimilarity, note: analogs.sample === "INSUFFICIENT_SAMPLE" ? "INSUFFICIENT_SAMPLE" : `${analogs.sample} events` },
  ];
  const divergence = bullishDivergence(lastSwingLows(bars, settings, 3), lastSwingLows(bars.map((b, i) => ({ ...b, low: rsiV[i] ?? b.low, high: rsiV[i] ?? b.high })), settings, 3));
  void divergence;
  const overlays = {
    ema20: ema20[ema20.length - 1],
    ema50: ema50[ema50.length - 1],
    ema200: ema200[ema200.length - 1],
    vwap: null as number | null,
    high20: Math.max(...bars.slice(-20).map((b) => b.high)),
    high50: Math.max(...bars.slice(-50).map((b) => b.high)),
    swingHigh: structure.lastSwingHigh,
    swingLow: structure.lastSwingLow,
    support,
    resistance,
    firstDemandTime: demand.candle?.time ?? null,
  };
  return {
    state,
    score,
    band: breakoutScoreBand(score),
    factors,
    selling,
    demand,
    structure,
    compression,
    volumeState,
    recovery,
    resistance,
    resistanceSource: resLevel ? `${resLevel.timeframe} ${sourceLabel(resLevel.source)}` : null,
    support,
    distRes,
    candles,
    analogs,
    overlays,
    rsi: rsiV[rsiV.length - 1],
    macdHist: hist[hist.length - 1],
    alignmentNoteParts: [],
  };
}

function emptyRow(symbol: string, error?: string): BreakoutRow {
  return {
    symbol,
    name: symbol,
    price: null,
    changePct: null,
    state: "INSUFFICIENT_DATA",
    score: null,
    band: "INSUFFICIENT_DATA",
    keySignal: "DATA_UNAVAILABLE",
    structure: "—",
    momentum: "—",
    volume: "INSUFFICIENT_DATA",
    compression: "—",
    resistance: null,
    resistanceSource: null,
    distanceToResistancePct: null,
    timeframeAlignment: null,
    alignmentNote: "Required market data is unavailable.",
    breakoutStatus: "INSUFFICIENT_DATA",
    demandClass: "NONE",
    sellingPressure: "UNAVAILABLE",
    error,
  };
}

export function analyzeBreakoutTicker(input: {
  symbol: string;
  quote?: Quote | null;
  bars: Partial<Record<BreakoutScanTimeframe | BreakoutLifecycleTimeframe, OHLCVBar[]>>;
  primary: BreakoutScanTimeframe | BreakoutLifecycleTimeframe;
  lifecycle: BreakoutLifecycleTimeframe;
  spyDaily?: number[];
  qqqDaily?: number[];
  sectorDaily?: number[];
  regime?: MarketRegime | null;
  settings: BreakoutSettings;
  error?: string;
  lite?: boolean;
}): { row: BreakoutRow; detail: BreakoutDetail } {
  const symbol = input.symbol.toUpperCase();
  const primaryBars = input.bars[input.primary] || [];
  if (input.error || primaryBars.length < 16) {
    const row = emptyRow(symbol, input.error || "INSUFFICIENT_DATA");
    return {
      row,
      detail: {
        ...row,
        name: input.quote?.name || symbol,
        whatChanged: "Not enough data to describe a transition.",
        earlySignals: [],
        confirmationRequired: ["Close above resistance", "Volume expansion", "Hold breakout", "Higher low on retest"],
        invalidation: ["Break below the higher low", "High-volume rejection", "Failed breakout"],
        nextTrigger: "Unable to define a trigger until enough candles are available.",
        scoreFactors: [],
        demandFactors: [],
        demandScore: 0,
        candleSequence: [],
        mtf: [],
        lifecycle: {
          timeframe: input.lifecycle,
          current: "INSUFFICIENT_DATA",
          events: [],
          selloff: null,
          exhaustion: { flag: "INSUFFICIENT_DATA", date: null, evidence: [] },
          stabilization: { flag: "INSUFFICIENT_DATA", date: null, evidence: [], support: null },
          firstHigherLow: { found: false, price: null, time: null },
          battle: { detected: false, level: null, volume: null, rvol: null, range: null, closeLocation: null, winner: "UNRESOLVED" },
          pullback: "None",
          primarySupport: null,
          secondarySupport: null,
          confidence: "LOW",
          evidence: ["INSUFFICIENT_DATA"],
        },
        analogs: historicalAnalogs([], [], input.settings),
        overlays: { ema20: null, ema50: null, ema200: null, vwap: null, high20: null, high50: null, swingHigh: null, swingLow: null, support: null, resistance: null, firstDemandTime: null },
        chart: [],
        rs: { spy1: null, spy5: null, spy20: null, sector20: null, vsMarket: "INSUFFICIENT_DATA", vsSector: "INSUFFICIENT_DATA" },
        regime: input.regime || null,
      },
    };
  }

  const skipMtfAnalogs = true;
  const primary = analyzeBreakoutSeries({ bars: primaryBars, settings: input.settings, timeframe: input.primary, regime: input.regime, skipAnalogs: true });
  const lifeBars = input.bars[input.lifecycle] || primaryBars;
  const life = input.lite
    ? primary
    : analyzeBreakoutSeries({ bars: lifeBars, settings: input.settings, timeframe: input.lifecycle, regime: input.regime, skipAnalogs: false });
  const prevBars = primaryBars.slice(0, -1);
  const prev = prevBars.length >= 16 ? analyzeBreakoutSeries({ bars: prevBars, settings: input.settings, timeframe: input.primary, regime: input.regime, skipAnalogs: true }) : null;

  const tfs: Array<BreakoutScanTimeframe | BreakoutLifecycleTimeframe> = input.lite
    ? ([input.primary, "1d", "4h"] as Array<BreakoutScanTimeframe | BreakoutLifecycleTimeframe>)
    : ["5m", "15m", "30m", "1h", "4h", "1d", "1w"];
  const mtf: TfBreakoutView[] = [...new Set(tfs)].map((tf) => {
    const series = input.bars[tf];
    if (!series || series.length < 16) {
      return { timeframe: tf, state: "INSUFFICIENT_DATA", phase: "INSUFFICIENT_DATA", trend: "—", structure: "—", momentum: "—", score: null, resistance: null };
    }
    const view = tf === input.primary ? primary : analyzeBreakoutSeries({ bars: series, settings: input.settings, timeframe: tf, regime: input.regime, skipAnalogs: skipMtfAnalogs });
    return {
      timeframe: tf,
      state: view.state,
      phase: view.recovery.current,
      trend: view.structure.shift.replaceAll("_", " "),
      structure: [view.structure.hh ? "HH" : "", view.structure.hl ? "HL" : "", view.structure.lh ? "LH" : "", view.structure.ll ? "LL" : ""].filter(Boolean).join("/") || "—",
      momentum: view.rsi != null && view.rsi > 55 ? "Improving" : view.rsi != null && view.rsi < 40 ? "Weak" : "Stabilizing",
      score: view.score,
      resistance: view.resistance,
    };
  });
  const known = mtf.filter((t) => t.state !== "INSUFFICIENT_DATA");
  const bullishish = known.filter((t) => ["PRE_BREAKOUT", "BREAKOUT_ATTEMPT", "BREAKOUT_CONFIRMED", "EARLY_DEMAND_RETURN", "POST_BREAKOUT_CONTINUATION"].includes(t.state));
  const alignment = known.length ? Math.round((bullishish.length / known.length) * 100) : null;
  const daily = mtf.find((t) => t.timeframe === "1d");
  const short = mtf.filter((t) => ["5m", "15m", "30m"].includes(t.timeframe));
  let alignmentNote = "Timeframe evidence is mixed; the selected timeframe remains primary.";
  if (daily?.state === "STRONG_DOWNTREND" && short.some((t) => t.state === "BREAKOUT_ATTEMPT" || t.state === "BREAKOUT_CONFIRMED")) {
    alignmentNote = "Short-term breakout occurring against a higher-timeframe downtrend.";
  } else if ((alignment ?? 0) >= 70) {
    alignmentNote = "Multiple timeframes show demand returning or pre-breakout structure.";
  }

  const dailyCloses = (input.bars["1d"] || []).map((b) => b.close);
  const spy1 = periodReturn(dailyCloses, 1);
  const spy5 = periodReturn(dailyCloses, 5);
  const spy20 = periodReturn(dailyCloses, 20);
  const mkt1 = periodReturn(input.spyDaily || [], 1);
  const mkt5 = periodReturn(input.spyDaily || [], 5);
  const mkt20 = periodReturn(input.spyDaily || [], 20);
  const sec20 = periodReturn(input.sectorDaily || [], 20);
  const vsMarket = spy20 != null && mkt20 != null ? (spy20 - mkt20 > 0.4 ? "OUTPERFORMING_MARKET" : spy20 - mkt20 < -0.4 ? "UNDERPERFORMING_MARKET" : "IN_LINE") : "INSUFFICIENT_DATA";
  const vsSector = spy20 != null && sec20 != null ? (spy20 - sec20 > 0.4 ? "OUTPERFORMING_SECTOR" : spy20 - sec20 < -0.4 ? "UNDERPERFORMING_SECTOR" : "IN_LINE") : "INSUFFICIENT_DATA";

  let whatChanged = "No material state change on the latest completed candle.";
  if (prev && prev.state !== primary.state) {
    whatChanged = `Yesterday/prior bar: ${prev.state.replaceAll("_", " ")}. Latest bar: ${primary.state.replaceAll("_", " ")}.`;
  } else if (primary.demand.classification === "EARLY_DEMAND_RETURN") {
    whatChanged = "After several sessions of declining pressure, selling momentum weakened and the first meaningful demand candle appeared.";
  } else if (primary.structure.hl && prev && !prev.structure.hl) {
    whatChanged = "The latest swing printed a higher low — early bullish structural evidence, not a confirmed trend.";
  } else if (primary.selling.state === "WEAKENING") {
    whatChanged = "Selling pressure is still present, but downside range and/or selling volume are contracting.";
  }

  const earlySignals = [
    primary.selling.state === "WEAKENING" || primary.selling.state === "EXHAUSTED" ? "Selling pressure weakening" : "",
    primary.structure.hl ? "Higher low formed" : "",
    primary.rsi != null && seriesImproving(rsi((input.bars[input.primary] || []).map((b) => b.close), 14)) ? "Bullish momentum improving" : "",
    ["VOLUME_EXPANSION", "VOLUME_CONFIRMATION", "BUYING_VOLUME_INCREASING", "SELLING_VOLUME_DECLINING"].includes(primary.volumeState) ? "Volume transitioning" : "",
    primary.distRes != null && primary.distRes >= 0 && primary.distRes <= input.settings.breakoutProximityPct ? "Price approaching resistance" : "",
    vsMarket === "OUTPERFORMING_MARKET" || vsSector === "OUTPERFORMING_SECTOR" ? "Relative strength improving" : "",
  ].filter(Boolean);

  const evidence = [
    life.recovery.selloff ? `Selloff ${life.recovery.selloff.severity.toLowerCase()} (${life.recovery.selloff.declinePct.toFixed(1)}%, ${life.recovery.selloff.atrDecline?.toFixed(2) ?? "n/a"} ATR)` : "",
    life.recovery.exhaustion.flag === "DETECTED" ? "Selloff exhausted" : "",
    life.recovery.firstHL.found ? "Higher low established" : "",
    life.structure.hh ? "Higher high established" : "",
    primary.state === "BREAKOUT_CONFIRMED" ? "Resistance reclaimed" : "",
    primary.volumeState === "VOLUME_CONFIRMATION" ? "Volume confirmation" : "",
    earlySignals.includes("Bullish momentum improving") ? "Momentum improving" : "",
    life.recovery.primarySupport != null ? "Support holding" : "",
  ].filter(Boolean);
  const confidence: ConfidenceLabel = evidence.length >= 6 ? "HIGH" : evidence.length >= 3 ? "MEDIUM" : "LOW";

  const row: BreakoutRow = {
    symbol,
    name: input.quote?.name || symbol,
    price: input.quote?.price ?? lastNumSafe(primaryBars),
    changePct: input.quote?.change_percent ?? null,
    state: primary.state,
    score: primary.score,
    band: primary.band,
    keySignal: keySignalFor(primary.state, primary.demand, primary.selling, primary.structure, primary.volumeState),
    structure: [primary.structure.hh ? "HH" : "", primary.structure.hl ? "HL" : "", primary.structure.lh ? "LH" : "", primary.structure.ll ? "LL" : ""].filter(Boolean).join(" / ") || primary.structure.shift.replaceAll("_", " "),
    momentum: primary.rsi != null && primary.rsi > 55 ? "Improving" : primary.rsi != null && primary.rsi < 40 ? "Weak" : "Stabilizing",
    volume: primary.volumeState.replaceAll("_", " "),
    compression: primary.compression.state.replaceAll("_", " "),
    resistance: primary.resistance,
    resistanceSource: primary.resistanceSource,
    distanceToResistancePct: primary.distRes,
    timeframeAlignment: alignment,
    alignmentNote,
    breakoutStatus: primary.state === "BREAKOUT_CONFIRMED" ? "Confirmed" : primary.state === "BREAKOUT_ATTEMPT" ? "Attempt" : primary.state === "BREAKOUT_FAILED" ? "Failed" : "Not broken",
    demandClass: primary.demand.classification,
    sellingPressure: primary.selling.state,
  };

  const seq = primary.candles.slice(-12).map((c, i, arr) => ({
    time: c.time,
    kind: c.kind,
    label: `${c.direction < 0 ? "RED" : c.direction > 0 ? "GREEN" : "DOJI"} / ${c.kind.replaceAll("_", " ")}`,
    highlight: i === arr.length - 1 && (primary.demand.classification === "EARLY_DEMAND_RETURN" || primary.state === "BREAKOUT_ATTEMPT" || primary.state === "BREAKOUT_CONFIRMED"),
  }));

  const detail: BreakoutDetail = {
    ...row,
    whatChanged,
    earlySignals,
    confirmationRequired: ["Close above resistance", "Volume expansion", "Hold breakout", "Higher low on retest"],
    invalidation: [
      life.recovery.primarySupport != null ? `Break below ${life.recovery.primarySupport.toFixed(2)} support` : "Break below the higher low",
      "High-volume rejection",
      "Failed breakout",
    ],
    nextTrigger: primary.resistance
      ? `${input.primary} close above ${primary.resistance.toFixed(2)} with relative volume ≥ ${input.settings.minRelVolume.toFixed(1)}x.`
      : "Unable to define a trigger until a structural resistance is identified.",
    scoreFactors: primary.factors,
    demandFactors: primary.demand.factors,
    demandScore: primary.demand.score,
    candleSequence: seq,
    mtf,
    lifecycle: {
      timeframe: input.lifecycle,
      current: life.recovery.current,
      events: life.recovery.events,
      selloff: life.recovery.selloff,
      exhaustion: life.recovery.exhaustion,
      stabilization: life.recovery.stabilization,
      firstHigherLow: { found: life.recovery.firstHL.found, price: life.recovery.firstHL.price, time: life.recovery.firstHL.time },
      battle: life.recovery.battle,
      pullback: life.recovery.pullback,
      primarySupport: life.recovery.primarySupport,
      secondarySupport: life.recovery.secondarySupport,
      confidence,
      evidence,
    },
    analogs: life.analogs,
    overlays: life.overlays,
    chart: toChart(lifeBars),
    rs: {
      spy1: spy1 != null && mkt1 != null ? spy1 - mkt1 : null,
      spy5: spy5 != null && mkt5 != null ? spy5 - mkt5 : null,
      spy20: spy20 != null && mkt20 != null ? spy20 - mkt20 : null,
      sector20: spy20 != null && sec20 != null ? spy20 - sec20 : null,
      vsMarket,
      vsSector,
    },
    regime: input.regime || null,
  };
  void priceVolumePressure;
  void assessMarketRegime;
  void sectorForTicker;
  void snapshotTimeframe;
  return { row, detail };
}

function lastNumSafe(bars: OHLCVBar[]) {
  return bars.length ? bars[bars.length - 1].close : null;
}

export { assessMarketRegime, sectorForTicker, snapshotTimeframe };
export type { MarketRegime };
