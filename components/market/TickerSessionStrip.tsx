"use client";

import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { compact, pct, usd } from "@/lib/format";
import { AvailabilityText, SessionBadge } from "./SessionBadge";

export function TickerSessionStrip({ symbol, compactMode = false }: { symbol: string; compactMode?: boolean }) {
  const { data } = useQuery({
    queryKey: keys.marketContext(symbol),
    queryFn: ({ signal }) => api.marketContext(symbol, signal),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const ctx = data?.data;
  if (!ctx || ctx.symbol !== symbol.toUpperCase()) return null;
  const pre = ctx.sessions.preMarket;
  const on = ctx.sessions.overnight;
  return (
    <div className="panel px-3 py-2 text-[11px]" data-testid="ticker-session-strip">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tick text-slate-200">{usd(ctx.quote.price)}</span>
        <SessionBadge session={ctx.session} />
        <span className="text-slate-500">Prev close {usd(ctx.previousRegularClose)}</span>
        <span className={ctx.quote.change != null && ctx.quote.change >= 0 ? "text-bull" : "text-bear"}>
          {ctx.quote.change != null ? `${ctx.quote.change >= 0 ? "+" : ""}${ctx.quote.change.toFixed(2)} (${pct(ctx.quote.changePercent)})` : "—"}
        </span>
        <span className="text-slate-600">{ctx.quote.timestampEst}</span>
        {ctx.dataQuality.stale ? <span className="text-bear">STALE DATA</span> : null}
      </div>
      {!compactMode && (
        <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-400">
          <div>
            Overnight <AvailabilityText value={on.availability} />
            <div className="text-slate-300">H {usd(on.high)} · L {usd(on.low)} · Vol {compact(on.volume)}</div>
          </div>
          <div>
            Premarket <AvailabilityText value={pre.availability} />
            <div className="text-slate-300">H {usd(pre.high)} · L {usd(pre.low)} · Vol {compact(pre.volume)}</div>
          </div>
          <div>
            Regular <AvailabilityText value={ctx.sessions.regular.availability} />
            <div className="text-slate-300">VWAP {usd(ctx.sessions.regular.vwap)}</div>
          </div>
          <div>
            After-hours <AvailabilityText value={ctx.sessions.afterHours.availability} />
            <div className="text-slate-300">Last {usd(ctx.sessions.afterHours.last)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
