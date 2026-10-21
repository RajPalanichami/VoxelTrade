import { randomUUID } from "crypto";
import { getSettings } from "@/src/config/env";
import { EST_LABEL, formatEstDateTime, isoDateEastern, easternWeekWindow, isFridayAfternoonEastern, isSaturdayEastern, nextEasternWeekAnchor } from "@/src/lib/easternTime";
import { collectRawCalendarEvents } from "@/src/providers/economicCalendar";
import { filterUpcomingThisWeek, mergeMarketEvents, weekRangeLabel, type MarketEvent } from "@/src/engines/marketEvents";
import {
  claimMarketEventsLock,
  readMarketEventsRecord,
  saveMarketEventsRecord,
  type MarketEventsStoreRecord,
} from "@/src/repositories/store";

/**
 * Demand-driven weekly refresh. There is no cron and no background timer.
 * The first server request after lastSuccessfulRefreshAt is seven days old
 * claims a lock in the shared JSON store and fetches once. Later requests
 * reuse that payload. A cold Vercel instance has an empty /tmp store, so the
 * first request on that instance fetches again; /tmp is not shared across
 * instances or deploys.
 */
export const MARKET_EVENTS_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_LEASE_MS = 2 * 60 * 1000;
const BACKOFF_BASE_MS = 30 * 60 * 1000;
const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

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

function storedPayload(record: MarketEventsStoreRecord | null): MarketEventsPayload | null {
  const body = record?.payload as MarketEventsPayload | null;
  return isValidPayload(body) ? body : null;
}

export function refreshDue(record: MarketEventsStoreRecord | null, now: Date) {
  if (!record?.lastSuccessfulRefreshAt || !storedPayload(record)) return true;
  const age = now.getTime() - Date.parse(record.lastSuccessfulRefreshAt);
  return !Number.isFinite(age) || age >= MARKET_EVENTS_REFRESH_MS;
}

function inBackoff(record: MarketEventsStoreRecord | null, now: Date) {
  if (!record?.backoffUntil) return false;
  const until = Date.parse(record.backoffUntil);
  return Number.isFinite(until) && until > now.getTime();
}

function backoffMs(failureCount: number) {
  const shift = Math.max(0, Math.min(failureCount - 1, 6));
  return Math.min(BACKOFF_BASE_MS * 2 ** shift, BACKOFF_MAX_MS);
}

function staleCopy(body: MarketEventsPayload, error: string | null | undefined, now: Date): MarketEventsPayload {
  return presentWeek({ ...body, data_status: "STALE", error: error || body.error || "Calendar refresh is delayed." }, now);
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 2): Promise<T> {
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

function recordFailure(now: Date, message: string) {
  const current = readMarketEventsRecord();
  const failureCount = (current?.failureCount || 0) + 1;
  const next: MarketEventsStoreRecord = {
    schemaVersion: 1,
    payload: current?.payload ?? null,
    weekStart: current?.weekStart || "",
    lastSuccessfulRefreshAt: current?.lastSuccessfulRefreshAt ?? null,
    nextEligibleAt: current?.nextEligibleAt ?? null,
    lastFailureAt: now.toISOString(),
    lastError: message,
    backoffUntil: new Date(now.getTime() + backoffMs(failureCount)).toISOString(),
    failureCount,
    lock: null,
  };
  saveMarketEventsRecord(next);
  return next;
}

function recordSuccess(body: MarketEventsPayload, weekRef: Date, now: Date) {
  const next: MarketEventsStoreRecord = {
    schemaVersion: 1,
    payload: body,
    weekStart: weekStartKey(weekRef),
    lastSuccessfulRefreshAt: now.toISOString(),
    nextEligibleAt: new Date(now.getTime() + MARKET_EVENTS_REFRESH_MS).toISOString(),
    lastFailureAt: null,
    lastError: null,
    backoffUntil: null,
    failureCount: 0,
    lock: null,
  };
  saveMarketEventsRecord(next);
  return next;
}

async function fetchCalendar(now: Date): Promise<MarketEventsPayload> {
  const weekRef = displayWeekRef(now);
  const nextWeek = shouldPrepareNextWeek(now);
  const collected = await withRetry("market-events", () => collectRawCalendarEvents(weekRef));
  const merged = (nextWeek ? mergeMarketEvents(collected.rows, now, weekRef) : mergeMarketEvents(collected.rows, now)).filter(
    (event) => !nextWeek || event.status !== "cancelled",
  );
  if (!collectionUsable(collected, merged, nextWeek)) {
    throw new Error(collected.errors.join(" | ") || "Calendar refresh was not usable.");
  }
  const upcoming = filterUpcomingThisWeek(merged, now, weekRef);
  const hadRows = collected.rows.length > 0;
  const status: MarketEventsPayload["data_status"] =
    upcoming.length || hadRows || (collected.sources.length > 0 && collected.errors.length === 0) ? "LIVE" : "UNAVAILABLE";
  const body = payload(
    merged,
    collected.sources,
    status,
    now,
    weekRef,
    upcoming.length
      ? undefined
      : collected.errors.length
        ? collected.errors.join(" | ")
        : status === "UNAVAILABLE"
          ? nextWeek
            ? "Next week's calendar is not available yet."
            : "No live calendar source returned events."
          : undefined,
  );
  if (status === "UNAVAILABLE" || !isValidPayload(body)) {
    throw new Error(body.error || "Calendar response failed validation.");
  }
  return body;
}

export function getStoredMarketEvents(now = new Date()): MarketEventsPayload | null {
  const body = storedPayload(readMarketEventsRecord());
  return body ? presentWeek(body, now) : null;
}

export async function refreshMarketEvents(now = new Date()): Promise<MarketEventsPayload> {
  const existing = readMarketEventsRecord();
  const prior = storedPayload(existing);
  if (!refreshDue(existing, now)) return presentWeek(prior as MarketEventsPayload, now);
  if (inBackoff(existing, now)) {
    if (prior) return staleCopy(prior, existing?.lastError, now);
    return payload([], [], "UNAVAILABLE", now, displayWeekRef(now), existing?.lastError || "Calendar refresh is backing off.");
  }
  const claim = claimMarketEventsLock(now, randomUUID(), LOCK_LEASE_MS, (record) => refreshDue(record, now) && !inBackoff(record, now));
  if (!claim.claimed) {
    const held = storedPayload(claim.record);
    if (held) return staleCopy(held, claim.record?.lastError, now);
    return payload([], [], "UNAVAILABLE", now, displayWeekRef(now), "A market-events refresh is already in progress.");
  }
  try {
    const body = await fetchCalendar(now);
    recordSuccess(body, displayWeekRef(now), now);
    return presentWeek(body, now);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[market-events] refresh failed; previous snapshot kept", { error: message });
    const failed = recordFailure(now, message);
    const kept = storedPayload(failed);
    if (kept) return staleCopy(kept, message, now);
    return payload([], [], "UNAVAILABLE", now, displayWeekRef(now), message);
  }
}

export async function getMarketEvents(now = new Date()): Promise<MarketEventsPayload> {
  if (currentInflight) return currentInflight.then((body) => presentWeek(body, now));
  const job = refreshMarketEvents(now).finally(() => {
    if (currentInflight === job) currentInflight = null;
  });
  currentInflight = job;
  return job;
}

export const buildMarketEvents = getMarketEvents;

export async function prepareNextWeekMarketEvents(now = new Date()): Promise<PreparedSnapshot | null> {
  const nextStart = weekStartKey(nextEasternWeekAnchor(now));
  await getMarketEvents(now);
  const record = readMarketEventsRecord();
  const body = storedPayload(record);
  if (!record || !body || record.weekStart !== nextStart) return null;
  return { weekStart: record.weekStart, preparedAt: record.lastSuccessfulRefreshAt || body.last_updated, payload: body };
}

export function resetMarketEventsRuntime() {
  currentInflight = null;
}

export function marketEventsSyncMeta() {
  return {
    cache_ttl_seconds: Math.round(MARKET_EVENTS_REFRESH_MS / 1000),
    algorithm_version: getSettings().algorithmVersion,
    time_zone_label: EST_LABEL,
  };
}
