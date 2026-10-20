"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SECTOR_PAGES } from "@/lib/sectors";
import { pct, usd } from "@/lib/format";
import { useAuth } from "@/components/providers/AuthProvider";

export function OverviewHub() {
  const { user } = useAuth();
  const watchQ = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist,
    staleTime: 30_000,
    enabled: Boolean(user),
  });
  const watch = ((watchQ.data?.data || []) as { symbol: string; price?: number; change_percent?: number; error?: string }[]).slice(0, 6);

  return (
    <section className="space-y-4" data-testid="overview-hub">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">MARKET SUMMARY</div>
            <div className="flex gap-3 text-[11px]">
              <Link href="/markets" className="text-accent">
                Markets Pulse
              </Link>
              <Link href="/market" className="text-accent">
                Market &amp; Macro
              </Link>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            Live index, movers, and events stay in the tiles above. Open the full Market pages for the complete pulse and
            macro strip.
          </p>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">SECTOR SUMMARY</div>
            <Link href="/sectors" className="text-[11px] text-accent">
              All sectors
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SECTOR_PAGES.map((s) => (
              <Link
                key={s.slug}
                href={`/sector/${s.slug}`}
                className="px-2 py-1.5 rounded bg-white/5 text-xs text-slate-300 hover:text-white hover:bg-white/10"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">WATCHLIST SUMMARY</div>
            <Link href="/watchlist" className="text-[11px] text-accent">
              Open watchlist
            </Link>
          </div>
          {!user && <p className="text-sm text-slate-400">Sign in to manage a personal watchlist.</p>}
          {user && watch.length === 0 && <p className="text-sm text-slate-400">No symbols saved yet.</p>}
          {watch.map((row) => (
            <div key={row.symbol} className="flex items-center justify-between py-1 text-sm">
              <span className="font-semibold">{row.symbol}</span>
              <span className={`tick ${ (row.change_percent || 0) >= 0 ? "text-bull" : "text-bear"}`}>
                {row.price != null ? usd(row.price) : "—"} {pct(row.change_percent)}
              </span>
            </div>
          ))}
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">LATEST NEWS</div>
            <Link href="/news" className="text-[11px] text-accent">
              Full news
            </Link>
          </div>
          <p className="text-sm text-slate-400">Headline tape is in the news panel above. Open News for the selected ticker.</p>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">TOOLS</div>
            <Link href="/tools" className="text-[11px] text-accent">
              All tools
            </Link>
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            <Link href="/compare" className="text-slate-300 hover:text-white">
              Ticker Comparison
            </Link>
            <Link href="/backtesting" className="text-slate-300 hover:text-white">
              Backtesting
            </Link>
            <Link href="/alerts" className="text-slate-300 hover:text-white">
              Alerts
            </Link>
            <Link href="/options" className="text-slate-300 hover:text-white">
              Options Visualizer
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
