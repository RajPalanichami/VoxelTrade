import type { Frame, FrameRow, Num } from "@/src/lib/series";
import { diff, ewmAlpha, ewmSpan, lastNum, makeFrame, rollingStd, sma, utcDateKey, withColumns } from "@/src/lib/series";

export function ema(values: Num[], period: number): Num[] {
  return ewmSpan(values, period);
}

export function rsi(close: Num[], period = 14): Num[] {
  const delta = diff(close);
  const gain = delta.map((d) => (d === null ? null : Math.max(d, 0)));
  const loss = delta.map((d) => (d === null ? null : Math.max(-d, 0)));
  const avgGain = ewmAlpha(gain, 1 / period, period);
  const avgLoss = ewmAlpha(loss, 1 / period, period);
  return avgGain.map((g, i) => {
    const l = avgLoss[i];
    if (g === null || l === null) return null;
    if (l === 0) return g === 0 ? 0 : 100;
    if (g === 0) return 0;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  });
}

export function macd(close: Num[], fast = 12, slow = 26, signal = 9): [Num[], Num[], Num[]] {
  const fastEma = ema(close, fast);
  const slowEma = ema(close, slow);
  const macdLine = fastEma.map((a, i) => {
    const b = slowEma[i];
    if (a === null || b === null) return null;
    return a - b;
  });
  const dropped: number[] = [];
  const droppedIdx: number[] = [];
  macdLine.forEach((v, i) => {
    if (v !== null) {
      dropped.push(v);
      droppedIdx.push(i);
    }
  });
  const signalDropped = ema(dropped, signal);
  const signalLine: Num[] = new Array(macdLine.length).fill(null);
  droppedIdx.forEach((src, j) => {
    signalLine[src] = signalDropped[j] ?? null;
  });
  const hist = macdLine.map((m, i) => {
    const s = signalLine[i];
    if (m === null || s === null) return null;
    return m - s;
  });
  return [macdLine, signalLine, hist];
}

export function trueRange(high: Num[], low: Num[], close: Num[]): Num[] {
  const out: Num[] = [];
  for (let i = 0; i < high.length; i++) {
    const h = high[i];
    const l = low[i];
    const prev = i > 0 ? close[i - 1] : null;
    if (h === null || l === null) {
      out.push(null);
      continue;
    }
    const candidates = [h - l];
    if (prev !== null) {
      candidates.push(Math.abs(h - prev), Math.abs(l - prev));
    }
    out.push(Math.max(...candidates));
  }
  return out;
}

export function atr(high: Num[], low: Num[], close: Num[], period = 14): Num[] {
  return ewmAlpha(trueRange(high, low, close), 1 / period, period);
}

export function vwap(high: Num[], low: Num[], close: Num[], volume: Num[], timestamps?: Date[]): Num[] {
  const typical = high.map((h, i) => {
    const l = low[i];
    const c = close[i];
    if (h === null || l === null || c === null) return null;
    return (h + l + c) / 3;
  });
  if (!timestamps) {
    let cumPv = 0;
    let cumV = 0;
    return typical.map((t, i) => {
      const v = volume[i];
      if (t === null || v === null) return null;
      cumPv += t * v;
      cumV += v;
      return cumV === 0 ? null : cumPv / cumV;
    });
  }
  const sessionPv = new Map<string, number>();
  const sessionV = new Map<string, number>();
  return typical.map((t, i) => {
    const v = volume[i];
    if (t === null || v === null) return null;
    const key = utcDateKey(timestamps[i]);
    const pv = (sessionPv.get(key) || 0) + t * v;
    const vol = (sessionV.get(key) || 0) + v;
    sessionPv.set(key, pv);
    sessionV.set(key, vol);
    return vol === 0 ? null : pv / vol;
  });
}

export function bollinger(close: Num[], period = 20, stdev = 2): [Num[], Num[], Num[]] {
  const mid = sma(close, period);
  const sd = rollingStd(close, period);
  const upper = mid.map((m, i) => (m === null || sd[i] === null ? null : m + stdev * (sd[i] as number)));
  const lower = mid.map((m, i) => (m === null || sd[i] === null ? null : m - stdev * (sd[i] as number)));
  return [upper, mid, lower];
}

export function classicPivots(high: number, low: number, close: number): Record<string, number> {
  const pp = (high + low + close) / 3;
  return {
    pivot: pp,
    r1: 2 * pp - low,
    s1: 2 * pp - high,
    r2: pp + (high - low),
    s2: pp - (high - low),
    r3: high + 2 * (pp - low),
    s3: low - 2 * (high - pp),
  };
}

export function swingPoints(high: Num[], low: Num[], left = 3, right = 3): [Num[], Num[]] {
  const sh: Num[] = new Array(high.length).fill(null);
  const sl: Num[] = new Array(low.length).fill(null);
  for (let i = left; i < high.length - right; i++) {
    const windowH = high.slice(i - left, i + right + 1);
    const windowL = low.slice(i - left, i + right + 1);
    const h = high[i];
    const l = low[i];
    if (h !== null && windowH.every((x) => x === null || x <= h) && windowH.filter((x) => x === h).length === 1) {
      sh[i] = h;
    }
    if (l !== null && windowL.every((x) => x === null || x >= l) && windowL.filter((x) => x === l).length === 1) {
      sl[i] = l;
    }
  }
  return [sh, sl];
}

export function volumeProfileNodes(close: Num[], volume: Num[], bins = 24): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < close.length; i++) {
    const c = close[i];
    const v = volume[i];
    if (c === null) continue;
    pairs.push([c, v ?? 0]);
  }
  if (!pairs.length) return [];
  const min = Math.min(...pairs.map((p) => p[0]));
  const max = Math.max(...pairs.map((p) => p[0]));
  if (min === max) return [];
  const counts = new Array(bins).fill(0);
  const width = (max - min) / bins;
  for (const [c, v] of pairs) {
    let idx = Math.floor((c - min) / width);
    if (idx >= bins) idx = bins - 1;
    counts[idx] += v;
  }
  const nodes: [number, number][] = [];
  for (let i = 0; i < bins; i++) {
    if (counts[i] > 0) {
      nodes.push([min + (i + 0.5) * width, counts[i]]);
    }
  }
  nodes.sort((a, b) => b[1] - a[1]);
  return nodes;
}

export function slope(series: Num[], lookback = 3): number | null {
  const s = series.filter((v) => v !== null) as number[];
  if (s.length < lookback + 1) return null;
  const a = s[s.length - 1];
  const b = s[s.length - 1 - lookback];
  if (b === 0) return 0;
  return (a - b) / Math.abs(b);
}

export function last(series: Num[] | null | undefined): number | null {
  if (!series) return null;
  return lastNum(series);
}

export function structureFlags(high: Num[], low: Num[], lookback = 20): {
  higher_highs: boolean;
  higher_lows: boolean;
  lower_highs: boolean;
  lower_lows: boolean;
} {
  const h = high.filter((v) => v !== null) as number[];
  const l = low.filter((v) => v !== null) as number[];
  if (h.length < lookback || l.length < lookback) {
    return { higher_highs: false, higher_lows: false, lower_highs: false, lower_lows: false };
  }
  const mid = Math.floor(lookback / 2);
  const h1 = Math.max(...h.slice(-lookback, -mid || undefined));
  const h2 = Math.max(...h.slice(-mid));
  const l1 = Math.min(...l.slice(-lookback, -mid || undefined));
  const l2 = Math.min(...l.slice(-mid));
  return {
    higher_highs: h2 > h1,
    higher_lows: l2 > l1,
    lower_highs: h2 < h1,
    lower_lows: l2 < l1,
  };
}

export function computeAll(frame: Frame): Frame {
  const c = frame.get("close");
  const h = frame.get("high");
  const l = frame.get("low");
  const v = frame.get("volume");
  const ts = frame.timestamps();
  const cols: Record<string, Num[]> = {};
  for (const p of [9, 20, 21, 50, 200]) {
    cols[`ema${p}`] = ema(c, p);
  }
  cols.rsi = rsi(c, 14);
  const [macdLine, sig, hist] = macd(c, 12, 26, 9);
  cols.macd = macdLine;
  cols.macd_signal = sig;
  cols.macd_hist = hist;
  cols.atr = atr(h, l, c, 14);
  cols.vwap = vwap(h, l, c, v, ts);
  const [bbU, bbM, bbL] = bollinger(c, 20, 2);
  cols.bb_upper = bbU;
  cols.bb_mid = bbM;
  cols.bb_lower = bbL;
  cols.volume_sma20 = sma(v, 20);
  cols.volume_ratio = v.map((vol, i) => {
    const avg = cols.volume_sma20[i];
    if (vol === null || avg === null || avg === 0) return null;
    return vol / avg;
  });
  return withColumns(frame, cols);
}

export function barsToFrame(
  bars: { timestamp: Date; open: number; high: number; low: number; close: number; volume: number }[],
): Frame {
  const rows: FrameRow[] = bars.map((b) => ({
    timestamp: b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
  return makeFrame(rows);
}
