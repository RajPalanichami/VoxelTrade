"use client";

import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import type { MarketEvent } from "@/lib/marketEvents";

const IMPACT: Record<string, string> = {
  Critical: "bg-bear/20 text-bear border-bear/40",
  High: "bg-warn/20 text-warn border-warn/40",
  Medium: "bg-accent/15 text-accent border-accent/40",
  Low: "bg-slate-700/40 text-slate-300 border-line",
};

const STATUS: Record<string, string> = {
  upcoming: "text-accent",
  released: "text-bull",
  cancelled: "text-bear",
  delayed: "text-warn",
};

export function MarketEvents() {
  const { data, isLoading, error } = useQuery({
    queryKey: keys.marketEvents,
    queryFn: api.marketEvents,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const payload = data?.data;

  return (
    <div className="panel overflow-hidden h-full flex flex-col max-h-[368px]" data-testid="market-events">
      <div className="px-4 py-3 border-b border-line">
        <div className="text-[11px] tracking-[0.18em] text-slate-500">MARKET EVENTS THIS WEEK</div>
        {payload?.week_label && <div className="text-[11px] text-slate-400 mt-1">{payload.week_label}</div>}
        <div className="text-[11px] text-slate-500 mt-1" data-testid="market-events-updated">
          Last Updated: {payload?.last_updated_est || "synchronizing…"}
        </div>
      </div>
      {isLoading && <div className="p-6 text-sm text-slate-400">Synchronizing live market events…</div>}
      {error && !payload && (
        <div className="p-6 text-sm text-bear">
          DATA UNAVAILABLE — {(error as Error).message}. Event dates are never invented.
        </div>
      )}
      {payload?.data_status === "UNAVAILABLE" && (
        <div className="p-6 text-sm text-bear">
          DATA UNAVAILABLE — {payload.error || "No live calendar source returned events."} Event dates are never invented.
        </div>
      )}
      {payload && payload.data_status !== "UNAVAILABLE" && (
        <div className="divide-y divide-white/5 flex-1 min-h-0 overflow-y-auto">
          {payload.events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
          {!payload.events.length && (
            <div className="p-6 text-sm text-slate-500">
              {payload.error
                ? `DATA UNAVAILABLE — ${payload.error}`
                : "No U.S. events matched this week's live calendar window."}
            </div>
          )}
        </div>
      )}
      {payload?.data_status === "STALE" && (
        <div className="px-4 py-2 text-[11px] text-warn border-t border-line">Showing last synchronized calendar while a live refresh is delayed.</div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: MarketEvent }) {
  return (
    <article className="px-4 py-3" data-testid="market-event-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white leading-snug">{event.name}</h3>
        <span className={`text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded border ${IMPACT[event.impact] || IMPACT.Medium}`}>
          Impact: {event.impact}
        </span>
      </div>
      <div className="text-[12px] text-slate-300 mt-1">{event.dateLabel}</div>
      <div className="text-[12px] text-slate-300">{event.timeLabel}</div>
      <div className="text-[11px] text-slate-500 mt-1">
        {event.category} · <span className={STATUS[event.status] || "text-slate-400"}>{event.status}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
        <Metric label="Previous" value={event.previous} />
        <Metric label="Forecast" value={event.forecast} />
        <Metric label="Actual" value={event.actual} />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.14em] text-slate-500">{label}</div>
      <div className="text-slate-200 tick">{value || "—"}</div>
    </div>
  );
}
