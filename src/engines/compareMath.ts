import { lastNum, type Num, sma, ewmSpan } from "@/src/lib/series";
import { atr, ema, rsi, trueRange } from "@/src/engines/indicators";

export function lastVal(xs: Num[]) {
  return lastNum(xs);
}

export function ret(close: number[], bars: number) {
  if (close.length <= bars) return null;
  const a = close[close.length - 1];
  const b = close[close.length - 1 - bars];
  if (!(b > 0)) return null;
  return ((a - b) / b) * 100;
}

export function ytdReturn(closes: number[], stamps: Date[]) {
  if (!closes.length) return null;
  const year = stamps[stamps.length - 1].getUTCFullYear();
  let base: number | null = null;
  for (let i = 0; i < stamps.length; i++) {
    if (stamps[i].getUTCFullYear() === year) {
      base = closes[i];
      break;
    }
  }
  const last = closes[closes.length - 1];
  if (base == null || !(base > 0)) return null;
  return ((last - base) / base) * 100;
}

export function stoch(high: number[], low: number[], close: number[], period = 14, smooth = 3) {
  const k: Num[] = close.map((_, i) => {
    if (i + 1 < period) return null;
    const hh = Math.max(...high.slice(i + 1 - period, i + 1));
    const ll = Math.min(...low.slice(i + 1 - period, i + 1));
    if (hh === ll) return 50;
    return ((close[i] - ll) / (hh - ll)) * 100;
  });
  const d = sma(k, smooth);
  return { k, d };
}

export function williamsR(high: number[], low: number[], close: number[], period = 14): Num[] {
  return close.map((_, i) => {
    if (i + 1 < period) return null;
    const hh = Math.max(...high.slice(i + 1 - period, i + 1));
    const ll = Math.min(...low.slice(i + 1 - period, i + 1));
    if (hh === ll) return -50;
    return ((hh - close[i]) / (hh - ll)) * -100;
  });
}

export function cci(high: number[], low: number[], close: number[], period = 20): Num[] {
  const tp = close.map((c, i) => (high[i] + low[i] + c) / 3);
  const mid = sma(tp, period);
  return tp.map((t, i) => {
    const m = mid[i];
    if (m == null || i + 1 < period) return null;
    const slice = tp.slice(i + 1 - period, i + 1);
    const meanDev = slice.reduce((s, x) => s + Math.abs(x - m), 0) / period;
    if (meanDev === 0) return 0;
    return (t - m) / (0.015 * meanDev);
  });
}

export function roc(close: number[], period = 12): Num[] {
  return close.map((c, i) => {
    if (i < period || !(close[i - period] > 0)) return null;
    return ((c - close[i - period]) / close[i - period]) * 100;
  });
}

export function momentum(close: number[], period = 10): Num[] {
  return close.map((c, i) => (i < period ? null : c - close[i - period]));
}

export function awesomeOsc(high: number[], low: number[]): Num[] {
  const mid = high.map((h, i) => (h + low[i]) / 2);
  const f = sma(mid, 5);
  const s = sma(mid, 34);
  return f.map((a, i) => (a == null || s[i] == null ? null : a - (s[i] as number)));
}

export function trix(close: number[], period = 15): Num[] {
  const e1 = ema(close, period);
  const e2 = ema(e1, period);
  const e3 = ema(e2, period);
  return e3.map((v, i) => {
    const prev = i > 0 ? e3[i - 1] : null;
    if (v == null || prev == null || prev === 0) return null;
    return ((v - prev) / Math.abs(prev)) * 100;
  });
}

export function ppo(close: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(close, fast);
  const s = ema(close, slow);
  const line = f.map((a, i) => {
    const b = s[i];
    if (a == null || b == null || b === 0) return null;
    return ((a - b) / Math.abs(b)) * 100;
  });
  return { line, signal: ema(line, signal) };
}

export function ultimateOsc(high: number[], low: number[], close: number[]): Num[] {
  const bp: Num[] = [];
  const tr: Num[] = [];
  for (let i = 0; i < close.length; i++) {
    const prev = i > 0 ? close[i - 1] : close[i];
    const minLow = Math.min(low[i], prev);
    bp.push(close[i] - minLow);
    tr.push(Math.max(high[i], prev) - minLow);
  }
  const avg = (n: number, i: number) => {
    if (i + 1 < n) return null;
    let a = 0;
    let b = 0;
    for (let k = i + 1 - n; k <= i; k++) {
      a += bp[k] as number;
      b += tr[k] as number;
    }
    return b === 0 ? null : a / b;
  };
  return close.map((_, i) => {
    const a7 = avg(7, i);
    const a14 = avg(14, i);
    const a28 = avg(28, i);
    if (a7 == null || a14 == null || a28 == null) return null;
    return 100 * ((4 * a7 + 2 * a14 + a28) / 7);
  });
}

export function dmi(high: number[], low: number[], close: number[], period = 14) {
  const plusDM: Num[] = [null];
  const minusDM: Num[] = [null];
  for (let i = 1; i < close.length; i++) {
    const up = high[i] - high[i - 1];
    const down = low[i - 1] - low[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const tr = trueRange(high, low, close);
  const atrS = atr(high, low, close, period);
  const pdi = plusDM.map((v, i) => {
    const a = atrS[i];
    if (v == null || a == null || a === 0) return null;
    return (100 * (ewmSpan(plusDM, period)[i] as number | null)! ) / a;
  });
  const smoothedP = ewmSpan(plusDM, period);
  const smoothedM = ewmSpan(minusDM, period);
  const plus = smoothedP.map((v, i) => {
    const a = atrS[i];
    if (v == null || a == null || a === 0) return null;
    return (100 * v) / a;
  });
  const minus = smoothedM.map((v, i) => {
    const a = atrS[i];
    if (v == null || a == null || a === 0) return null;
    return (100 * v) / a;
  });
  const dx = plus.map((p, i) => {
    const m = minus[i];
    if (p == null || m == null || p + m === 0) return null;
    return (100 * Math.abs(p - m)) / (p + m);
  });
  const adx = ewmSpan(dx, period);
  const adxr = adx.map((v, i) => {
    const prev = i >= period ? adx[i - period] : null;
    if (v == null || prev == null) return null;
    return (v + prev) / 2;
  });
  void pdi;
  void tr;
  return { plus, minus, adx, adxr };
}

export function keltner(high: number[], low: number[], close: number[], period = 20, atrMult = 1.5) {
  const mid = ema(close, period);
  const a = atr(high, low, close, period);
  const upper = mid.map((m, i) => (m == null || a[i] == null ? null : m + atrMult * (a[i] as number)));
  const lower = mid.map((m, i) => (m == null || a[i] == null ? null : m - atrMult * (a[i] as number)));
  return { upper, mid, lower };
}

export function donchian(high: number[], low: number[], period = 20) {
  const upper: Num[] = high.map((_, i) => (i + 1 < period ? null : Math.max(...high.slice(i + 1 - period, i + 1))));
  const lower: Num[] = low.map((_, i) => (i + 1 < period ? null : Math.min(...low.slice(i + 1 - period, i + 1))));
  const mid = upper.map((u, i) => (u == null || lower[i] == null ? null : (u + (lower[i] as number)) / 2));
  return { upper, mid, lower };
}

export function choppiness(high: number[], low: number[], close: number[], period = 14): Num[] {
  const tr = trueRange(high, low, close);
  return close.map((_, i) => {
    if (i + 1 < period) return null;
    const sum = (tr.slice(i + 1 - period, i + 1) as number[]).reduce((s, x) => s + (x || 0), 0);
    const hh = Math.max(...high.slice(i + 1 - period, i + 1));
    const ll = Math.min(...low.slice(i + 1 - period, i + 1));
    if (hh === ll || sum === 0) return null;
    return (100 * Math.log10(sum / (hh - ll))) / Math.log10(period);
  });
}

export function obv(close: number[], volume: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < close.length; i++) {
    if (i === 0) acc = volume[i] || 0;
    else if (close[i] > close[i - 1]) acc += volume[i] || 0;
    else if (close[i] < close[i - 1]) acc -= volume[i] || 0;
    out.push(acc);
  }
  return out;
}

export function cmf(high: number[], low: number[], close: number[], volume: number[], period = 20): Num[] {
  const mfv = close.map((c, i) => {
    const h = high[i];
    const l = low[i];
    if (h === l) return 0;
    return ((c - l - (h - c)) / (h - l)) * (volume[i] || 0);
  });
  return mfv.map((_, i) => {
    if (i + 1 < period) return null;
    const num = mfv.slice(i + 1 - period, i + 1).reduce((s, x) => s + x, 0);
    const den = volume.slice(i + 1 - period, i + 1).reduce((s, x) => s + x, 0);
    return den === 0 ? null : num / den;
  });
}

export function mfi(high: number[], low: number[], close: number[], volume: number[], period = 14): Num[] {
  const tp = close.map((c, i) => (high[i] + low[i] + c) / 3);
  return tp.map((_, i) => {
    if (i < period) return null;
    let pos = 0;
    let neg = 0;
    for (let k = i - period + 1; k <= i; k++) {
      const raw = tp[k] * (volume[k] || 0);
      if (k > 0 && tp[k] > tp[k - 1]) pos += raw;
      else if (k > 0 && tp[k] < tp[k - 1]) neg += raw;
    }
    if (neg === 0) return 100;
    const mr = pos / neg;
    return 100 - 100 / (1 + mr);
  });
}

export function accDist(high: number[], low: number[], close: number[], volume: number[]) {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < close.length; i++) {
    const h = high[i];
    const l = low[i];
    const clv = h === l ? 0 : (close[i] - l - (h - close[i])) / (h - l);
    acc += clv * (volume[i] || 0);
    out.push(acc);
  }
  return out;
}

export function forceIndex(close: number[], volume: number[], period = 13): Num[] {
  const raw: Num[] = close.map((c, i) => (i === 0 ? null : (c - close[i - 1]) * (volume[i] || 0)));
  return ewmSpan(raw, period);
}

export function easeOfMovement(high: number[], low: number[], volume: number[], period = 14): Num[] {
  const raw: Num[] = high.map((h, i) => {
    if (i === 0) return null;
    const dist = (h + low[i]) / 2 - (high[i - 1] + low[i - 1]) / 2;
    const box = volume[i] && h !== low[i] ? volume[i] / (h - low[i]) : 0;
    return box === 0 ? 0 : dist / box;
  });
  return sma(raw, period);
}

export function volumeOsc(volume: number[], fast = 5, slow = 10): Num[] {
  const f = sma(volume, fast);
  const s = sma(volume, slow);
  return f.map((a, i) => {
    const b = s[i];
    if (a == null || b == null || b === 0) return null;
    return ((a - b) / Math.abs(b)) * 100;
  });
}

export function hv(close: number[], period = 20): Num[] {
  const rets: Num[] = close.map((c, i) => (i === 0 || !(close[i - 1] > 0) ? null : Math.log(c / close[i - 1])));
  const out: Num[] = [];
  for (let i = 0; i < rets.length; i++) {
    if (i + 1 < period) {
      out.push(null);
      continue;
    }
    const slice = rets.slice(i + 1 - period, i + 1).filter((x): x is number => x != null);
    if (slice.length < period - 1) {
      out.push(null);
      continue;
    }
    const mean = slice.reduce((s, x) => s + x, 0) / slice.length;
    const varc = slice.reduce((s, x) => s + (x - mean) ** 2, 0) / slice.length;
    out.push(Math.sqrt(varc) * Math.sqrt(252) * 100);
  }
  return out;
}

export function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 8) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = x[i] - mx;
    const ay = y[i] - my;
    num += ax * ay;
    dx += ax * ax;
    dy += ay * ay;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function rollingCorrelation(a: number[], b: number[], period = 20) {
  const n = Math.min(a.length, b.length);
  if (n < period) return pearson(a, b);
  return pearson(a.slice(-period), b.slice(-period));
}

export function betaOf(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 8) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const my = y.reduce((s, v) => s + v, 0) / n;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varb = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    varb += (y[i] - my) ** 2;
  }
  if (varb === 0) return null;
  return cov / varb;
}
