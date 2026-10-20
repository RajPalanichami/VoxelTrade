import { isoDateEastern } from "@/src/lib/easternTime";

const DAY = 86_400_000;

export type DatedClose = { time: number; close: number };
export type HistoryMode = "trading" | "calendar" | "monthly";
export type HistoryZone = "et" | "utc";

export type LevelComparisons = {
  previousClose: number | null;
  oneWeekAgo: number | null;
  oneMonthAgo: number | null;
  oneYearAgo: number | null;
};

function dayKey(ms: number, zone: HistoryZone) {
  if (zone === "utc") return new Date(ms).toISOString().slice(0, 10);
  return isoDateEastern(new Date(ms));
}

function drifts(mode: HistoryMode) {
  if (mode === "monthly") return { week: 3, month: 20, year: 45 };
  if (mode === "calendar") return { week: 1, month: 1, year: 2 };
  return { week: 3, month: 8, year: 10 };
}

function dayNumber(ms: number, zone: HistoryZone) {
  const [year, month, day] = dayKey(ms, zone).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY);
}

function pick(points: DatedClose[], target: number, maxDriftDays: number, zone: HistoryZone): number | null {
  const targetDay = dayNumber(target, zone);
  let best: DatedClose | null = null;
  let bestDist = Infinity;
  for (const point of points) {
    const dist = Math.abs(dayNumber(point.time, zone) - targetDay);
    if (dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best && bestDist <= maxDriftDays ? best.close : null;
}

/**
 * Comparison levels for an overview tile.
 * Trading sessions use the prior completed session and nearby session closes.
 * Calendar mode (24/7) uses the daily bar at the matching timestamp.
 * Monthly mode (CPI) uses published prints and leaves weekly gaps empty.
 * When `currentIsLatestPoint` is set, the newest point is the displayed value and is not reused as history.
 */
export function compareLevels(input: {
  points: DatedClose[];
  now?: number;
  mode?: HistoryMode;
  zone?: HistoryZone;
  previousClose?: number | null;
  currentIsLatestPoint?: boolean;
}): LevelComparisons {
  const now = input.now ?? Date.now();
  const mode = input.mode ?? "trading";
  const zone = input.zone ?? (mode === "trading" ? "et" : "utc");
  const sorted = input.points
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.close))
    .sort((a, b) => a.time - b.time);
  const today = dayKey(now, zone);
  const hasToday = sorted.some((point) => dayKey(point.time, zone) === today);
  let currentAt = sorted.length ? sorted.length - 1 : -1;
  if (!input.currentIsLatestPoint && hasToday) {
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (dayKey(sorted[i].time, zone) === today) {
        currentAt = i;
        break;
      }
    }
  }
  const prior = currentAt >= 0 ? sorted.slice(0, currentAt) : sorted;
  const anchor = input.currentIsLatestPoint && sorted.length ? sorted[sorted.length - 1].time : now;
  const span = drifts(mode);
  const explicit = input.previousClose;
  const previousClose = explicit != null && Number.isFinite(explicit) ? explicit : prior.length ? prior[prior.length - 1].close : null;
  return {
    previousClose,
    oneWeekAgo: pick(prior, anchor - 7 * DAY, span.week, zone),
    oneMonthAgo: pick(prior, anchor - 30 * DAY, span.month, zone),
    oneYearAgo: pick(prior, anchor - 365 * DAY, span.year, zone),
  };
}
