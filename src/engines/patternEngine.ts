import { ema, macd, rsi, swingPoints } from "@/src/engines/indicators";
import type { OHLCVBar } from "@/src/types/domain";

export type PatternBias = "BULLISH" | "BEARISH" | "NEUTRAL";

export type PatternStatus =
  | "FORMING"
  | "BREAKOUT_PENDING"
  | "BREAKOUT_CONFIRMED"
  | "RETEST_PENDING"
  | "RETEST_CONFIRMED"
  | "FAILED"
  | "INVALIDATED"
  | "COMPLETED"
  | "INSUFFICIENT_DATA";

export type PatternPoint = {
  timestamp: string;
  candleIndex: number;
  price: number;
  type: "SWING_HIGH" | "SWING_LOW";
  role: string;
};

export type CandleReference = {
  timestamp: string;
  candleIndex: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type BreakoutValidation = {
  boundaryLevel: number;
  breakoutDirection: "UP" | "DOWN";
  candleClosedBeyondBoundary: boolean;
  wickOnly: boolean;
  breakoutPercentage: number;
  volumeConfirmed: boolean;
  relativeVolume: number | null;
  followThroughConfirmed: boolean;
  retestOccurred: boolean;
  retestHeld: boolean | null;
  falseBreakoutRisk: "LOW" | "MEDIUM" | "HIGH";
  confirmationScore: number;
  explanation: string;
};

export type EvidenceRow = { label: string; value: string; ok: boolean | null };

export type DetectedPattern = {
  id: string;
  name: string;
  bias: PatternBias;
  family: string;
  status: PatternStatus;
  displayStatus: string;
  confidence: number;
  qualityBand: "Weak" | "Developing" | "Valid" | "Strong";
  startTimestamp: string;
  endTimestamp: string;
  points: PatternPoint[];
  supportLevel: number | null;
  resistanceLevel: number | null;
  neckline: number | null;
  breakoutLevel: number | null;
  breakoutCandle: CandleReference | null;
  retestLevel: number | null;
  retestCandle: CandleReference | null;
  retestStatus: "NOT_APPLICABLE" | "NO_RETEST" | "RETEST_PENDING" | "RETEST_HELD" | "RETEST_FAILED";
  breakout: BreakoutValidation | null;
  validation: EvidenceRow[];
  explanation: string;
  invalidation: string;
  wickNote: string | null;
  detectedAt: string;
  confirmedAt: string | null;
  invalidatedAt: string | null;
};

export type MarketStructure = {
  type: string;
  label: string;
  bias: PatternBias;
  explanation: string;
  conflict: string | null;
};

export type SignalFactor = { name: string; score: number; max: number; note: string };

export type PatternTradingSignal = {
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  action: "BUY" | "SELL" | "WAIT" | "NO_TRADE" | "INSUFFICIENT_DATA";
  score: number;
  factors: SignalFactor[];
  why: string;
  entryStatus: string;
};

export type PatternAnalysis = {
  primary: DetectedPattern | null;
  secondary: DetectedPattern | null;
  alternative: DetectedPattern | null;
  marketStructure: MarketStructure;
  signal: PatternTradingSignal;
  dataQuality: { ok: boolean; reason: string; candles: number; volumeAvailable: boolean; missing: number };
  evaluated: number;
};

export const PATTERN_SIGNAL_WEIGHTS = {
  quality: 20,
  structure: 15,
  breakout: 20,
  volume: 10,
  retest: 10,
  momentum: 10,
  trend: 10,
  mtf: 5,
} as const;

export const PATTERN_CONFIDENCE_MIN = 40;
export const VOLUME_LOOKBACK = 20;

export type Swing = { i: number; price: number; type: "SWING_HIGH" | "SWING_LOW" };

function iso(bar: OHLCVBar) {
  const d = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function atrApprox(bars: OHLCVBar[], period = 14) {
  if (bars.length < 2) return Math.abs(bars[0]?.close || 1) * 0.02;
  let sum = 0;
  const start = Math.max(1, bars.length - period);
  for (let i = start; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    sum += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev));
  }
  return sum / (bars.length - start) || bars[bars.length - 1].close * 0.015;
}

export function assessPatternDataQuality(bars: OHLCVBar[]) {
  const missing = bars.filter((b) => !Number.isFinite(b.close) || !Number.isFinite(b.high) || !Number.isFinite(b.low)).length;
  let invalid = 0;
  let volKnown = 0;
  for (const b of bars) {
    if (b.high + 1e-9 < b.low || b.high + 1e-9 < Math.max(b.open, b.close) || b.low - 1e-9 > Math.min(b.open, b.close)) invalid += 1;
    if (b.volume > 0) volKnown += 1;
  }
  if (bars.length < 20) {
    return { ok: false, reason: "Unable to evaluate pattern. Insufficient candle data.", candles: bars.length, volumeAvailable: volKnown > 4, missing };
  }
  if (invalid > bars.length * 0.08) {
    return { ok: false, reason: "Unable to evaluate pattern. Invalid OHLC relationships.", candles: bars.length, volumeAvailable: volKnown > 4, missing };
  }
  return { ok: true, reason: "VALID", candles: bars.length, volumeAvailable: volKnown > bars.length * 0.4, missing };
}

export function collectAdaptiveSwings(
  bars: OHLCVBar[],
  opts?: { left?: number; right?: number; pct?: number; atrMult?: number },
): { highs: Swing[]; lows: Swing[]; atr: number; minDistance: number } {
  const left = opts?.left ?? 3;
  const right = opts?.right ?? 3;
  const atr = atrApprox(bars);
  const px = bars[bars.length - 1]?.close || 1;
  const minDistance = Math.max(px * (opts?.pct ?? 0.006), atr * (opts?.atrMult ?? 0.35));
  const [sh, sl] = swingPoints(
    bars.map((b) => b.high),
    bars.map((b) => b.low),
    left,
    right,
  );
  const raw: Swing[] = [];
  sh.forEach((v, i) => {
    if (v != null) raw.push({ i, price: v, type: "SWING_HIGH" });
  });
  sl.forEach((v, i) => {
    if (v != null) raw.push({ i, price: v, type: "SWING_LOW" });
  });
  raw.sort((a, b) => a.i - b.i);
  const filtered: Swing[] = [];
  for (const swing of raw) {
    const prev = filtered[filtered.length - 1];
    if (!prev) {
      filtered.push(swing);
      continue;
    }
    if (prev.type === swing.type) {
      if (swing.type === "SWING_HIGH" && swing.price >= prev.price) filtered[filtered.length - 1] = swing;
      if (swing.type === "SWING_LOW" && swing.price <= prev.price) filtered[filtered.length - 1] = swing;
      continue;
    }
    if (Math.abs(swing.price - prev.price) < minDistance) continue;
    filtered.push(swing);
  }
  return {
    highs: filtered.filter((s) => s.type === "SWING_HIGH"),
    lows: filtered.filter((s) => s.type === "SWING_LOW"),
    atr,
    minDistance,
  };
}

function point(bars: OHLCVBar[], swing: Swing, role: string): PatternPoint {
  return {
    timestamp: iso(bars[swing.i]),
    candleIndex: swing.i,
    price: swing.price,
    type: swing.type,
    role,
  };
}

function candleAt(bars: OHLCVBar[], i: number): CandleReference | null {
  const bar = bars[i];
  if (!bar) return null;
  return {
    timestamp: iso(bar),
    candleIndex: i,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
}

export function relativeVolume(bars: OHLCVBar[], index: number, lookback = VOLUME_LOOKBACK): number | null {
  const start = Math.max(0, index - lookback);
  const prior = bars.slice(start, index).filter((b) => b.volume > 0);
  if (!prior.length || !(bars[index]?.volume > 0)) return null;
  const avg = prior.reduce((s, b) => s + b.volume, 0) / prior.length;
  if (!(avg > 0)) return null;
  return bars[index].volume / avg;
}

export function validateBreakout(
  bars: OHLCVBar[],
  boundary: number,
  direction: "UP" | "DOWN",
  afterIndex: number,
): BreakoutValidation {
  const atr = atrApprox(bars);
  let breakIdx = -1;
  let wickOnly = false;
  for (let i = afterIndex + 1; i < bars.length; i++) {
    const bar = bars[i];
    const closed = direction === "UP" ? bar.close > boundary : bar.close < boundary;
    const wicked = direction === "UP" ? bar.high > boundary && bar.close <= boundary : bar.low < boundary && bar.close >= boundary;
    if (closed) {
      breakIdx = i;
      wickOnly = false;
      break;
    }
    if (wicked) wickOnly = true;
  }
  const last = bars[bars.length - 1];
  const rvol = breakIdx >= 0 ? relativeVolume(bars, breakIdx) : relativeVolume(bars, bars.length - 1);
  const volumeConfirmed = rvol != null && rvol >= 1.2;
  const closedBeyond = breakIdx >= 0;
  const breakPx = closedBeyond ? bars[breakIdx].close : last.close;
  const breakoutPercentage = direction === "UP" ? ((breakPx - boundary) / boundary) * 100 : ((boundary - breakPx) / boundary) * 100;
  let followThroughConfirmed = false;
  if (closedBeyond && breakIdx < bars.length - 1) {
    const next = bars[breakIdx + 1];
    followThroughConfirmed = direction === "UP" ? next.close > boundary : next.close < boundary;
  }
  const retest = detectRetest(bars, boundary, direction, breakIdx);
  let risk: BreakoutValidation["falseBreakoutRisk"] = "LOW";
  if (!closedBeyond) risk = wickOnly ? "HIGH" : "MEDIUM";
  else if (!volumeConfirmed && !retest.held) risk = "HIGH";
  else if (!volumeConfirmed || retest.status === "RETEST_FAILED") risk = "MEDIUM";
  if (closedBeyond) {
    const after = bars.slice(breakIdx + 1);
    const failed = after.some((b) => (direction === "UP" ? b.close < boundary : b.close > boundary));
    if (failed && !retest.held) risk = "HIGH";
  }
  const confirmationScore = Math.round(
    (closedBeyond ? 40 : 0) +
      (volumeConfirmed ? 20 : rvol == null ? 0 : 6) +
      (followThroughConfirmed ? 15 : 0) +
      (retest.held ? 15 : 0) +
      (Math.abs(breakoutPercentage) > (atr / (last.close || 1)) * 50 ? 10 : 4),
  );
  const explanation = !closedBeyond
    ? wickOnly
      ? "Price traded beyond the boundary, but the candle did not close beyond it."
      : "No candle has closed beyond the pattern boundary."
    : `Candle closed ${Math.abs(breakoutPercentage).toFixed(2)}% ${direction === "UP" ? "above" : "below"} the boundary${rvol != null ? ` with ${rvol.toFixed(2)}x average volume` : "; volume confirmation unavailable"}.`;
  return {
    boundaryLevel: boundary,
    breakoutDirection: direction,
    candleClosedBeyondBoundary: closedBeyond,
    wickOnly,
    breakoutPercentage,
    volumeConfirmed,
    relativeVolume: rvol,
    followThroughConfirmed,
    retestOccurred: retest.occurred,
    retestHeld: retest.held,
    falseBreakoutRisk: risk,
    confirmationScore: Math.max(0, Math.min(100, confirmationScore)),
    explanation,
  };
}

export function detectRetest(bars: OHLCVBar[], boundary: number, direction: "UP" | "DOWN", breakIndex: number) {
  if (breakIndex < 0) return { occurred: false, held: null as boolean | null, status: "NOT_APPLICABLE" as const, index: -1 };
  const atr = atrApprox(bars);
  const band = Math.max(atr * 0.25, Math.abs(boundary) * 0.002);
  let index = -1;
  for (let i = breakIndex + 1; i < bars.length; i++) {
    const bar = bars[i];
    const touched = bar.low <= boundary + band && bar.high >= boundary - band;
    if (touched) {
      index = i;
      const held = direction === "UP" ? bar.close >= boundary : bar.close <= boundary;
      const laterFail = bars.slice(i + 1).some((b) => (direction === "UP" ? b.close < boundary : b.close > boundary));
      if (!held || laterFail) return { occurred: true, held: false, status: "RETEST_FAILED" as const, index };
      return { occurred: true, held: true, status: "RETEST_HELD" as const, index };
    }
  }
  return { occurred: false, held: null, status: "RETEST_PENDING" as const, index };
}

function qualityBand(score: number): DetectedPattern["qualityBand"] {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Valid";
  if (score >= 40) return "Developing";
  return "Weak";
}

function displayStatus(status: PatternStatus, bias: PatternBias) {
  if (status === "BREAKOUT_CONFIRMED" || status === "RETEST_PENDING" || status === "RETEST_CONFIRMED" || status === "COMPLETED") {
    return bias === "BEARISH" ? "Confirmed Breakdown" : "Breakout Confirmed";
  }
  if (status === "FAILED" || status === "INVALIDATED" || status === "INSUFFICIENT_DATA") return "Watching";
  return "Forming";
}

function finalizeStatus(
  bars: OHLCVBar[],
  afterIndex: number,
  boundary: number | null,
  bias: PatternBias,
  complete: boolean,
  span: number,
  maxBars: number,
): { status: PatternStatus; breakout: BreakoutValidation | null; retestStatus: DetectedPattern["retestStatus"]; wickNote: string | null; confirmedAt: string | null } {
  if (span > maxBars) {
    return { status: "INVALIDATED", breakout: null, retestStatus: "NOT_APPLICABLE", wickNote: null, confirmedAt: null };
  }
  if (!complete || boundary == null) {
    return { status: "FORMING", breakout: null, retestStatus: "NOT_APPLICABLE", wickNote: null, confirmedAt: null };
  }
  const direction: "UP" | "DOWN" = bias === "BEARISH" ? "DOWN" : "UP";
  const breakout = validateBreakout(bars, boundary, direction, afterIndex);
  if (!breakout.candleClosedBeyondBoundary) {
    return {
      status: "BREAKOUT_PENDING",
      breakout,
      retestStatus: "NOT_APPLICABLE",
      wickNote: breakout.wickOnly ? breakout.explanation : null,
      confirmedAt: null,
    };
  }
  if (breakout.falseBreakoutRisk === "HIGH" && breakout.retestHeld === false) {
    return { status: "FAILED", breakout, retestStatus: "RETEST_FAILED", wickNote: null, confirmedAt: iso(bars[bars.length - 1]) };
  }
  if (breakout.retestHeld) {
    return { status: "RETEST_CONFIRMED", breakout, retestStatus: "RETEST_HELD", wickNote: null, confirmedAt: iso(bars[bars.length - 1]) };
  }
  if (breakout.retestOccurred && breakout.retestHeld === false) {
    return { status: "FAILED", breakout, retestStatus: "RETEST_FAILED", wickNote: null, confirmedAt: iso(bars[bars.length - 1]) };
  }
  return { status: "RETEST_PENDING", breakout, retestStatus: "RETEST_PENDING", wickNote: null, confirmedAt: iso(bars[bars.length - 1]) };
}

function near(a: number, b: number, tol: number) {
  return Math.abs(a - b) <= tol;
}

function priorTrend(bars: OHLCVBar[], end: number, lookback: number) {
  const start = Math.max(0, end - lookback);
  if (end - start < 4) return 0;
  return bars[end].close - bars[start].close;
}

function makePattern(
  bars: OHLCVBar[],
  partial: Omit<DetectedPattern, "displayStatus" | "qualityBand" | "detectedAt" | "startTimestamp" | "endTimestamp"> & {
    startIndex: number;
    endIndex: number;
  },
): DetectedPattern {
  return {
    ...partial,
    displayStatus: displayStatus(partial.status, partial.bias),
    qualityBand: qualityBand(partial.confidence),
    startTimestamp: iso(bars[partial.startIndex]),
    endTimestamp: iso(bars[partial.endIndex]),
    detectedAt: iso(bars[bars.length - 1]),
  };
}

export function detectHeadAndShoulders(bars: OHLCVBar[], swings: ReturnType<typeof collectAdaptiveSwings>): DetectedPattern | null {
  const { highs, lows, atr } = swings;
  if (highs.length < 3 || lows.length < 2) return null;
  for (let i = highs.length - 1; i >= 2; i--) {
    const ls = highs[i - 2];
    const head = highs[i - 1];
    const rs = highs[i];
    if (!(head.price > ls.price && head.price > rs.price)) continue;
    if (head.price - Math.max(ls.price, rs.price) < atr * 0.7) continue;
    if (!near(ls.price, rs.price, atr * 1.5)) continue;
    if (rs.i - ls.i < 12) continue;
    const n1 = lows.find((l) => l.i > ls.i && l.i < head.i);
    const n2 = lows.find((l) => l.i > head.i && l.i < rs.i);
    if (!n1 || !n2) continue;
    const neckline = (n1.price + n2.price) / 2;
    if (!(head.price > neckline + atr * 0.6)) continue;
    const complete = rs.i < bars.length - 1;
    const span = rs.i - ls.i;
    const pack = finalizeStatus(bars, rs.i, neckline, "BEARISH", complete || true, span, 90);
    if (rs.price >= head.price) continue;
    const last = bars[bars.length - 1];
    const invalid = last.close > head.price;
    const status = invalid ? "INVALIDATED" : pack.status === "BREAKOUT_PENDING" && !complete ? "FORMING" : pack.status;
    const confidence = Math.round(
      62 +
        (head.price - Math.max(ls.price, rs.price) > atr ? 8 : 0) +
        (pack.breakout?.candleClosedBeyondBoundary ? 12 : 0) +
        (pack.breakout?.volumeConfirmed ? 8 : 0) +
        (near(ls.price, rs.price, atr) ? 6 : 0),
    );
    return makePattern(bars, {
      id: "head_shoulders",
      name: "Head & Shoulders",
      bias: "BEARISH",
      family: "reversal",
      status,
      confidence: Math.min(96, confidence),
      points: [point(bars, ls, "Left Shoulder"), point(bars, head, "Head"), point(bars, rs, "Right Shoulder"), point(bars, n1, "Neckline 1"), point(bars, n2, "Neckline 2")],
      supportLevel: neckline,
      resistanceLevel: head.price,
      neckline,
      breakoutLevel: neckline,
      breakoutCandle: pack.breakout?.candleClosedBeyondBoundary ? bars.slice(rs.i + 1).map((b, idx) => ({ b, idx: rs.i + 1 + idx })).find(({ b }) => b.close < neckline)?.idx != null ? candleAt(bars, bars.slice(rs.i + 1).findIndex((b) => b.close < neckline) + rs.i + 1) : null : null,
      retestLevel: neckline,
      retestCandle: pack.retestStatus === "RETEST_HELD" || pack.retestStatus === "RETEST_FAILED" ? candleAt(bars, detectRetest(bars, neckline, "DOWN", pack.breakout?.candleClosedBeyondBoundary ? rs.i + 1 : -1).index) : null,
      retestStatus: pack.retestStatus,
      breakout: pack.breakout,
      validation: [
        { label: "Prior Trend", value: priorTrend(bars, ls.i, 18) < 0 ? "Uptrend into highs" : "Mixed", ok: priorTrend(bars, ls.i, 18) > 0 },
        { label: "Head highest", value: "Yes", ok: true },
        { label: "Shoulder symmetry", value: `${((1 - Math.abs(ls.price - rs.price) / head.price) * 100).toFixed(0)}%`, ok: near(ls.price, rs.price, atr * 1.8) },
        { label: "Neckline", value: neckline.toFixed(2), ok: true },
        { label: "Close < neckline", value: pack.breakout?.candleClosedBeyondBoundary ? "Yes" : "No", ok: pack.breakout?.candleClosedBeyondBoundary ?? false },
        { label: "Volume", value: pack.breakout?.relativeVolume != null ? `${pack.breakout.relativeVolume.toFixed(2)}x` : "Unavailable", ok: pack.breakout?.volumeConfirmed ?? null },
      ],
      explanation: `Left shoulder, higher head, and right shoulder define a Head & Shoulders. Neckline is the average of the two reaction lows. ${pack.breakout?.explanation || "Waiting for a close below the neckline."}`,
      invalidation: `Close above the head at ${head.price.toFixed(2)} or a right shoulder that exceeds the head.`,
      wickNote: pack.wickNote,
      confirmedAt: pack.confirmedAt,
      invalidatedAt: invalid ? iso(last) : null,
      startIndex: ls.i,
      endIndex: rs.i,
    });
  }
  return null;
}

export function detectInverseHeadAndShoulders(bars: OHLCVBar[], swings: ReturnType<typeof collectAdaptiveSwings>): DetectedPattern | null {
  const { highs, lows, atr } = swings;
  if (lows.length < 3 || highs.length < 2) return null;
  for (let i = lows.length - 1; i >= 2; i--) {
    const ls = lows[i - 2];
    const head = lows[i - 1];
    const rs = lows[i];
    if (!(head.price < ls.price && head.price < rs.price)) continue;
    if (Math.min(ls.price, rs.price) - head.price < atr * 0.7) continue;
    if (!near(ls.price, rs.price, atr * 1.5)) continue;
    if (rs.i - ls.i < 12) continue;
    const n1 = highs.find((h) => h.i > ls.i && h.i < head.i);
    const n2 = highs.find((h) => h.i > head.i && h.i < rs.i);
    if (!n1 || !n2) continue;
    const neckline = (n1.price + n2.price) / 2;
    if (!(head.price < neckline - atr * 0.6)) continue;
    const complete = true;
    const pack = finalizeStatus(bars, rs.i, neckline, "BULLISH", complete, rs.i - ls.i, 90);
    const last = bars[bars.length - 1];
    const invalid = last.close < head.price;
    const status = invalid ? "INVALIDATED" : pack.status === "BREAKOUT_PENDING" && rs.i >= bars.length - 2 ? "FORMING" : pack.status;
    const confidence = Math.round(
      62 +
        (Math.min(ls.price, rs.price) - head.price > atr ? 8 : 0) +
        (pack.breakout?.candleClosedBeyondBoundary ? 12 : 0) +
        (pack.breakout?.volumeConfirmed ? 8 : 0) +
        (near(ls.price, rs.price, atr) ? 6 : 0),
    );
    const breakIdx = bars.slice(rs.i + 1).findIndex((b) => b.close > neckline);
    return makePattern(bars, {
      id: "inv_head_shoulders",
      name: "Inverse Head & Shoulders",
      bias: "BULLISH",
      family: "reversal",
      status,
      confidence: Math.min(96, confidence),
      points: [point(bars, ls, "Left Shoulder"), point(bars, head, "Head"), point(bars, rs, "Right Shoulder"), point(bars, n1, "Neckline 1"), point(bars, n2, "Neckline 2")],
      supportLevel: head.price,
      resistanceLevel: neckline,
      neckline,
      breakoutLevel: neckline,
      breakoutCandle: breakIdx >= 0 ? candleAt(bars, rs.i + 1 + breakIdx) : null,
      retestLevel: neckline,
      retestCandle: null,
      retestStatus: pack.retestStatus,
      breakout: pack.breakout,
      validation: [
        { label: "Head lowest", value: "Yes", ok: true },
        { label: "Shoulder symmetry", value: `${((1 - Math.abs(ls.price - rs.price) / Math.max(ls.price, 1)) * 100).toFixed(0)}%`, ok: true },
        { label: "Neckline", value: neckline.toFixed(2), ok: true },
        { label: "Close > neckline", value: pack.breakout?.candleClosedBeyondBoundary ? "Yes" : "No", ok: pack.breakout?.candleClosedBeyondBoundary ?? false },
        { label: "Volume", value: pack.breakout?.relativeVolume != null ? `${pack.breakout.relativeVolume.toFixed(2)}x` : "Unavailable", ok: pack.breakout?.volumeConfirmed ?? null },
      ],
      explanation: `Three troughs with the middle trough lowest form Inverse Head & Shoulders. Neckline uses the two reaction highs. ${pack.breakout?.explanation || "Waiting for a close above the neckline."}`,
      invalidation: `Close below the head at ${head.price.toFixed(2)} or a right shoulder that undercuts the head.`,
      wickNote: pack.wickNote,
      confirmedAt: pack.confirmedAt,
      invalidatedAt: invalid ? iso(last) : null,
      startIndex: ls.i,
      endIndex: rs.i,
    });
  }
  return null;
}

export function detectTripleBottom(bars: OHLCVBar[], swings: ReturnType<typeof collectAdaptiveSwings>): DetectedPattern | null {
  const { highs, lows, atr } = swings;
  if (lows.length < 3) return null;
  const l3 = lows.slice(-3);
  const [a, b, c] = l3;
  const mid = (a.price + b.price + c.price) / 3;
  const tol = Math.max(atr * 1.15, mid * 0.018);
  if (!near(a.price, b.price, tol) || !near(b.price, c.price, tol) || !near(a.price, c.price, tol)) return null;
  const peaks = highs.filter((h) => h.i > a.i && h.i < c.i);
  if (peaks.length < 2) return null;
  const resistance = Math.max(...peaks.map((p) => p.price));
  if (c.price < mid - tol * 1.15) return null;
  const pack = finalizeStatus(bars, c.i, resistance, "BULLISH", true, c.i - a.i, 90);
  const last = bars[bars.length - 1];
  const invalid = last.close < Math.min(a.price, b.price, c.price) - atr * 0.4;
  const breakIdx = bars.slice(c.i + 1).findIndex((bar) => bar.close > resistance);
  return makePattern(bars, {
    id: "triple_bottom",
    name: "Triple Bottom",
    bias: "BULLISH",
    family: "reversal",
    status: invalid ? "INVALIDATED" : pack.status,
    confidence: Math.round(60 + (pack.breakout?.candleClosedBeyondBoundary ? 14 : 4) + (pack.breakout?.volumeConfirmed ? 8 : 0) + 6),
    points: [point(bars, a, "Low 1"), point(bars, b, "Low 2"), point(bars, c, "Low 3"), ...peaks.slice(0, 2).map((p, idx) => point(bars, p, `Resistance ${idx + 1}`))],
    supportLevel: mid,
    resistanceLevel: resistance,
    neckline: resistance,
    breakoutLevel: resistance,
    breakoutCandle: breakIdx >= 0 ? candleAt(bars, c.i + 1 + breakIdx) : null,
    retestLevel: resistance,
    retestCandle: null,
    retestStatus: pack.retestStatus,
    breakout: pack.breakout,
    validation: [
      { label: "Three troughs", value: `${a.price.toFixed(2)} / ${b.price.toFixed(2)} / ${c.price.toFixed(2)}`, ok: true },
      { label: "Tolerance", value: `${tol.toFixed(2)}`, ok: true },
      { label: "Resistance", value: resistance.toFixed(2), ok: true },
      { label: "Close > resistance", value: pack.breakout?.candleClosedBeyondBoundary ? "Yes" : "No", ok: pack.breakout?.candleClosedBeyondBoundary ?? false },
    ],
    explanation: `Three comparable swing lows form a Triple Bottom. Resistance is the highest reaction high between the troughs. ${pack.breakout?.explanation || "Waiting for a close above resistance."}`,
    invalidation: `Decisive close below ${Math.min(a.price, b.price, c.price).toFixed(2)} before a confirmed upside breakout.`,
    wickNote: pack.wickNote,
    confirmedAt: pack.confirmedAt,
    invalidatedAt: invalid ? iso(last) : null,
    startIndex: a.i,
    endIndex: c.i,
  });
}

export function detectDiamondBottom(bars: OHLCVBar[], swings: ReturnType<typeof collectAdaptiveSwings>): DetectedPattern | null {
  const { highs, lows, atr } = swings;
  if (highs.length < 4 || lows.length < 4) return null;
  const hs = highs.slice(-4);
  const ls = lows.slice(-4);
  const widths = [0, 1, 2].map((i) => Math.abs((hs[i + 1]?.price ?? hs[i].price) - (ls[Math.min(i + 1, ls.length - 1)]?.price ?? ls[i].price)));
  const expand = widths[1] > widths[0] * 1.08;
  const contract = widths[2] < widths[1] * 0.92;
  const highsConverge = hs[3].price < hs[1].price + atr * 0.2;
  const lowsConverge = ls[3].price > ls[1].price - atr * 0.2;
  const trend = priorTrend(bars, hs[0].i, 16);
  if (!(expand && contract && highsConverge && lowsConverge)) return null;
  if (trend > atr * 1.2) return null;
  const upper = Math.max(hs[2].price, hs[3].price);
  const lower = Math.min(ls[2].price, ls[3].price);
  const pack = finalizeStatus(bars, Math.max(hs[3].i, ls[3].i), upper, "BULLISH", true, hs[3].i - hs[0].i, 100);
  const start = Math.min(hs[0].i, ls[0].i);
  const end = Math.max(hs[3].i, ls[3].i);
  const breakIdx = bars.slice(end + 1).findIndex((b) => b.close > upper);
  return makePattern(bars, {
    id: "diamond_bottom",
    name: "Diamond Bottom",
    bias: "BULLISH",
    family: "reversal",
    status: pack.status,
    confidence: Math.round(58 + (trend < 0 ? 8 : 0) + (pack.breakout?.candleClosedBeyondBoundary ? 12 : 3) + (pack.breakout?.volumeConfirmed ? 7 : 0)),
    points: [...hs.map((s, idx) => point(bars, s, `High ${idx + 1}`)), ...ls.map((s, idx) => point(bars, s, `Low ${idx + 1}`))],
    supportLevel: lower,
    resistanceLevel: upper,
    neckline: upper,
    breakoutLevel: upper,
    breakoutCandle: breakIdx >= 0 ? candleAt(bars, end + 1 + breakIdx) : null,
    retestLevel: upper,
    retestCandle: null,
    retestStatus: pack.retestStatus,
    breakout: pack.breakout,
    validation: [
      { label: "Prior trend", value: trend < 0 ? "Downtrend" : "Not down", ok: trend < 0 },
      { label: "Width expansion", value: "Yes", ok: expand },
      { label: "Width contraction", value: "Yes", ok: contract },
      { label: "Boundary convergence", value: "Yes", ok: highsConverge && lowsConverge },
      { label: "Swing points", value: String(hs.length + ls.length), ok: hs.length + ls.length >= 7 },
    ],
    explanation: `Swing width expands then contracts into converging boundaries, the geometry of a Diamond Bottom. ${pack.breakout?.explanation || "Waiting for a close above the upper boundary."}`,
    invalidation: `Loss of the converging diamond or a close below ${lower.toFixed(2)} before confirmation.`,
    wickNote: pack.wickNote,
    confirmedAt: pack.confirmedAt,
    invalidatedAt: null,
    startIndex: start,
    endIndex: end,
  });
}

export function detectInverseCupAndHandle(bars: OHLCVBar[], swings: ReturnType<typeof collectAdaptiveSwings>): DetectedPattern | null {
  const window = bars.slice(-48);
  if (window.length < 28) return null;
  const offset = bars.length - window.length;
  const atr = atrApprox(bars);
  const mid = Math.floor(window.length * 0.42);
  const leftRim = Math.min(...window.slice(0, 8).map((b) => b.low));
  const dome = Math.max(...window.slice(8, mid + 8).map((b) => b.high));
  const rightRim = Math.min(...window.slice(mid, -6).map((b) => b.low));
  const handleHigh = Math.max(...window.slice(-6).map((b) => b.high));
  const handleLow = Math.min(...window.slice(-6).map((b) => b.low));
  const prior = priorTrend(bars, offset + 8, 14);
  if (!(dome > leftRim + atr * 1.8 && near(leftRim, rightRim, atr * 1.5))) return null;
  if (handleHigh >= dome - atr * 0.15) return null;
  if (handleHigh - handleLow > (dome - Math.min(leftRim, rightRim)) * 0.55) return null;
  if (prior < atr * 0.4) return null;
  const support = Math.min(leftRim, rightRim);
  const after = bars.length - 7;
  const pack = finalizeStatus(bars, after, support, "BEARISH", true, window.length, 80);
  const leftI = offset + window.slice(0, 8).reduce((best, b, i, arr) => (b.low <= arr[best].low ? i : best), 0);
  const domeI = offset + 8 + window.slice(8, mid + 8).reduce((best, b, i, arr) => (b.high >= arr[best].high ? i : best), 0);
  const rightI = offset + mid + window.slice(mid, -6).reduce((best, b, i, arr) => (b.low <= arr[best].low ? i : best), 0);
  const breakIdx = bars.slice(after + 1).findIndex((b) => b.close < support);
  const failed = pack.breakout?.candleClosedBeyondBoundary && bars.slice(after + 1).some((b) => b.close > support);
  return makePattern(bars, {
    id: "inv_cup_handle",
    name: "Inverse Cup and Handle",
    bias: "BEARISH",
    family: "continuation",
    status: failed ? "FAILED" : pack.status === "BREAKOUT_PENDING" ? "FORMING" : pack.status,
    confidence: Math.round(56 + (pack.breakout?.candleClosedBeyondBoundary && !failed ? 14 : 0) + (pack.breakout?.volumeConfirmed ? 8 : 0) + 6),
    points: [
      { timestamp: iso(bars[leftI]), candleIndex: leftI, price: bars[leftI].low, type: "SWING_LOW", role: "Left Rim" },
      { timestamp: iso(bars[domeI]), candleIndex: domeI, price: bars[domeI].high, type: "SWING_HIGH", role: "Dome" },
      { timestamp: iso(bars[rightI]), candleIndex: rightI, price: bars[rightI].low, type: "SWING_LOW", role: "Right Rim" },
    ],
    supportLevel: support,
    resistanceLevel: dome,
    neckline: support,
    breakoutLevel: support,
    breakoutCandle: breakIdx >= 0 ? candleAt(bars, after + 1 + breakIdx) : null,
    retestLevel: support,
    retestCandle: null,
    retestStatus: pack.retestStatus,
    breakout: pack.breakout,
    validation: [
      { label: "Prior trend", value: "Uptrend", ok: prior > 0 },
      { label: "Rounded dome", value: "Yes", ok: true },
      { label: "Handle below dome", value: "Yes", ok: handleHigh < dome },
      { label: "Close < support", value: pack.breakout?.candleClosedBeyondBoundary ? "Yes" : "No", ok: pack.breakout?.candleClosedBeyondBoundary ?? false },
    ],
    explanation: `Rounded topping structure with a smaller countertrend handle. Confirmation requires a close through rim support, not the dome alone. ${pack.breakout?.explanation || ""}`.trim(),
    invalidation: `Close back above ${support.toFixed(2)} after breakdown, or a handle that exceeds the dome.`,
    wickNote: pack.wickNote,
    confirmedAt: pack.confirmedAt,
    invalidatedAt: failed ? iso(bars[bars.length - 1]) : null,
    startIndex: leftI,
    endIndex: bars.length - 1,
  });
}

function labeled(type: string, label: string, bias: PatternBias, explanation: string): Omit<MarketStructure, "conflict"> {
  return { type, label, bias, explanation };
}

export function analyzeMarketStructure(bars: OHLCVBar[], swings: ReturnType<typeof collectAdaptiveSwings>): Omit<MarketStructure, "conflict"> {
  const { highs, lows, atr } = swings;
  const h2 = highs.slice(-2);
  const l2 = lows.slice(-2);
  const l3 = lows.slice(-3);
  const h3 = highs.slice(-3);
  const threeTrough =
    l3.length === 3 &&
    near(l3[0].price, l3[1].price, atr * 1.3) &&
    near(l3[1].price, l3[2].price, atr * 1.3) &&
    highs.filter((h) => h.i > l3[0].i && h.i < l3[2].i).length >= 2;
  const threePeak =
    h3.length === 3 &&
    near(h3[0].price, h3[1].price, atr * 1.3) &&
    near(h3[1].price, h3[2].price, atr * 1.3) &&
    lows.filter((l) => l.i > h3[0].i && l.i < h3[2].i).length >= 2;
  const invHs =
    l3.length === 3 && l3[1].price < l3[0].price && l3[1].price < l3[2].price && near(l3[0].price, l3[2].price, atr * 1.8);
  const hs = h3.length === 3 && h3[1].price > h3[0].price && h3[1].price > h3[2].price && near(h3[0].price, h3[2].price, atr * 1.8);
  if (invHs) {
    return labeled("Three-Trough Reversal", "Three-Trough Reversal", "BULLISH", "The last three swing lows form a lower central trough with comparable shoulders.");
  }
  if (threeTrough) {
    return labeled("Three-Trough Support", "Three-Trough Support", "BULLISH", "Three comparable swing lows are holding a support zone.");
  }
  if (hs) {
    return labeled("Three-Peak Resistance", "Three-Peak Resistance", "BEARISH", "Three swing highs with a higher central peak define resistance.");
  }
  if (threePeak) {
    return labeled("Three-Peak Resistance", "Three-Peak Resistance", "BEARISH", "Three comparable swing highs are capping price.");
  }
  if (h2.length === 2 && l2.length === 2) {
    const hh = h2[1].price > h2[0].price;
    const hl = l2[1].price > l2[0].price;
    const lh = h2[1].price < h2[0].price;
    const ll = l2[1].price < l2[0].price;
    if (hh && hl) return labeled("HH + HL", "Higher High + Higher Low", "BULLISH", "Price is currently making higher highs and higher lows.");
    if (lh && ll) return labeled("LH + LL", "Lower High + Lower Low", "BEARISH", "Price is currently making lower highs and lower lows.");
    if (hh && ll) return labeled("HH + LL", "Higher High + Lower Low", "NEUTRAL", "Higher highs with lower lows show an expanding range, not a one-way trend.");
    if (lh && hl) return labeled("LH + HL", "Lower High + Higher Low", "NEUTRAL", "Lower highs with higher lows show compression rather than a finished trend.");
  }
  return labeled("Range", "Range-bound", "NEUTRAL", "Swing highs and lows do not yet define a directional market structure.");
}

function structureConflict(pattern: DetectedPattern | null, structure: Omit<MarketStructure, "conflict">): string | null {
  if (!pattern || pattern.bias === "NEUTRAL" || structure.bias === "NEUTRAL" || pattern.bias === structure.bias) return null;
  if (pattern.bias === "BEARISH" && structure.bias === "BULLISH") {
    return "Short-term price structure remains bullish, while the larger pattern is developing as a potential bearish reversal.";
  }
  return "Short-term price structure remains bearish, while the larger pattern is developing as a potential bullish reversal.";
}

function lastNum(values: Array<number | null>) {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

export function scorePatternSignal(
  pattern: DetectedPattern | null,
  structure: MarketStructure,
  bars: OHLCVBar[],
  mtfScore: number | null = null,
): PatternTradingSignal {
  if (!pattern) {
    return {
      direction: "NEUTRAL",
      action: bars.length < 20 ? "INSUFFICIENT_DATA" : "NO_TRADE",
      score: 0,
      factors: [],
      why: bars.length < 20 ? "Insufficient historical data to establish a reliable pattern signal." : "No reliable pattern detected.",
      entryStatus: "NO TRADE",
    };
  }
  const closes = bars.map((b) => b.close);
  const rsiLast = lastNum(rsi(closes, 14));
  const [macdLine, signalLine] = macd(closes);
  const macdLast = lastNum(macdLine);
  const macdSig = lastNum(signalLine);
  const ema20 = lastNum(ema(closes, 20));
  const ema50 = lastNum(ema(closes, 50));
  const last = bars[bars.length - 1].close;

  const quality = Math.max(0, Math.min(PATTERN_SIGNAL_WEIGHTS.quality, Math.round((pattern.confidence / 100) * PATTERN_SIGNAL_WEIGHTS.quality)));
  const structureScore =
    structure.bias === pattern.bias ? 13 : structure.bias === "NEUTRAL" ? 8 : 4;
  const br = pattern.breakout;
  const breakoutScore = !br ? 4 : br.candleClosedBeyondBoundary ? Math.min(20, 10 + Math.round(br.confirmationScore / 10)) : br.wickOnly ? 3 : 5;
  const volumeScore = br == null ? 3 : br.relativeVolume == null ? 0 : br.volumeConfirmed ? 9 : 4;
  const retestScore = pattern.retestStatus === "RETEST_HELD" ? 9 : pattern.retestStatus === "RETEST_PENDING" ? 4 : pattern.retestStatus === "RETEST_FAILED" ? 1 : 3;
  let momentum = 5;
  if (pattern.bias === "BULLISH") momentum = (rsiLast != null && rsiLast >= 50 ? 5 : 2) + (macdLast != null && macdSig != null && macdLast >= macdSig ? 5 : 2);
  if (pattern.bias === "BEARISH") momentum = (rsiLast != null && rsiLast <= 50 ? 5 : 2) + (macdLast != null && macdSig != null && macdLast <= macdSig ? 5 : 2);
  const trend =
    ema20 != null && ema50 != null
      ? pattern.bias === "BULLISH"
        ? last > ema20 && ema20 > ema50
          ? 9
          : 5
        : last < ema20 && ema20 < ema50
          ? 9
          : 5
      : 5;
  const mtf = mtfScore == null ? 2 : Math.max(0, Math.min(5, mtfScore));
  const factors: SignalFactor[] = [
    { name: "Pattern Quality", score: quality, max: 20, note: `${pattern.qualityBand} (${pattern.confidence}/100)` },
    { name: "Market Structure", score: structureScore, max: 15, note: structure.type },
    { name: "Breakout Confirmation", score: breakoutScore, max: 20, note: br?.explanation || "No breakout yet" },
    { name: "Volume", score: volumeScore, max: 10, note: br?.relativeVolume != null ? `${br.relativeVolume.toFixed(2)}x` : "Unavailable" },
    { name: "Retest", score: retestScore, max: 10, note: pattern.retestStatus },
    { name: "Momentum", score: momentum, max: 10, note: "Oscillator alignment with pattern bias" },
    { name: "Trend", score: trend, max: 10, note: "Average alignment with pattern bias" },
    { name: "MTF Alignment", score: mtf, max: 5, note: mtfScore == null ? "Single-timeframe view" : "Cross-timeframe" },
  ];
  const score = factors.reduce((s, f) => s + f.score, 0);
  const confirmed = pattern.status === "BREAKOUT_CONFIRMED" || pattern.status === "RETEST_PENDING" || pattern.status === "RETEST_CONFIRMED" || pattern.status === "COMPLETED";
  const volumeOk = br?.volumeConfirmed === true;
  const retestOk = pattern.retestStatus === "RETEST_HELD";
  let action: PatternTradingSignal["action"] = "WAIT";
  let entryStatus = "WAITING FOR BREAKOUT";
  if (pattern.status === "FAILED" || pattern.status === "INVALIDATED" || pattern.confidence < PATTERN_CONFIDENCE_MIN) {
    action = "NO_TRADE";
    entryStatus = "NO TRADE";
  } else if (!confirmed) {
    action = "WAIT";
    entryStatus = "WAITING FOR BREAKOUT";
  } else if (!volumeOk && !retestOk) {
    action = "WAIT";
    entryStatus = br?.relativeVolume == null ? "WAITING FOR VOLUME" : "WAITING FOR RETEST";
  } else if (score >= 70 && pattern.confidence >= 60) {
    action = pattern.bias === "BEARISH" ? "SELL" : pattern.bias === "BULLISH" ? "BUY" : "WAIT";
    entryStatus = "ENTRY AVAILABLE";
  } else {
    action = "WAIT";
    entryStatus = "WAITING FOR CONFIRMATION";
  }
  const direction = pattern.bias === "NEUTRAL" ? "NEUTRAL" : pattern.bias;
  const why =
    action === "WAIT" && confirmed && !retestOk
      ? "Breakout confirmed but retest has not yet occurred and volume confirmation is not sufficient for an entry."
      : action === "WAIT" && !confirmed
        ? "Pattern geometry is visible, but a closing breakout has not been validated."
        : action === "BUY" || action === "SELL"
          ? "Pattern quality, closing breakout, and supporting factors meet the configured entry rules."
          : action === "NO_TRADE"
            ? "The setup is invalidated, failed, or below the confidence threshold."
            : "Entry conditions are not complete.";
  return { direction, action, score, factors, why, entryStatus };
}

export function dedicatedDetections(bars: OHLCVBar[], swings: ReturnType<typeof collectAdaptiveSwings>): DetectedPattern[] {
  return [
    detectInverseHeadAndShoulders(bars, swings),
    detectHeadAndShoulders(bars, swings),
    detectTripleBottom(bars, swings),
    detectDiamondBottom(bars, swings),
    detectInverseCupAndHandle(bars, swings),
  ].filter((p): p is DetectedPattern => !!p && p.confidence >= PATTERN_CONFIDENCE_MIN);
}

export function analyzeChartPattern(bars: OHLCVBar[], evaluated = 50): PatternAnalysis {
  const dataQuality = assessPatternDataQuality(bars);
  if (!dataQuality.ok) {
    const structure = { type: "INSUFFICIENT DATA", label: "INSUFFICIENT DATA", bias: "NEUTRAL" as const, explanation: dataQuality.reason, conflict: null };
    return {
      primary: null,
      secondary: null,
      alternative: null,
      marketStructure: structure,
      signal: scorePatternSignal(null, structure, bars),
      dataQuality,
      evaluated,
    };
  }
  const swings = collectAdaptiveSwings(bars);
  const structureCore = analyzeMarketStructure(bars, swings);
  const dedicated = dedicatedDetections(bars, swings).sort((a, b) => b.confidence - a.confidence);
  const primary = dedicated[0] || null;
  const marketStructure: MarketStructure = {
    ...structureCore,
    conflict: structureConflict(primary, structureCore),
  };
  const signal = scorePatternSignal(primary, marketStructure, bars);
  return {
    primary,
    secondary: dedicated[1] || null,
    alternative: dedicated[2] || null,
    marketStructure,
    signal,
    dataQuality,
    evaluated,
  };
}

export function mtfAlignment(rows: Array<{ bias: PatternBias; status: string; pattern_name?: string }>) {
  const known = rows.filter((r) => {
    const named = r.pattern_name && r.pattern_name !== "Unavailable" && r.pattern_name !== "No reliable pattern detected";
    return named && r.bias !== "NEUTRAL";
  });
  if (known.length < 2) {
    return {
      status: "INSUFFICIENT" as const,
      explanation: "Insufficient historical data to establish reliable multi-timeframe alignment.",
    };
  }
  const bull = known.filter((r) => r.bias === "BULLISH").length;
  const bear = known.filter((r) => r.bias === "BEARISH").length;
  if (bull === known.length) {
    return { status: "ALIGNED" as const, explanation: "Daily, weekly, and monthly structures are directionally aligned." };
  }
  if (bear === known.length) {
    return { status: "ALIGNED" as const, explanation: "Daily, weekly, and monthly structures are directionally aligned." };
  }
  return {
    status: "MIXED" as const,
    explanation:
      "Short- and intermediate-term structure can disagree with the higher timeframe. Higher-timeframe confirmation is pending.",
  };
}

export function overviewDecisionFromSignal(signal: PatternTradingSignal) {
  if (signal.action === "BUY") return "BUY / ENTER" as const;
  if (signal.action === "SELL") return "SELL / ENTER" as const;
  if (signal.action === "NO_TRADE" || signal.action === "INSUFFICIENT_DATA") return "AVOID" as const;
  return "WAIT" as const;
}

export function tradeDecisionFromSignal(signal: PatternTradingSignal, style: "day" | "swing") {
  if (signal.action === "BUY" || signal.action === "SELL") return style === "swing" ? ("ENTER SWING TRADE" as const) : ("ENTER" as const);
  if (signal.action === "NO_TRADE" || signal.action === "INSUFFICIENT_DATA") return "AVOID / NO TRADE" as const;
  return "WAIT FOR BREAKOUT" as const;
}
