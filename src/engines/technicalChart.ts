/**
 * Deterministic technical-chart calculations.
 *
 * EMA initialization matches the app's existing recursive EMA:
 * EMA(t) = α × Close(t) + (1 − α) × EMA(t − 1), α = 2 / (N + 1).
 * The first close seeds EMA. Values stay hidden until N closes exist
 * (pandas ewm adjust=False, min_periods=span). Missing candles are not
 * filled; a rejected candle is dropped and the next valid close continues
 * the recursion.
 *
 * Swing confirmation uses left=3 and right=3. A pivot at index i is labeled
 * only after i+right exists, so future bars beyond the confirmation window
 * are not used and the point is not labeled early.
 *
 * Support/resistance tolerance is the larger of 0.15% of price and 35% of
 * the average high-low range of the last 14 candles. That groups nearby
 * reactions into a zone. Reaction count is evidence, not a probability.
 *
 * Fibonacci 0% sits at the end of the swing (the high of an upward swing,
 * the low of a downward swing). These are retracements, not extensions.
 *
 * Daily equity gaps use the previous bar's high and low as the previous
 * session extreme. Intraday and 24-hour markets do not get gap analysis.
 * A gap is fully filled when a later candle trades through the opposite edge.
 *
 * Trendline breakouts use completed candles only. A still-forming candle can
 * set BREAKOUT_PENDING and cannot confirm a breakout.
 */

export const EMA_DEFAULTS = [9, 21, 50, 100, 200, 325] as const;
export const SWING_LEFT = 3;
export const SWING_RIGHT = 3;
export const VOLUME_WINDOW = 20;
export const EMA_SLOPE_LOOKBACK = 3;
export const EMA_FLAT_FRACTION = 0.0005;

export const FIB_RATIOS = [
  { ratio: 0, label: "0%" },
  { ratio: 0.236, label: "23.6%" },
  { ratio: 0.382, label: "38.2%" },
  { ratio: 0.5, label: "50%" },
  { ratio: 0.618, label: "61.8%" },
  { ratio: 0.786, label: "78.6%" },
  { ratio: 1, label: "100%" },
] as const;

export const CHART_TIMEFRAMES = [
  { id: "1m", label: "1m", enabled: false, reason: "1-minute history is not available from the configured market-data provider." },
  { id: "5m", label: "5m", enabled: true, seconds: 300 },
  { id: "15m", label: "15m", enabled: true, seconds: 900 },
  { id: "30m", label: "30m", enabled: true, seconds: 1800 },
  { id: "1h", label: "1h", enabled: true, seconds: 3600 },
  { id: "4h", label: "4h", enabled: true, seconds: 14400 },
  { id: "1d", label: "1D", enabled: true, seconds: 86400 },
  { id: "1w", label: "1W", enabled: true, seconds: 604800 },
  { id: "1M", label: "1M", enabled: false, reason: "Monthly candles are not available from the configured market-data provider." },
] as const;

export type ChartTimeframeId = (typeof CHART_TIMEFRAMES)[number]["id"];
export type EnabledChartTimeframe = Extract<(typeof CHART_TIMEFRAMES)[number], { enabled: true }>["id"];

const ENABLED = new Set<string>(CHART_TIMEFRAMES.filter((item) => item.enabled).map((item) => item.id));

export function normalizeChartTimeframe(value: string): EnabledChartTimeframe {
  const raw = value.trim();
  if (raw === "1M" || raw.toLowerCase() === "1m") {
    throw new Error("That timeframe is not available from the configured market-data provider.");
  }
  const id = raw.toLowerCase();
  if (!ENABLED.has(id)) {
    throw new Error(`Unsupported timeframe '${value}'. Use: ${[...ENABLED].join(", ")}.`);
  }
  return id as EnabledChartTimeframe;
}

export function chartBarSeconds(timeframe: string): number {
  const found = CHART_TIMEFRAMES.find((item) => item.id === timeframe && item.enabled);
  return found && "seconds" in found ? found.seconds : 86400;
}

export function chartCacheKey(symbol: string, timeframe: string, settings: string) {
  return `technical-chart:${symbol.trim().toUpperCase()}:${timeframe}:${settings}`;
}

export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export function normalizeRawBars(raw: unknown): { candles: ChartCandle[]; dropped: number } {
  const rows = Array.isArray(raw) ? raw : [];
  const parsed: ChartCandle[] = [];
  let dropped = 0;
  for (const row of rows) {
    const candle = coerceCandle(row);
    if (!candle) {
      dropped += 1;
      continue;
    }
    parsed.push(candle);
  }
  parsed.sort((a, b) => a.time - b.time);
  const candles: ChartCandle[] = [];
  for (const candle of parsed) {
    const previous = candles[candles.length - 1];
    if (previous && previous.time === candle.time) candles[candles.length - 1] = candle;
    else candles.push(candle);
  }
  return { candles, dropped };
}

function coerceCandle(row: unknown): ChartCandle | null {
  if (!row || typeof row !== "object") return null;
  const item = row as Record<string, unknown>;
  const time = coerceTime(item.time ?? item.timestamp);
  const open = num(item.open);
  const high = num(item.high);
  const low = num(item.low);
  const close = num(item.close);
  const volume = num(item.volume);
  if (time == null || open == null || high == null || low == null || close == null) return null;
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
  if (high < open || high < close || high < low) return null;
  if (low > open || low > close || low > high) return null;
  return { time, open, high, low, close, volume: volume != null && volume >= 0 ? volume : null };
}

function coerceTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return Math.floor(value.getTime() / 1000);
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function missingIntervalCount(candles: ChartCandle[], barSeconds: number): number {
  if (barSeconds <= 0 || candles.length < 2) return 0;
  let missing = 0;
  for (let i = 1; i < candles.length; i++) {
    const gap = candles[i].time - candles[i - 1].time;
    if (gap > barSeconds * 1.5) missing += Math.max(0, Math.round(gap / barSeconds) - 1);
  }
  return missing;
}

export function emaSeries(closes: number[], period: number): (number | null)[] {
  if (!Number.isInteger(period) || period < 1) return closes.map(() => null);
  const alpha = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  let count = 0;
  for (const close of closes) {
    if (!Number.isFinite(close)) {
      out.push(null);
      continue;
    }
    prev = prev === null ? close : alpha * close + (1 - alpha) * prev;
    count += 1;
    out.push(count >= period ? prev : null);
  }
  return out;
}

export type EmaSlope = "rising" | "falling" | "flat";

export type EmaReading = {
  period: number;
  value: number | null;
  slope: EmaSlope | "insufficient";
  priceRelation: "above" | "below" | "insufficient";
  series: (number | null)[];
};

export function crossoverAt(fast: (number | null)[], slow: (number | null)[], index: number): "bullish" | "bearish" | "none" | "insufficient" {
  const previous = index - 1;
  if (previous < 0) return "insufficient";
  const beforeFast = fast[previous];
  const beforeSlow = slow[previous];
  const afterFast = fast[index];
  const afterSlow = slow[index];
  if (beforeFast == null || beforeSlow == null || afterFast == null || afterSlow == null) return "insufficient";
  const before = beforeFast - beforeSlow;
  const after = afterFast - afterSlow;
  if (before <= 0 && after > 0) return "bullish";
  if (before >= 0 && after < 0) return "bearish";
  return "none";
}

export function readEmas(closes: number[], periods: number[], price: number | null): EmaReading[] {
  return periods.map((period) => {
    const series = emaSeries(closes, period);
    const value = lastNumber(series);
    const earlier = nthLastNumber(series, EMA_SLOPE_LOOKBACK);
    let slope: EmaReading["slope"] = "insufficient";
    if (value != null && earlier != null && price != null && price > 0) {
      const delta = (value - earlier) / price;
      slope = Math.abs(delta) < EMA_FLAT_FRACTION ? "flat" : value > earlier ? "rising" : "falling";
    }
    const priceRelation = value == null || price == null ? "insufficient" : price >= value ? "above" : "below";
    return { period, value, slope, priceRelation, series };
  });
}

export type SwingPoint = {
  index: number;
  time: number;
  price: number;
  kind: "high" | "low";
  confirmed: true;
  confirmationTime: number;
  left: number;
  right: number;
};

export function confirmedSwings(candles: ChartCandle[], left = SWING_LEFT, right = SWING_RIGHT): SwingPoint[] {
  const points: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    let uniqueHigh = true;
    let uniqueLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high > high) uniqueHigh = false;
      if (candles[j].high === high) uniqueHigh = false;
      if (candles[j].low < low) uniqueLow = false;
      if (candles[j].low === low) uniqueLow = false;
    }
    if (uniqueHigh) {
      points.push({
        index: i,
        time: candles[i].time,
        price: high,
        kind: "high",
        confirmed: true,
        confirmationTime: candles[i + right].time,
        left,
        right,
      });
    }
    if (uniqueLow) {
      points.push({
        index: i,
        time: candles[i].time,
        price: low,
        kind: "low",
        confirmed: true,
        confirmationTime: candles[i + right].time,
        left,
        right,
      });
    }
  }
  return points;
}

export type StructureLabel = "HH" | "HL" | "LH" | "LL" | "insufficient";
export type StructureTrend = "up" | "down" | "mixed" | "insufficient";

export function marketStructure(swings: SwingPoint[]): {
  trend: StructureTrend;
  highLabel: StructureLabel;
  lowLabel: StructureLabel;
  reversalConfirmed: boolean;
  reversalRule: string;
} {
  const highs = swings.filter((point) => point.kind === "high");
  const lows = swings.filter((point) => point.kind === "low");
  const highLabel = pairLabel(highs, "HH", "LH");
  const lowLabel = pairLabel(lows, "HL", "LL");
  const reversalRule =
    "A reversal is confirmed only when the latest two swing highs and the latest two swing lows both flip together (higher-high plus higher-low becomes lower-high plus lower-low, or the reverse). One candle is not a reversal.";
  if (highs.length < 2 || lows.length < 2) {
    return { trend: "insufficient", highLabel, lowLabel, reversalConfirmed: false, reversalRule };
  }
  const trend: StructureTrend =
    highLabel === "HH" && lowLabel === "HL" ? "up" : highLabel === "LH" && lowLabel === "LL" ? "down" : "mixed";
  const priorHigh = pairLabel(highs.slice(0, -1), "HH", "LH");
  const priorLow = pairLabel(lows.slice(0, -1), "HL", "LL");
  const priorUp = priorHigh === "HH" && priorLow === "HL";
  const priorDown = priorHigh === "LH" && priorLow === "LL";
  const reversalConfirmed = (priorUp && trend === "down") || (priorDown && trend === "up");
  return { trend, highLabel, lowLabel, reversalConfirmed, reversalRule };
}

function pairLabel(points: SwingPoint[], up: StructureLabel, down: StructureLabel): StructureLabel {
  if (points.length < 2) return "insufficient";
  const previous = points[points.length - 2].price;
  const latest = points[points.length - 1].price;
  if (latest === previous) return "insufficient";
  return latest > previous ? up : down;
}

export type PriceZone = {
  id: string;
  low: number;
  high: number;
  kind: "support" | "resistance";
  role: "active" | "broken-support" | "broken-resistance";
  reactions: number;
  recencyBars: number;
  sources: string[];
  distancePct: number;
  established: boolean;
  timeframe: string;
};

export function averageRange(candles: ChartCandle[], window = 14): number {
  const sample = candles.slice(-window);
  if (!sample.length) return 0;
  return sample.reduce((sum, candle) => sum + (candle.high - candle.low), 0) / sample.length;
}

export function clusterLevels(
  candles: ChartCandle[],
  swings: SwingPoint[],
  timeframe: string,
  price: number,
): PriceZone[] {
  if (!candles.length || !(price > 0)) return [];
  const tolerance = Math.max(price * 0.0015, averageRange(candles) * 0.35);
  const candidates: { price: number; kind: "support" | "resistance"; source: string; index: number }[] = [];
  for (const swing of swings) {
    candidates.push({
      price: swing.price,
      kind: swing.kind === "high" ? "resistance" : "support",
      source: swing.kind === "high" ? "Confirmed swing high" : "Confirmed swing low",
      index: swing.index,
    });
  }
  if (timeframe === "1d" || timeframe === "1w") {
    const previous = candles.length > 1 ? candles[candles.length - 2] : null;
    if (previous) {
      const label = timeframe === "1d" ? "Previous session" : "Previous week";
      candidates.push({ price: previous.high, kind: "resistance", source: `${label} high`, index: candles.length - 2 });
      candidates.push({ price: previous.low, kind: "support", source: `${label} low`, index: candles.length - 2 });
      candidates.push({ price: previous.close, kind: "support", source: `${label} close`, index: candles.length - 2 });
    }
  }
  const zones: PriceZone[] = [];
  const sorted = [...candidates].sort((a, b) => a.price - b.price);
  let bucket: typeof sorted = [];
  const flush = () => {
    if (!bucket.length) return;
    const mean = bucket.reduce((sum, item) => sum + item.price, 0) / bucket.length;
    const half = Math.max(tolerance / 2, mean * 0.0005);
    const low = Math.min(...bucket.map((item) => item.price), mean - half);
    const high = Math.max(...bucket.map((item) => item.price), mean + half);
    const kind = bucket.filter((item) => item.kind === "resistance").length >= bucket.filter((item) => item.kind === "support").length
      ? "resistance"
      : "support";
    const lastIndex = Math.max(...bucket.map((item) => item.index));
    const sources = [...new Set(bucket.map((item) => item.source))];
    let role: PriceZone["role"] = "active";
    for (let i = lastIndex + 1; i < candles.length; i++) {
      if (kind === "resistance" && candles[i].close > high) role = "broken-resistance";
      if (kind === "support" && candles[i].close < low) role = "broken-support";
    }
    const mid = (low + high) / 2;
    zones.push({
      id: `${kind}-${low.toFixed(4)}-${high.toFixed(4)}`,
      low,
      high,
      kind,
      role,
      reactions: bucket.length,
      recencyBars: Math.max(0, candles.length - 1 - lastIndex),
      sources,
      distancePct: ((mid - price) / price) * 100,
      established: bucket.length >= 2,
      timeframe,
    });
    bucket = [];
  };
  for (const candidate of sorted) {
    if (!bucket.length) {
      bucket.push(candidate);
      continue;
    }
    const mean = bucket.reduce((sum, item) => sum + item.price, 0) / bucket.length;
    if (Math.abs(candidate.price - mean) <= tolerance) bucket.push(candidate);
    else {
      flush();
      bucket.push(candidate);
    }
  }
  flush();
  return zones.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
}

export type FibLevel = { ratio: number; label: string; price: number };
export type FibSet = {
  direction: "up" | "down";
  high: { time: number; price: number };
  low: { time: number; price: number };
  levels: FibLevel[];
  note: string;
};

export function fibonacciSet(high: { time: number; price: number }, low: { time: number; price: number }): FibSet | null {
  if (!(high.price > low.price) || high.price <= 0 || low.price <= 0) return null;
  const range = high.price - low.price;
  const upward = low.time <= high.time;
  const levels = FIB_RATIOS.map((item) => ({
    ratio: item.ratio,
    label: item.label,
    price: upward ? high.price - item.ratio * range : low.price + item.ratio * range,
  }));
  return {
    direction: upward ? "up" : "down",
    high,
    low,
    levels,
    note: "Fibonacci retracements are reference areas. They are not guaranteed support, resistance, or reversal points, and they are not price extensions.",
  };
}

export function automaticFibAnchors(swings: SwingPoint[]): { high: SwingPoint; low: SwingPoint } | null {
  const high = [...swings].reverse().find((point) => point.kind === "high");
  const low = [...swings].reverse().find((point) => point.kind === "low");
  if (!high || !low || high.time === low.time) return null;
  return { high, low };
}

export type GapZone = {
  direction: "up" | "down";
  low: number;
  high: number;
  size: number;
  sizePct: number;
  time: number;
  fillPct: number;
  filled: boolean;
  timeframe: string;
  session: string;
};

export function detectGaps(candles: ChartCandle[], timeframe: string, eligible: boolean): GapZone[] {
  if (!eligible || (timeframe !== "1d" && timeframe !== "1w") || candles.length < 2) return [];
  const session = timeframe === "1d"
    ? "Previous daily bar high and low stand in for the previous regular session. This is not applied to intraday or 24-hour markets."
    : "Previous weekly bar high and low. This is a weekly gap, not an intraday gap.";
  const gaps: GapZone[] = [];
  for (let i = 1; i < candles.length; i++) {
    const previous = candles[i - 1];
    const current = candles[i];
    const up = current.low > previous.high;
    const down = current.high < previous.low;
    if (!up && !down) continue;
    const low = up ? previous.high : current.high;
    const high = up ? current.low : previous.low;
    const size = high - low;
    if (!(size > 0)) continue;
    let extreme = up ? current.low : current.high;
    for (let j = i; j < candles.length; j++) {
      extreme = up ? Math.min(extreme, candles[j].low) : Math.max(extreme, candles[j].high);
    }
    const filled = up ? extreme <= low : extreme >= high;
    const progress = up ? (high - extreme) / size : (extreme - low) / size;
    gaps.push({
      direction: up ? "up" : "down",
      low,
      high,
      size,
      sizePct: (size / previous.close) * 100,
      time: current.time,
      fillPct: Math.max(0, Math.min(100, progress * 100)),
      filled,
      timeframe,
      session,
    });
  }
  return gaps;
}

export type TrendStatus =
  | "FORMING"
  | "BREAKOUT_PENDING"
  | "BREAKOUT_CONFIRMED"
  | "RETEST_PENDING"
  | "RETEST_CONFIRMED"
  | "FAILED"
  | "INVALIDATED";

export type TrendLine = {
  kind: "ascending" | "descending";
  anchors: [{ time: number; price: number }, { time: number; price: number }];
  projected: { time: number; price: number };
  status: TrendStatus;
  distance: number;
  slopePerSecond: number;
};

export function buildTrendlines(candles: ChartCandle[], swings: SwingPoint[], provisional: boolean): TrendLine[] {
  const highs = swings.filter((point) => point.kind === "high");
  const lows = swings.filter((point) => point.kind === "low");
  const lines = [descendingLine(highs), ascendingLine(lows)].filter((line): line is Omit<TrendLine, "status" | "distance" | "projected"> => line != null);
  const completed = provisional && candles.length > 1 ? candles.slice(0, -1) : candles;
  const forming = provisional ? candles[candles.length - 1] : null;
  return lines.map((line) => classifyTrendline(line, completed, forming, averageRange(completed)));
}

function descendingLine(highs: SwingPoint[]) {
  if (highs.length < 2) return null;
  const later = highs[highs.length - 1];
  for (let i = highs.length - 2; i >= 0; i--) {
    if (highs[i].price > later.price && highs[i].time < later.time) {
      return lineFrom(highs[i], later, "descending");
    }
  }
  return null;
}

function ascendingLine(lows: SwingPoint[]) {
  if (lows.length < 2) return null;
  const later = lows[lows.length - 1];
  for (let i = lows.length - 2; i >= 0; i--) {
    if (lows[i].price < later.price && lows[i].time < later.time) {
      return lineFrom(lows[i], later, "ascending");
    }
  }
  return null;
}

function lineFrom(first: SwingPoint, second: SwingPoint, kind: "ascending" | "descending") {
  const slopePerSecond = (second.price - first.price) / (second.time - first.time);
  if (!Number.isFinite(slopePerSecond)) return null;
  return {
    kind,
    anchors: [
      { time: first.time, price: first.price },
      { time: second.time, price: second.price },
    ] as [{ time: number; price: number }, { time: number; price: number }],
    slopePerSecond,
  };
}

export function linePriceAt(line: { anchors: [{ time: number; price: number }, { time: number; price: number }]; slopePerSecond: number }, time: number) {
  return line.anchors[0].price + line.slopePerSecond * (time - line.anchors[0].time);
}

function classifyTrendline(
  line: Omit<TrendLine, "status" | "distance" | "projected">,
  completed: ChartCandle[],
  forming: ChartCandle | null,
  range: number,
): TrendLine {
  const last = completed[completed.length - 1];
  const projectedTime = forming?.time ?? last?.time ?? line.anchors[1].time;
  const projected = { time: projectedTime, price: linePriceAt(line, projectedTime) };
  if (!last || line.anchors[0].time === line.anchors[1].time) {
    return { ...line, projected, status: "INVALIDATED", distance: 0 };
  }
  const buffer = Math.max(last.close * 0.0015, range * 0.1, 0.01);
  let broke = false;
  let status: TrendStatus = "FORMING";
  for (const candle of completed) {
    if (candle.time <= line.anchors[1].time) continue;
    const level = linePriceAt(line, candle.time);
    const beyond = line.kind === "descending" ? candle.close > level + buffer : candle.close < level - buffer;
    const back = line.kind === "descending" ? candle.close < level - buffer : candle.close > level + buffer;
    const touched = candle.low <= level + buffer && candle.high >= level - buffer;
    if (!broke && beyond) {
      broke = true;
      status = "BREAKOUT_CONFIRMED";
      continue;
    }
    if (broke && back) {
      broke = false;
      status = "FAILED";
      continue;
    }
    if (broke && touched && !beyond) status = "RETEST_CONFIRMED";
  }
  if (forming) {
    const level = linePriceAt(line, forming.time);
    const beyond = line.kind === "descending" ? forming.close > level + buffer : forming.close < level - buffer;
    const touched = forming.low <= level + buffer && forming.high >= level - buffer;
    if (!broke && beyond) status = "BREAKOUT_PENDING";
    else if (broke && touched && status === "BREAKOUT_CONFIRMED") status = "RETEST_PENDING";
  }
  const lastLevel = linePriceAt(line, last.time);
  return { ...line, projected, status, distance: last.close - lastLevel };
}

export type VolumeRead = {
  lastCompleted: number | null;
  average: number | null;
  relative: number | null;
  window: number;
  provisionalExcluded: boolean;
  note: string;
};

export function volumeRead(candles: ChartCandle[], provisional: boolean, window = VOLUME_WINDOW): VolumeRead {
  const completed = provisional ? candles.slice(0, -1) : candles;
  const withVolume = completed.filter((candle) => candle.volume != null);
  const last = withVolume[withVolume.length - 1];
  const sample = withVolume.slice(-window - 1, -1);
  const average = sample.length ? sample.reduce((sum, candle) => sum + (candle.volume as number), 0) / sample.length : null;
  const relative = last && average && average > 0 ? (last.volume as number) / average : null;
  return {
    lastCompleted: last ? (last.volume as number) : null,
    average,
    relative,
    window,
    provisionalExcluded: provisional,
    note: provisional
      ? "Relative volume uses the last completed candle against the prior completed candles of this timeframe. The forming candle is excluded so a partial bar is not compared with a full bar."
      : "Relative volume is the last candle's volume divided by the average of the prior completed candles of this same timeframe.",
  };
}

export type DecisionStatus =
  | "BULLISH SETUP DEVELOPING"
  | "BREAKOUT CONFIRMATION PENDING"
  | "BULLISH BREAKOUT CONFIRMED"
  | "BEARISH SETUP DEVELOPING"
  | "BREAKDOWN CONFIRMATION PENDING"
  | "BEARISH BREAKDOWN CONFIRMED"
  | "RANGE / WAIT"
  | "INSUFFICIENT DATA";

export function decisionFromFacts(facts: {
  completedBars: number;
  price: number | null;
  ema21: number | null;
  ema50: number | null;
  structure: StructureTrend;
  resistanceHigh: number | null;
  resistanceLow: number | null;
  supportHigh: number | null;
  supportLow: number | null;
  lastClose: number | null;
  relativeVolume: number | null;
}): { status: DecisionStatus; reasons: string[]; invalidation: string } {
  if (facts.completedBars < 30 || facts.ema21 == null || facts.price == null || facts.lastClose == null) {
    return {
      status: "INSUFFICIENT DATA",
      reasons: ["Fewer than 30 completed candles, or EMA 21 cannot be calculated yet."],
      invalidation: "Insufficient data",
    };
  }
  const volumeOk = facts.relativeVolume == null ? false : facts.relativeVolume >= 1;
  const aboveResistance = facts.resistanceHigh != null && facts.lastClose > facts.resistanceHigh;
  const insideResistance =
    facts.resistanceLow != null && facts.resistanceHigh != null && facts.lastClose > facts.resistanceLow && facts.lastClose <= facts.resistanceHigh;
  const belowSupport = facts.supportLow != null && facts.lastClose < facts.supportLow;
  const insideSupport =
    facts.supportLow != null && facts.supportHigh != null && facts.lastClose < facts.supportHigh && facts.lastClose >= facts.supportLow;
  if (aboveResistance && volumeOk) {
    return {
      status: "BULLISH BREAKOUT CONFIRMED",
      reasons: ["A completed candle closed above the nearest resistance zone.", "Relative volume on the last completed candle is at least 1.0."],
      invalidation: "A later completed close back below that resistance zone invalidates the breakout description.",
    };
  }
  if (belowSupport && volumeOk) {
    return {
      status: "BEARISH BREAKDOWN CONFIRMED",
      reasons: ["A completed candle closed below the nearest support zone.", "Relative volume on the last completed candle is at least 1.0."],
      invalidation: "A later completed close back above that support zone invalidates the breakdown description.",
    };
  }
  if (aboveResistance || insideResistance) {
    return {
      status: "BREAKOUT CONFIRMATION PENDING",
      reasons: [
        aboveResistance
          ? "Price closed above resistance, and relative volume is below 1.0 or unavailable, so the breakout is not confirmed."
          : "The last completed close is inside the nearest resistance zone.",
      ],
      invalidation: "A completed close back below the resistance zone removes the pending breakout.",
    };
  }
  if (belowSupport || insideSupport) {
    return {
      status: "BREAKDOWN CONFIRMATION PENDING",
      reasons: [
        belowSupport
          ? "Price closed below support, and relative volume is below 1.0 or unavailable, so the breakdown is not confirmed."
          : "The last completed close is inside the nearest support zone.",
      ],
      invalidation: "A completed close back above the support zone removes the pending breakdown.",
    };
  }
  const aboveEmas = facts.price > facts.ema21 && (facts.ema50 == null || facts.price > facts.ema50);
  const belowEmas = facts.price < facts.ema21 && (facts.ema50 == null || facts.price < facts.ema50);
  if (aboveEmas && facts.structure === "up") {
    return {
      status: "BULLISH SETUP DEVELOPING",
      reasons: ["The latest close is above EMA 21 and EMA 50 when EMA 50 exists.", "Confirmed swings show a higher high and a higher low."],
      invalidation: "A completed close below EMA 21, or a lower low, removes this developing description.",
    };
  }
  if (belowEmas && facts.structure === "down") {
    return {
      status: "BEARISH SETUP DEVELOPING",
      reasons: ["The latest close is below EMA 21 and EMA 50 when EMA 50 exists.", "Confirmed swings show a lower high and a lower low."],
      invalidation: "A completed close above EMA 21, or a higher high, removes this developing description.",
    };
  }
  return {
    status: "RANGE / WAIT",
    reasons: ["Price is not confirming a breakout, breakdown, or aligned swing structure on this timeframe."],
    invalidation: "A completed close beyond a calculated zone with relative volume of at least 1.0 would replace this range description.",
  };
}

export type LeverageProfile = {
  leveraged: boolean;
  inverse: boolean;
  multiple: string | null;
  notice: string;
};

export function leverageProfile(name: string): LeverageProfile | null {
  const text = name.toLowerCase();
  const multiple = text.match(/(-?\d+(?:\.\d+)?)\s*x\b/)?.[1] ?? null;
  const inverse = /\binverse\b|\bultrashort\b|\bbear\b|\bshort\b/.test(text) || (multiple != null && multiple.startsWith("-"));
  const leveraged = multiple != null || /\bultra\b|\bleveraged\b/.test(text);
  if (!leveraged && !inverse) return null;
  return {
    leveraged,
    inverse,
    multiple,
    notice:
      "Leverage targets on this kind of fund generally apply to daily returns. Returns over longer periods can differ from the stated multiple, and volatility can magnify losses. A technical signal on the fund does not by itself establish the direction of its underlying index.",
  };
}

export function hypotheticalRiskReward(reference: number, stop: number | null, target: number | null) {
  if (stop == null || target == null || !Number.isFinite(reference) || !Number.isFinite(stop) || !Number.isFinite(target)) return null;
  const risk = Math.abs(reference - stop);
  const reward = Math.abs(target - reference);
  if (!(risk > 0)) return null;
  return {
    reference,
    stop,
    target,
    risk,
    reward,
    ratio: reward / risk,
    note: "Hypothetical only. The reference price is the latest candle close. The stop and target are the values you entered, not a model recommendation.",
  };
}

export type ChartAnalysis = {
  candles: ChartCandle[];
  dropped: number;
  missingIntervals: number;
  provisional: boolean;
  price: number | null;
  emas: EmaReading[];
  swings: SwingPoint[];
  structure: ReturnType<typeof marketStructure>;
  zones: PriceZone[];
  fib: FibSet | null;
  suggestedAnchors: { highTime: number; lowTime: number; high: number; low: number } | null;
  gaps: GapZone[];
  trendlines: TrendLine[];
  volume: VolumeRead;
  decision: ReturnType<typeof decisionFromFacts>;
  summary: {
    structure: string[];
    levels: string[];
    bullish: string;
    neutral: string;
    bearish: string;
    invalidation: string[];
  };
  limitations: string[];
};

export function analyzeChart(
  raw: unknown,
  options: {
    timeframe: string;
    emaPeriods?: number[];
    nowSec?: number;
    gapEligible?: boolean;
    fibAnchors?: { highTime: number; lowTime: number } | null;
  },
): ChartAnalysis {
  const { candles, dropped } = normalizeRawBars(raw);
  const barSeconds = chartBarSeconds(options.timeframe);
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const last = candles[candles.length - 1] ?? null;
  const provisional = last != null && last.time <= nowSec && nowSec < last.time + barSeconds;
  const completed = provisional ? candles.slice(0, -1) : candles;
  const periods = (options.emaPeriods?.length ? options.emaPeriods : [...EMA_DEFAULTS]).filter((period) => Number.isInteger(period) && period >= 2 && period <= 400);
  const closes = candles.map((candle) => candle.close);
  const price = last?.close ?? null;
  const emas = readEmas(closes, periods, completed[completed.length - 1]?.close ?? price);
  const swings = confirmedSwings(candles);
  const structure = marketStructure(swings);
  const zones = price == null ? [] : clusterLevels(completed.length ? completed : candles, swings.filter((swing) => !provisional || swing.index < candles.length - 1), options.timeframe, price);
  const suggested = automaticFibAnchors(swings);
  const fib = resolveFib(candles, swings, suggested, options.fibAnchors ?? null);
  const gaps = detectGaps(candles, options.timeframe, options.gapEligible !== false);
  const trendlines = buildTrendlines(candles, swings, provisional);
  const volume = volumeRead(candles, provisional);
  const lastClose = completed[completed.length - 1]?.close ?? null;
  const priorClose = completed[completed.length - 2]?.close ?? null;
  const engagedResistance = engagedZone(zones, "resistance", lastClose, priorClose);
  const engagedSupport = engagedZone(zones, "support", lastClose, priorClose);
  const ema21 = emas.find((item) => item.period === 21)?.value ?? null;
  const ema50 = emas.find((item) => item.period === 50)?.value ?? null;
  const decision = decisionFromFacts({
    completedBars: completed.length,
    price: lastClose ?? price,
    ema21,
    ema50,
    structure: structure.trend,
    resistanceHigh: engagedResistance?.high ?? null,
    resistanceLow: engagedResistance?.low ?? null,
    supportHigh: engagedSupport?.high ?? null,
    supportLow: engagedSupport?.low ?? null,
    lastClose,
    relativeVolume: volume.relative,
  });
  const limitations = [
    "Indicators use the selected timeframe only. A higher-timeframe level is not substituted when that timeframe was not requested.",
    "Opening-range levels are omitted because the provider does not supply a separate opening-range series.",
    "Missing intervals are counted and left empty. No synthetic candles are inserted.",
    provisional ? "The latest candle is still forming. Breakout confirmation ignores it." : "The latest candle is outside the current bar window and is treated as completed.",
    dropped ? `${dropped} invalid candle${dropped === 1 ? "" : "s"} removed before calculation.` : "All received candles passed OHLC validation.",
  ];
  return {
    candles,
    dropped,
    missingIntervals: missingIntervalCount(candles, barSeconds),
    provisional,
    price,
    emas,
    swings,
    structure,
    zones,
    fib,
    suggestedAnchors: suggested ? { highTime: suggested.high.time, lowTime: suggested.low.time, high: suggested.high.price, low: suggested.low.price } : null,
    gaps,
    trendlines,
    volume,
    decision,
    summary: buildSummary({ price, swings, structure, zones, fib, gaps, emas, timeframe: options.timeframe }),
    limitations,
  };
}

function resolveFib(
  candles: ChartCandle[],
  swings: SwingPoint[],
  suggested: { high: SwingPoint; low: SwingPoint } | null,
  manual: { highTime: number; lowTime: number } | null,
): FibSet | null {
  if (manual) {
    const highSwing = swings.find((point) => point.kind === "high" && point.time === manual.highTime);
    const lowSwing = swings.find((point) => point.kind === "low" && point.time === manual.lowTime);
    const highCandle = candles.find((candle) => candle.time === manual.highTime);
    const lowCandle = candles.find((candle) => candle.time === manual.lowTime);
    const high = highSwing ? { time: highSwing.time, price: highSwing.price } : highCandle ? { time: highCandle.time, price: highCandle.high } : null;
    const low = lowSwing ? { time: lowSwing.time, price: lowSwing.price } : lowCandle ? { time: lowCandle.time, price: lowCandle.low } : null;
    if (high && low) return fibonacciSet(high, low);
  }
  if (!suggested) return null;
  return fibonacciSet({ time: suggested.high.time, price: suggested.high.price }, { time: suggested.low.time, price: suggested.low.price });
}

function buildSummary(input: {
  price: number | null;
  swings: SwingPoint[];
  structure: ReturnType<typeof marketStructure>;
  zones: PriceZone[];
  fib: FibSet | null;
  gaps: GapZone[];
  emas: EmaReading[];
  timeframe: string;
}): ChartAnalysis["summary"] {
  const price = input.price;
  const high = [...input.swings].reverse().find((point) => point.kind === "high");
  const low = [...input.swings].reverse().find((point) => point.kind === "low");
  const trendText =
    input.structure.trend === "up"
      ? "Confirmed swings are making a higher high and a higher low."
      : input.structure.trend === "down"
        ? "Confirmed swings are making a lower high and a lower low."
        : input.structure.trend === "mixed"
          ? "Confirmed swings do not agree on one direction."
          : "Insufficient data";
  const emaText = input.emas
    .filter((item) => item.period === 9 || item.period === 21 || item.period === 50 || item.period === 200)
    .map((item) => (item.value == null || item.priceRelation === "insufficient" ? `EMA ${item.period}: Insufficient data` : `Price is ${item.priceRelation} EMA ${item.period} (${item.value.toFixed(2)}).`));
  const structure = [
    price == null ? "Latest price: Insufficient data" : `Latest candle close: ${price.toFixed(2)} on the ${input.timeframe} timeframe.`,
    high ? `Recent confirmed swing high: ${high.price.toFixed(2)}.` : "Recent confirmed swing high: Insufficient data",
    low ? `Recent confirmed swing low: ${low.price.toFixed(2)}.` : "Recent confirmed swing low: Insufficient data",
    trendText,
    ...emaText,
    input.structure.reversalConfirmed ? "A structural reversal is confirmed under the two-pivot flip rule." : "A structural reversal is not confirmed.",
  ];
  const supports = input.zones.filter((zone) => zone.kind === "support" && zone.role === "active" && price != null && zone.high <= price).sort((a, b) => b.high - a.high);
  const resistances = input.zones.filter((zone) => zone.kind === "resistance" && zone.role === "active" && price != null && zone.low >= price).sort((a, b) => a.low - b.low);
  const levels: string[] = [];
  const pushZone = (label: string, zone: PriceZone | undefined) => {
    if (!zone || price == null) levels.push(`${label}: Insufficient data`);
    else levels.push(`${label}: ${zone.low.toFixed(2)}–${zone.high.toFixed(2)} (${zone.sources.join(", ")}, ${zone.timeframe}, ${zone.distancePct.toFixed(2)}% from the latest close, ${zone.reactions} reaction${zone.reactions === 1 ? "" : "s"}).`);
  };
  pushZone("Nearest support", supports[0]);
  pushZone("Next lower support", supports[1]);
  pushZone("Nearest resistance", resistances[0]);
  pushZone("Next higher resistance", resistances[1]);
  if (input.fib) {
    for (const level of input.fib.levels) {
      const distance = price == null ? null : ((level.price - price) / price) * 100;
      levels.push(`Fibonacci ${level.label} (${input.fib.direction} swing ${input.fib.low.price.toFixed(2)} to ${input.fib.high.price.toFixed(2)}): ${level.price.toFixed(2)}${distance == null ? "" : `, ${distance.toFixed(2)}% from the latest close`}.`);
    }
  } else levels.push("Fibonacci: Insufficient data");
  const gap = [...input.gaps].reverse()[0];
  if (!gap) levels.push("Gap zone: none detected for this timeframe, or gap analysis does not apply.");
  else levels.push(`${gap.filled ? "Filled" : "Open"} ${gap.direction} gap ${gap.low.toFixed(2)}–${gap.high.toFixed(2)} (${gap.fillPct.toFixed(0)}% filled, ${gap.timeframe}). A filled gap is not automatic support or resistance.`);
  const bullish = resistances[0]
    ? `If price closes above ${resistances[0].high.toFixed(2)} with volume at or above the ${VOLUME_WINDOW}-bar average and then holds that zone, the next relevant resistance is ${resistances[1] ? `${resistances[1].low.toFixed(2)}–${resistances[1].high.toFixed(2)}` : "not available in this window"}.`
    : "Insufficient data";
  const bearish = supports[0]
    ? `If price closes below ${supports[0].low.toFixed(2)} and fails to reclaim that zone, the next relevant support is ${supports[1] ? `${supports[1].low.toFixed(2)}–${supports[1].high.toFixed(2)}` : "not available in this window"}.`
    : "Insufficient data";
  const neutral =
    supports[0] && resistances[0]
      ? `If price remains between ${supports[0].high.toFixed(2)} and ${resistances[0].low.toFixed(2)}, the ${input.timeframe} structure stays range-bound and no directional advantage is established.`
      : "Insufficient data";
  return {
    structure,
    levels,
    bullish,
    neutral,
    bearish,
    invalidation: [
      bullish === "Insufficient data" ? "Bullish invalidation: Insufficient data" : `The bullish description is invalidated by a completed close back below ${resistances[0]!.low.toFixed(2)}.`,
      bearish === "Insufficient data" ? "Bearish invalidation: Insufficient data" : `The bearish description is invalidated by a completed close back above ${supports[0]!.high.toFixed(2)}.`,
      "These are conditional descriptions of calculated levels. They are not price targets or trade recommendations.",
    ],
  };
}

function engagedZone(zones: PriceZone[], kind: "support" | "resistance", lastClose: number | null, priorClose: number | null) {
  if (lastClose == null) return null;
  return (
    zones.find((zone) => {
      if (zone.kind !== kind) return false;
      const inside = lastClose >= zone.low && lastClose <= zone.high;
      const crossed =
        kind === "resistance"
          ? lastClose > zone.high && (priorClose == null || priorClose <= zone.high)
          : lastClose < zone.low && (priorClose == null || priorClose >= zone.low);
      return inside || crossed;
    }) ?? null
  );
}

function lastNumber(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return values[i];
  return null;
}

function nthLastNumber(values: (number | null)[], lookback: number): number | null {
  let seen = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] == null) continue;
    if (seen === lookback) return values[i];
    seen += 1;
  }
  return null;
}

export const EMA_GUIDE: Record<number, string> = {
  9: "EMA 9 is a common short-term momentum average. It is a convention, not a guaranteed signal.",
  21: "EMA 21 is a common near-term trend average. It is a convention, not a guaranteed signal.",
  50: "EMA 50 is a common intermediate trend average. It is a convention, not a guaranteed signal.",
  100: "EMA 100 is a longer-term context average. It is a convention, not a guaranteed signal.",
  200: "EMA 200 is a longer-term context average. It is a convention, not a guaranteed signal.",
  325: "EMA 325 is a longer-term context average. It is a convention, not a guaranteed signal.",
};
