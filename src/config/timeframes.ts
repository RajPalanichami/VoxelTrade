export type Timeframe = "5m" | "30m" | "1h" | "4h" | "1d";

export const TIMEFRAMES: Timeframe[] = ["5m", "30m", "1h", "4h", "1d"];

const DAY = 86_400;

export type TimeframeSpec = {
  id: Timeframe;
  label: string;
  yahooInterval: "5m" | "15m" | "30m" | "60m" | "1d";
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
export const TIMEFRAME_SPECS: Record<Timeframe, TimeframeSpec> = {
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
};

export const TIMEFRAME_LABELS: Record<string, string> = Object.fromEntries(
  TIMEFRAMES.map((id) => [id, TIMEFRAME_SPECS[id].label]),
);

export const TWELVE_INTERVAL: Record<string, string> = Object.fromEntries(
  TIMEFRAMES.map((id) => [id, TIMEFRAME_SPECS[id].twelveInterval]),
);

export const AV_INTERVAL: Record<string, string> = Object.fromEntries(
  TIMEFRAMES.map((id) => [id, TIMEFRAME_SPECS[id].avInterval]),
);

export const YF_INTERVAL: Record<string, TimeframeSpec["yahooInterval"]> = Object.fromEntries(
  TIMEFRAMES.map((id) => [id, TIMEFRAME_SPECS[id].yahooInterval]),
);

export const YF_PERIOD: Record<string, string> = {
  "5m": "60d",
  "30m": "60d",
  "1h": "730d",
  "4h": "730d",
  "1d": "5y",
};

export function isTimeframe(value: string): value is Timeframe {
  return TIMEFRAMES.includes(value as Timeframe);
}

export function getTimeframeSpec(timeframe: string): TimeframeSpec {
  if (!isTimeframe(timeframe)) {
    throw new Error(`Unsupported timeframe '${timeframe}'. Use: ${TIMEFRAMES.join(", ")}`);
  }
  return TIMEFRAME_SPECS[timeframe];
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
