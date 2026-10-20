export type FearGreedClassification =
  | "Extreme Fear"
  | "Fear"
  | "Neutral"
  | "Greed"
  | "Extreme Greed";

export const FEAR_GREED_ZONES: { max: number; label: FearGreedClassification; color: string }[] = [
  { max: 24, label: "Extreme Fear", color: "#ef4444" },
  { max: 44, label: "Fear", color: "#f97316" },
  { max: 55, label: "Neutral", color: "#eab308" },
  { max: 74, label: "Greed", color: "#84cc16" },
  { max: 100, label: "Extreme Greed", color: "#22c55e" },
];

export type HistoricalGaugeValue = {
  value: number;
  classification: FearGreedClassification;
  timestamp: string;
};

export type MarketGaugeData = {
  current: {
    value: number;
    classification: FearGreedClassification;
    timestamp: string;
  };
  previousClose?: HistoricalGaugeValue;
  oneWeekAgo?: HistoricalGaugeValue;
  oneMonthAgo?: HistoricalGaugeValue;
  oneYearAgo?: HistoricalGaugeValue;
  source: string;
  data_status: "LIVE" | "STALE" | "UNAVAILABLE";
  last_updated: string;
  error?: string;
};

export function getFearGreedClassification(value: number | null | undefined): FearGreedClassification | null {
  if (value == null || !Number.isFinite(value)) return null;
  const n = Math.min(100, Math.max(0, value));
  return FEAR_GREED_ZONES.find((zone) => n <= zone.max)?.label ?? null;
}

export function fearGreedZoneColor(value: number | null | undefined): string {
  const label = getFearGreedClassification(value);
  return FEAR_GREED_ZONES.find((zone) => zone.label === label)?.color || "#94a3b8";
}

export function formatFearGreedZone(zone: (typeof FEAR_GREED_ZONES)[number], index: number) {
  const min = index === 0 ? 0 : FEAR_GREED_ZONES[index - 1].max + 1;
  return `${min}–${zone.max} ${zone.label}`;
}

export function clampFearGreedValue(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}
