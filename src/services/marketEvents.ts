import { CACHE_TTL, getSettings } from "@/src/config/env";
import { EST_LABEL, formatEstDateTime } from "@/src/lib/easternTime";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { collectRawCalendarEvents } from "@/src/providers/economicCalendar";
import { mergeMarketEvents, weekRangeLabel, type MarketEvent } from "@/src/engines/marketEvents";

const LIVE_KEY = "market-events:week:v5";
const STALE_KEY = "market-events:week:last:v5";
const LIVE_TTL = CACHE_TTL.events ?? 300;
const STALE_TTL = 86_400;

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

function payload(events: MarketEvent[], sources: string[], status: MarketEventsPayload["data_status"], updated: Date, error?: string): MarketEventsPayload {
  return {
    week_label: weekRangeLabel(updated),
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

export async function buildMarketEvents(now = new Date()): Promise<MarketEventsPayload> {
  const hit = cacheGet<{ payload: MarketEventsPayload }>(LIVE_KEY);
  if (hit?.payload) return hit.payload;

  try {
    const collected = await collectRawCalendarEvents();
    const events = mergeMarketEvents(collected.rows, now);
    const hadRows = collected.rows.length > 0;
    const status: MarketEventsPayload["data_status"] =
      events.length || hadRows || (collected.sources.length && !collected.errors.length) ? "LIVE" : "UNAVAILABLE";
    const body = payload(
      events,
      collected.sources,
      status,
      now,
      events.length
        ? undefined
        : collected.errors.length
          ? collected.errors.join(" | ")
          : status === "UNAVAILABLE"
            ? "No live calendar source returned events."
            : undefined,
    );
    cacheSet(LIVE_KEY, { payload: body }, events.length ? LIVE_TTL : 15);
    if (events.length) cacheSet(STALE_KEY, { payload: body }, STALE_TTL);
    return body;
  } catch (err) {
    const stale = cacheGet<{ payload: MarketEventsPayload }>(STALE_KEY);
    if (stale?.payload) {
      return {
        ...stale.payload,
        data_status: "STALE",
        error: err instanceof Error ? err.message : String(err),
      };
    }
    return payload([], [], "UNAVAILABLE", now, err instanceof Error ? err.message : String(err));
  }
}

export function marketEventsSyncMeta() {
  return {
    cache_ttl_seconds: LIVE_TTL,
    algorithm_version: getSettings().algorithmVersion,
    time_zone_label: EST_LABEL,
  };
}
