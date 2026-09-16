export type Timeframe = "5m" | "30m" | "1h" | "4h" | "1d";
export type SwingTimeframe = "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
export type PatternTimeframe = "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w" | "1M";
export type AnyTimeframe = Timeframe | SwingTimeframe;

export const TIMEFRAMES: Timeframe[] = ["5m", "30m", "1h", "4h", "1d"];
export const SWING_TIMEFRAMES: SwingTimeframe[] = ["15m", "30m", "1h", "4h", "1d", "1w"];
export const PATTERN_TIMEFRAMES: PatternTimeframe[] = ["5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"];
export const PATTERN_TIMEFRAME_LABELS: Record<PatternTimeframe, string> = {
  "5m": "5 Minutes",
  "15m": "15 Minutes",
  "30m": "30 Minutes",
  "1h": "1 Hour",
  "4h": "4 Hours",
  "1d": "Daily",
  "1w": "Weekly",
  "1M": "Monthly",
};

const DAY = 86_400;

export type TimeframeSpec = {
  id: AnyTimeframe;
  label: string;
  yahooInterval: "5m" | "15m" | "30m" | "60m" | "1d" | "1wk";
  yahooLookbackSec: number;
  yahooFallbackLookbackSec: number[];
  twelveInterval: string;
  avInterval: string;
  resample: "4h" | null;
  minBars: number;
  indicatorWarmup: number;
};

/**
 * Yahoo chart v8 rejects interval/range pairs that exceed its history caps:
 * 5m/15m/30m ≤ 60 days, 60m/1h ≤ 730 days. Do not send range=3mo with 30m.
 */
export const TIMEFRAME_SPECS: Record<AnyTimeframe, TimeframeSpec> = {
  "5m": {
    id: "5m",
    label: "5 Minutes",
    yahooInterval: "5m",
    yahooLookbackSec: 60 * DAY,
    yahooFallbackLookbackSec: [45 * DAY, 30 * DAY],
    twelveInterval: "5min",
    avInterval: "5min",
    resample: null,
    minBars: 80,
    indicatorWarmup: 200,
  },
  "15m": {
    id: "15m",
    label: "15 Minutes",
    yahooInterval: "15m",
    yahooLookbackSec: 60 * DAY,
    yahooFallbackLookbackSec: [45 * DAY, 30 * DAY],
    twelveInterval: "15min",
    avInterval: "15min",
    resample: null,
    minBars: 80,
    indicatorWarmup: 200,
  },
  "30m": {
    id: "30m",
    label: "30 Minutes",
    yahooInterval: "30m",
    yahooLookbackSec: 60 * DAY,
    yahooFallbackLookbackSec: [45 * DAY, 30 * DAY],
    twelveInterval: "30min",
    avInterval: "30min",
    resample: null,
    minBars: 80,
    indicatorWarmup: 200,
  },
  "1h": {
    id: "1h",
    label: "1 Hour",
    yahooInterval: "60m",
    yahooLookbackSec: 730 * DAY,
    yahooFallbackLookbackSec: [365 * DAY, 180 * DAY],
    twelveInterval: "1h",
    avInterval: "60min",
    resample: null,
    minBars: 80,
    indicatorWarmup: 200,
  },
  "4h": {
    id: "4h",
    label: "4 Hours",
    yahooInterval: "60m",
    yahooLookbackSec: 730 * DAY,
    yahooFallbackLookbackSec: [365 * DAY, 180 * DAY],
    twelveInterval: "4h",
    avInterval: "60min",
    resample: "4h",
    minBars: 40,
    indicatorWarmup: 80,
  },
  "1d": {
    id: "1d",
    label: "Daily",
    yahooInterval: "1d",
    yahooLookbackSec: 5 * 365 * DAY,
    yahooFallbackLookbackSec: [2 * 365 * DAY, 365 * DAY],
    twelveInterval: "1day",
    avInterval: "daily",
    resample: null,
    minBars: 80,
    indicatorWarmup: 200,
  },
  "1w": {
    id: "1w",
    label: "Weekly",
    yahooInterval: "1wk",
    yahooLookbackSec: 10 * 365 * DAY,
    yahooFallbackLookbackSec: [5 * 365 * DAY, 3 * 365 * DAY],
    twelveInterval: "1week",
    avInterval: "weekly",
    resample: null,
    minBars: 40,
    indicatorWarmup: 80,
  },
};

export const TIMEFRAME_LABELS: Record<string, string> = Object.fromEntries(
  (Object.keys(TIMEFRAME_SPECS) as AnyTimeframe[]).map((id) => [id, TIMEFRAME_SPECS[id].label]),
);

export const TWELVE_INTERVAL: Record<string, string> = Object.fromEntries(
  (Object.keys(TIMEFRAME_SPECS) as AnyTimeframe[]).map((id) => [id, TIMEFRAME_SPECS[id].twelveInterval]),
);

export const AV_INTERVAL: Record<string, string> = Object.fromEntries(
  (Object.keys(TIMEFRAME_SPECS) as AnyTimeframe[]).map((id) => [id, TIMEFRAME_SPECS[id].avInterval]),
);

export const YF_INTERVAL: Record<string, TimeframeSpec["yahooInterval"]> = Object.fromEntries(
  (Object.keys(TIMEFRAME_SPECS) as AnyTimeframe[]).map((id) => [id, TIMEFRAME_SPECS[id].yahooInterval]),
);

export const YF_PERIOD: Record<string, string> = {
  "5m": "60d",
  "15m": "60d",
  "30m": "60d",
  "1h": "730d",
  "4h": "730d",
  "1d": "5y",
  "1w": "10y",
};

export function isTimeframe(value: string): value is Timeframe {
  return TIMEFRAMES.includes(value as Timeframe);
}

export function isSwingTimeframe(value: string): value is SwingTimeframe {
  return SWING_TIMEFRAMES.includes(value as SwingTimeframe);
}

export function isAnyTimeframe(value: string): value is AnyTimeframe {
  return value in TIMEFRAME_SPECS;
}

export function isPatternTimeframe(value: string): value is PatternTimeframe {
  return PATTERN_TIMEFRAMES.includes(value as PatternTimeframe);
}

export function isPatternSwingTimeframe(tf: PatternTimeframe) {
  return tf === "1d" || tf === "1w" || tf === "1M";
}

export function getTimeframeSpec(timeframe: string): TimeframeSpec {
  if (!isAnyTimeframe(timeframe)) {
    throw new Error(`Unsupported timeframe '${timeframe}'. Use: ${Object.keys(TIMEFRAME_SPECS).join(", ")}`);
  }
  return TIMEFRAME_SPECS[timeframe];
}

export function swingHigherTimeframe(tf: SwingTimeframe): SwingTimeframe {
  const map: Record<SwingTimeframe, SwingTimeframe> = {
    "15m": "1h",
    "30m": "4h",
    "1h": "4h",
    "4h": "1d",
    "1d": "1w",
    "1w": "1w",
  };
  return map[tf];
}

export function yahooChartWindows(timeframe: string): { interval: TimeframeSpec["yahooInterval"]; lookbackSec: number }[] {
  const spec = getTimeframeSpec(timeframe);
  return [spec.yahooLookbackSec, ...spec.yahooFallbackLookbackSec].map((lookbackSec) => ({
    interval: spec.yahooInterval,
    lookbackSec,
  }));
}

export function assertIntradayYahooLookback(spec: TimeframeSpec): void {
  if ((spec.yahooInterval === "5m" || spec.yahooInterval === "15m" || spec.yahooInterval === "30m") && spec.yahooLookbackSec > 60 * DAY) {
    throw new Error(`${spec.id} Yahoo lookback exceeds the 60-day chart cap`);
  }
  if (spec.yahooInterval === "60m" && spec.yahooLookbackSec > 730 * DAY) {
    throw new Error(`${spec.id} Yahoo lookback exceeds the 730-day hourly cap`);
  }
}
