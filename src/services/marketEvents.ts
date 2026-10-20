import fs from "fs";
import path from "path";
import { CACHE_TTL, getSettings } from "@/src/config/env";
import { EST_LABEL, formatEstDateTime, isoDateEastern, easternWeekWindow, isFridayAfternoonEastern, isSaturdayEastern, nextEasternWeekAnchor } from "@/src/lib/easternTime";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { collectRawCalendarEvents } from "@/src/providers/economicCalendar";
import { filterUpcomingThisWeek, mergeMarketEvents, weekRangeLabel, type MarketEvent } from "@/src/engines/marketEvents";

const LIVE_KEY = "market-events:week:v7";
const STALE_KEY = "market-events:week:last:v7";
const LIVE_TTL = CACHE_TTL.events ?? 300;
const STALE_TTL = 86_400;
const LAST_GOOD_DISK = path.join(process.cwd(), "data", "market-events-last-good.json");
const NEXT_WEEK_DISK = path.join(process.cwd(), "data", "market-events-next-week.json");

export type MarketEventsPayload = {
  week_label: string;
  last_updated: string;
  last_updated_est: string;
  time_zone_label: string;
  events: MarketEvent[];
  source: string;
  sources: string[];
  data_status: "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";
  error?: string;
};

type PreparedSnapshot = {
  weekStart: string;
  preparedAt: string;
  payload: MarketEventsPayload;
};

let currentInflight: Promise<MarketEventsPayload> | null = null;
let nextInflight: Promise<PreparedSnapshot | null> | null = null;
let memoryNextWeek: PreparedSnapshot | null = null;

function inTest() {
  return Boolean(process.env.VITEST);
}

function payload(
  events: MarketEvent[],
  sources: string[],
  status: MarketEventsPayload["data_status"],
  updated: Date,
  weekRef: Date = updated,
  error?: string,
): MarketEventsPayload {
  return {
    week_label: weekRangeLabel(weekRef),
    last_updated: updated.toISOString(),
    last_updated_est: formatEstDateTime(updated),
    time_zone_label: EST_LABEL,
    events,
    source: sources.join(", ") || "none",
    sources,
    data_status: status,
    error,
  };
}

export function shouldPrepareNextWeek(now = new Date()) {
  return isFridayAfternoonEastern(now) || isSaturdayEastern(now);
}

export function displayWeekRef(now: Date) {
  return shouldPrepareNextWeek(now) ? nextEasternWeekAnchor(now) : now;
}

function presentWeek(body: MarketEventsPayload, now: Date): MarketEventsPayload {
  const weekRef = displayWeekRef(now);
  return {
    ...body,
    week_label: weekRangeLabel(weekRef),
    events: filterUpcomingThisWeek(body.events, now, weekRef),
  };
}

function weekStartKey(now: Date) {
  return isoDateEastern(easternWeekWindow(now).start);
}

function isValidPayload(body: MarketEventsPayload | null | undefined): body is MarketEventsPayload {
  if (!body || !Array.isArray(body.events) || !Array.isArray(body.sources)) return false;
  if (typeof body.week_label !== "string" || !body.week_label) return false;
  return body.events.every((event) => Boolean(event?.id && event.name && event.impact));
}

function collectionUsable(
  collected: { rows: unknown[]; sources: string[]; errors: string[] },
  merged: MarketEvent[],
  requireMerged = false,
) {
  if (!Array.isArray(merged)) return false;
  if (requireMerged) return merged.length > 0;
  if (collected.sources.length > 0 && collected.errors.length === 0) return true;
  if (merged.length > 0) return true;
  return collected.rows.length > 0 && collected.sources.length > 0;
}

function readDisk(file: string): PreparedSnapshot | null {
  if (inTest()) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as PreparedSnapshot;
    if (!parsed?.weekStart || !isValidPayload(parsed.payload)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDisk(file: string, snapshot: PreparedSnapshot) {
  if (inTest()) return;
  if (!isValidPayload(snapshot.payload)) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(snapshot));
  } catch {
    /* dest filesystem may be read-only */
  }
}

function rememberLastGood(body: MarketEventsPayload, weekRef: Date) {
  if (!isValidPayload(body) || body.data_status === "UNAVAILABLE") return;
  cacheSet(STALE_KEY, { payload: body, weekStart: weekStartKey(weekRef) }, STALE_TTL);
  writeDisk(LAST_GOOD_DISK, { weekStart: weekStartKey(weekRef), preparedAt: body.last_updated, payload: body });
}

function lastGoodForWeek(weekStart: string): MarketEventsPayload | null {
  const mem = cacheGet<{ payload: MarketEventsPayload; weekStart?: string }>(STALE_KEY);
  if (mem?.payload && isValidPayload(mem.payload) && (!mem.weekStart || mem.weekStart === weekStart)) {
    return mem.payload;
  }
  const disk = readDisk(LAST_GOOD_DISK);
  if (disk?.weekStart === weekStart && isValidPayload(disk.payload)) return disk.payload;
  const prepared = readDisk(NEXT_WEEK_DISK);
  if (prepared?.weekStart === weekStart && isValidPayload(prepared.payload)) return prepared.payload;
  return null;
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      console.warn("[market-events] retry", {
        label,
        attempt: i + 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function prepareNextWeekMarketEvents(now = new Date()): Promise<PreparedSnapshot | null> {
  const nextAnchor = nextEasternWeekAnchor(now);
  const nextStart = weekStartKey(nextAnchor);
  const existing = memoryNextWeek?.weekStart === nextStart && isValidPayload(memoryNextWeek.payload) ? memoryNextWeek : inTest() ? null : readDisk(NEXT_WEEK_DISK);
  const existingAgeMs = existing?.preparedAt ? Date.now() - Date.parse(existing.preparedAt) : Number.POSITIVE_INFINITY;
  const existingFresh = Boolean(
    existing &&
      existing.weekStart === nextStart &&
      isValidPayload(existing.payload) &&
      existing.payload.events.length >= 5 &&
      Number.isFinite(existingAgeMs) &&
      existingAgeMs >= 0 &&
      existingAgeMs < 15 * 60 * 1000,
  );
  if (existingFresh) return existing;
  if (nextInflight) return nextInflight;
  nextInflight = (async () => {
    try {
      const collected = await withRetry("next-week calendar", () => collectRawCalendarEvents(nextAnchor));
      const merged = mergeMarketEvents(collected.rows, now, nextAnchor).filter((event) => event.status !== "cancelled");
      if (!collectionUsable(collected, merged, true)) {
        console.warn("[market-events] next-week prepare produced no usable dataset; previous snapshot kept", {
          weekStart: nextStart,
          errors: collected.errors,
        });
        return existing && existing.weekStart === nextStart ? existing : null;
      }
      const body = payload(merged, collected.sources, "LIVE", now, nextAnchor);
      if (!isValidPayload(body)) {
        console.warn("[market-events] next-week payload failed validation; previous snapshot kept", { weekStart: nextStart });
        return existing && existing.weekStart === nextStart ? existing : null;
      }
      const snapshot: PreparedSnapshot = { weekStart: nextStart, preparedAt: now.toISOString(), payload: body };
      memoryNextWeek = snapshot;
      writeDisk(NEXT_WEEK_DISK, snapshot);
      console.info("[market-events] prepared next week", {
        weekStart: nextStart,
        events: merged.length,
        sources: collected.sources,
      });
      return snapshot;
    } catch (err) {
      console.warn("[market-events] next-week prepare failed; previous snapshot kept", {
        weekStart: nextStart,
        error: err instanceof Error ? err.message : String(err),
      });
      return existing && existing.weekStart === nextStart ? existing : null;
    } finally {
      nextInflight = null;
    }
  })();
  return nextInflight;
}

async function loadCurrentWeek(now: Date): Promise<MarketEventsPayload> {
  const weekStart = weekStartKey(now);
  const hit = cacheGet<{ payload: MarketEventsPayload }>(LIVE_KEY);
  if (hit?.payload && isValidPayload(hit.payload)) return presentWeek(hit.payload, now);

  try {
    const collected = await withRetry("current-week calendar", () => collectRawCalendarEvents(now));
    const merged = mergeMarketEvents(collected.rows, now);
    if (!collectionUsable(collected, merged)) {
      const prior = lastGoodForWeek(weekStart);
      if (prior) {
        return presentWeek({ ...prior, data_status: "STALE", error: collected.errors.join(" | ") || "Calendar refresh was not usable." }, now);
      }
    }
    const events = filterUpcomingThisWeek(merged, now);
    const hadRows = collected.rows.length > 0;
    const status: MarketEventsPayload["data_status"] =
      events.length || hadRows || (collected.sources.length && !collected.errors.length) ? "LIVE" : "UNAVAILABLE";
    const body = payload(
      merged,
      collected.sources,
      status,
      now,
      now,
      events.length
        ? undefined
        : collected.errors.length
          ? collected.errors.join(" | ")
          : status === "UNAVAILABLE"
            ? "No live calendar source returned events."
            : undefined,
    );
    if (status === "UNAVAILABLE") {
      const prior = lastGoodForWeek(weekStart);
      if (prior) return presentWeek({ ...prior, data_status: "STALE", error: body.error }, now);
      return presentWeek(body, now);
    }
    cacheSet(LIVE_KEY, { payload: body }, events.length ? LIVE_TTL : 15);
    if (isValidPayload(body)) rememberLastGood(body, now);
    return presentWeek(body, now);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const prior = lastGoodForWeek(weekStart);
    if (prior) {
      return presentWeek({ ...prior, data_status: "STALE", error: message }, now);
    }
    return payload([], [], "UNAVAILABLE", now, now, message);
  }
}

export async function buildMarketEvents(now = new Date()): Promise<MarketEventsPayload> {
  if (currentInflight) return currentInflight.then((body) => presentWeek(body, now));
  currentInflight = (async () => {
    try {
      if (shouldPrepareNextWeek(now)) {
        const prepared = await prepareNextWeekMarketEvents(now);
        if (prepared?.payload && isValidPayload(prepared.payload)) {
          return presentWeek(prepared.payload, now);
        }
        return payload(
          [],
          [],
          "UNAVAILABLE",
          now,
          displayWeekRef(now),
          "Next week's calendar is not available yet.",
        );
      }
      return await loadCurrentWeek(now);
    } finally {
      currentInflight = null;
    }
  })();
  return currentInflight;
}

export function resetMarketEventsRuntime() {
  currentInflight = null;
  nextInflight = null;
  memoryNextWeek = null;
}

export function marketEventsSyncMeta() {
  return {
    cache_ttl_seconds: LIVE_TTL,
    algorithm_version: getSettings().algorithmVersion,
    time_zone_label: EST_LABEL,
  };
}
