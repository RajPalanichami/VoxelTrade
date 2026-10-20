export const TRADE_PLAN_TIMEFRAMES = ["15m", "30m", "1h", "4h"] as const;
export type TradePlanTimeframe = (typeof TRADE_PLAN_TIMEFRAMES)[number];

export const TRADE_PLAN_TF_LABEL: Record<TradePlanTimeframe, string> = {
  "15m": "15 Minutes",
  "30m": "30 Minutes",
  "1h": "1 Hour",
  "4h": "4 Hours",
};

export type TradePlanTone = "BULLISH" | "BEARISH" | "NEUTRAL" | "PIVOT";

export type TradePlanZone = "ABOVE" | "PIVOT" | "BELOW";

export interface TradePlanLevel {
  id: string;
  label: string;
  price: number | null;
  meaning: string;
  tone: TradePlanTone;
  starred?: boolean;
  zone?: TradePlanZone;
  onChart?: boolean;
}

export interface TradePlanWatch {
  tone: "BULLISH" | "BEARISH" | "CAUTION";
  text: string;
}

export interface TradePlanOptionIdea {
  title: string;
  detail: string;
  risk: "HIGH" | "MODERATE" | "LOWER";
  available: boolean;
}

export interface TradePlanMap {
  symbol: string;
  name: string;
  timeframe: TradePlanTimeframe;
  timeframeLabel: string;
  layout: "CHART_MAP" | "DECISION_LADDER";
  price: number | null;
  changePercent: number | null;
  premarketPrice: number | null;
  premarketChangePct: number | null;
  vwap: number | null;
  session: string | null;
  freshness: { source: string; dataStatus: string; timestamp: string };
  structure: {
    label: string;
    detail: string;
    rangeLow: number | null;
    rangeHigh: number | null;
  };
  fib: {
    high: number | null;
    low: number | null;
    r236: number | null;
    r382: number | null;
    r500: number | null;
    r618: number | null;
    r786: number | null;
    r886: number | null;
    ext100: number | null;
    ext110: number | null;
    ext127: number | null;
    ext162: number | null;
    note: string;
  };
  chartLevels: TradePlanLevel[];
  bullishRoadmap: TradePlanLevel[];
  bearishRoadmap: TradePlanLevel[];
  bigPicture: string;
  keyLevelsSummary: TradePlanLevel[];
  tradePlan: { bullish: string[]; bearish: string[] };
  rsi: { rsi14: number | null; rsi7: number | null; note: string; series: number[] };
  macd: {
    line: number | null;
    signal: number | null;
    hist: number | null;
    fastLine: number | null;
    fastSignal: number | null;
    fastHist: number | null;
    note: string;
    histSeries: number[];
  };
  whatToWatch: TradePlanWatch[];
  ladder: TradePlanLevel[];
  howToUse: string[];
  currentRead: string[];
  bullishScenario: string[];
  bearishScenario: string[];
  bullishOptions: TradePlanOptionIdea[];
  bearishOptions: TradePlanOptionIdea[];
  reminders: string[];
  methodology: string;
  bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
}

export function isTradePlanTimeframe(value: string): value is TradePlanTimeframe {
  return (TRADE_PLAN_TIMEFRAMES as readonly string[]).includes(value);
}
