export type Num = number | null;

export function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function lastNum(values: Num[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (isNum(v)) return v;
  }
  return null;
}

export function dropna(values: Num[]): number[] {
  return values.filter(isNum);
}

/** pandas ewm(span, adjust=False, min_periods=span) */
export function ewmSpan(values: Num[], period: number): Num[] {
  const alpha = 2 / (period + 1);
  return ewmAlpha(values, alpha, period);
}

/** pandas ewm(alpha, adjust=False, min_periods) */
export function ewmAlpha(values: Num[], alpha: number, minPeriods: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let prev: number | null = null;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!isNum(x)) {
      out[i] = null;
      continue;
    }
    prev = prev === null ? x : alpha * x + (1 - alpha) * prev;
    count += 1;
    out[i] = count >= minPeriods ? prev : null;
  }
  return out;
}

export function sma(values: Num[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let sum = 0;
  let n = 0;
  const window: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!isNum(x)) {
      out[i] = null;
      continue;
    }
    window.push(x);
    sum += x;
    n += 1;
    if (window.length > period) {
      sum -= window.shift() as number;
      n -= 1;
    }
    out[i] = window.length >= period ? sum / period : null;
  }
  return out;
}

export function rollingStd(values: Num[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  const window: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!isNum(x)) {
      out[i] = null;
      continue;
    }
    window.push(x);
    if (window.length > period) window.shift();
    if (window.length < period) {
      out[i] = null;
      continue;
    }
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

export function diff(values: Num[]): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!isNum(x)) {
      out[i] = null;
      continue;
    }
    out[i] = prev === null ? null : x - prev;
    prev = x;
  }
  return out;
}

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface FrameRow {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  [key: string]: number | Date | null | undefined;
}

export interface Frame {
  rows: FrameRow[];
  empty: boolean;
  get(col: string): Num[];
  timestamps(): Date[];
  slice(start: number, end?: number): Frame;
  tail(n: number): Frame;
  filterByTime(start: Date, end: Date): Frame;
  filterTo(end: Date): Frame;
}

export function makeFrame(rows: FrameRow[]): Frame {
  const sorted = [...rows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const unique: FrameRow[] = [];
  const seen = new Set<number>();
  for (const row of sorted) {
    const t = row.timestamp.getTime();
    if (seen.has(t)) continue;
    seen.add(t);
    unique.push(row);
  }
  return {
    rows: unique,
    empty: unique.length === 0,
    get(col: string) {
      return unique.map((r) => {
        const v = r[col];
        if (v instanceof Date) return null;
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      });
    },
    timestamps() {
      return unique.map((r) => r.timestamp);
    },
    slice(start, end) {
      return makeFrame(unique.slice(start, end));
    },
    tail(n) {
      return makeFrame(unique.slice(-n));
    },
    filterByTime(start, end) {
      return makeFrame(unique.filter((r) => r.timestamp >= start && r.timestamp < end));
    },
    filterTo(end) {
      return makeFrame(unique.filter((r) => r.timestamp <= end));
    },
  };
}

export function withColumns(frame: Frame, cols: Record<string, Num[]>): Frame {
  const rows = frame.rows.map((row, i) => {
    const next: FrameRow = { ...row };
    for (const [k, series] of Object.entries(cols)) {
      next[k] = series[i] ?? null;
    }
    return next;
  });
  return makeFrame(rows);
}

export function resampleOhlcv(frame: Frame, rule: "4h" | "15min" | "W-FRI"): Frame {
  if (frame.empty) return frame;
  const buckets = new Map<number, FrameRow[]>();
  for (const row of frame.rows) {
    const t = row.timestamp.getTime();
    let key: number;
    if (rule === "4h") {
      const d = new Date(t);
      const hours = d.getUTCHours();
      const bucketHour = Math.floor(hours / 4) * 4 + 4;
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), bucketHour, 0, 0, 0));
      key = end.getTime();
    } else if (rule === "15min") {
      const d = new Date(t);
      const minutes = d.getUTCMinutes();
      const bucketMin = Math.floor(minutes / 15) * 15 + 15;
      const end = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0),
      );
      end.setUTCMinutes(bucketMin);
      key = end.getTime();
    } else {
      const d = new Date(t);
      const day = d.getUTCDay();
      const daysToFriday = (5 - day + 7) % 7;
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysToFriday, 23, 59, 59, 0));
      key = end.getTime();
    }
    const list = buckets.get(key) || [];
    list.push(row);
    buckets.set(key, list);
  }
  const rows: FrameRow[] = [];
  for (const [key, list] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (!list.length) continue;
    rows.push({
      timestamp: new Date(key),
      open: list[0].open,
      high: Math.max(...list.map((r) => r.high)),
      low: Math.min(...list.map((r) => r.low)),
      close: list[list.length - 1].close,
      volume: list.reduce((s, r) => s + r.volume, 0),
    });
  }
  return makeFrame(rows);
}

export function searchSorted(timestamps: Date[], target: Date): number {
  let lo = 0;
  let hi = timestamps.length;
  const t = target.getTime();
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid].getTime() < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
