import {
  clampFearGreedValue,
  getFearGreedClassification,
  type HistoricalGaugeValue,
  type MarketGaugeData,
} from "@/lib/fearGreed";

export type FearGreedPoint = { value: number; timestamp: string };

function asPoint(value: unknown, timestamp?: unknown): FearGreedPoint | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  const clamped = clampFearGreedValue(n);
  if (clamped == null) return null;
  let ts: string;
  if (typeof timestamp === "string" && timestamp.trim()) {
    const parsed = Number(timestamp);
    ts = Number.isFinite(parsed) && parsed < 1e12 ? new Date(parsed * 1000).toISOString() : Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(timestamp).toISOString();
    if (Number.isNaN(Date.parse(ts))) ts = new Date().toISOString();
  } else if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    ts = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString();
  } else {
    ts = new Date().toISOString();
  }
  return { value: clamped, timestamp: ts };
}

function historical(point: FearGreedPoint | null | undefined): HistoricalGaugeValue | undefined {
  if (!point) return undefined;
  const classification = getFearGreedClassification(point.value);
  if (!classification) return undefined;
  return { value: point.value, classification, timestamp: point.timestamp };
}

function closest(points: FearGreedPoint[], targetMs: number, maxDriftMs: number) {
  let best: FearGreedPoint | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    const dist = Math.abs(Date.parse(p.timestamp) - targetMs);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best && bestDist <= maxDriftMs ? best : null;
}

export function normalizeFearGreed(input: {
  current: FearGreedPoint | null;
  previousClose?: FearGreedPoint | null;
  oneWeekAgo?: FearGreedPoint | null;
  oneMonthAgo?: FearGreedPoint | null;
  oneYearAgo?: FearGreedPoint | null;
  series?: FearGreedPoint[];
  source: string;
  data_status?: MarketGaugeData["data_status"];
  last_updated?: string;
}): MarketGaugeData | null {
  const current = input.current;
  const classification = current ? getFearGreedClassification(current.value) : null;
  if (!current || !classification) return null;
  const now = Date.parse(current.timestamp) || Date.now();
  const series = (input.series || []).filter((p) => Number.isFinite(Date.parse(p.timestamp)));
  const older = series.filter((p) => Date.parse(p.timestamp) < now - 6 * 3600 * 1000);
  return {
    current: { value: current.value, classification, timestamp: current.timestamp },
    previousClose: historical(input.previousClose || closest(older, now - 86400000, 2 * 86400000)),
    oneWeekAgo: historical(input.oneWeekAgo || closest(older, now - 7 * 86400000, 3 * 86400000)),
    oneMonthAgo: historical(input.oneMonthAgo || closest(older, now - 30 * 86400000, 8 * 86400000)),
    oneYearAgo: historical(input.oneYearAgo || closest(older, now - 365 * 86400000, 21 * 86400000)),
    source: input.source,
    data_status: input.data_status || "LIVE",
    last_updated: input.last_updated || new Date().toISOString(),
  };
}

export function parseCnnFearGreed(raw: unknown): MarketGaugeData | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const currentBlock = (body.fear_and_greed || body) as Record<string, unknown>;
  const current = asPoint(currentBlock.score ?? currentBlock.value, currentBlock.timestamp);
  const hist = (body.fear_and_greed_historical || currentBlock.fear_and_greed_historical) as Record<string, unknown> | unknown[] | undefined;
  const rows = Array.isArray(hist) ? hist : Array.isArray((hist as Record<string, unknown> | undefined)?.data) ? ((hist as Record<string, unknown>).data as unknown[]) : [];
  const series = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      return asPoint(r.y ?? r.score ?? r.value, r.x ?? r.timestamp);
    })
    .filter((p): p is FearGreedPoint => !!p);
  return normalizeFearGreed({
    current,
    previousClose: asPoint(currentBlock.previous_close ?? currentBlock.previousClose, currentBlock.previous_close_timestamp),
    oneWeekAgo: asPoint(currentBlock.previous_1_week ?? currentBlock.previous_week, currentBlock.previous_1_week_timestamp),
    oneMonthAgo: asPoint(currentBlock.previous_1_month ?? currentBlock.previous_month, currentBlock.previous_1_month_timestamp),
    oneYearAgo: asPoint(currentBlock.previous_1_year ?? currentBlock.previous_year, currentBlock.previous_1_year_timestamp),
    series,
    source: "CNN Fear & Greed",
  });
}

export function parseAlternativeFearGreed(raw: unknown): MarketGaugeData | null {
  if (!raw || typeof raw !== "object") return null;
  const rows = (raw as { data?: unknown[] }).data;
  if (!Array.isArray(rows) || !rows.length) return null;
  const series = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      return asPoint(r.value, r.timestamp);
    })
    .filter((p): p is FearGreedPoint => !!p)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return normalizeFearGreed({
    current: series[0] || null,
    previousClose: series[1] || null,
    series,
    source: "alternative.me",
  });
}

export { asPoint };
