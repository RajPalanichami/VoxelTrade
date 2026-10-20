"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { pct, toneClass, usd, signalLabel } from "@/lib/format";
import { TIMEFRAMES } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAuthUi } from "@/components/providers/AuthUiProvider";
import { takePendingAuthAction } from "@/lib/pendingAuth";
import { SessionBadge } from "@/components/market/SessionBadge";
import type { TickerMarketContext } from "@/lib/extendedHours";

export default function WatchlistPage() {
  const qc = useQueryClient();
  const { setSymbol } = useTerminal();
  const { user, loading } = useAuth();
  const { requireAccount } = useAuthUi();
  const { data, isLoading } = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist });
  const [showExtended, setShowExtended] = useState(false);
  const add = useMutation({
    mutationFn: (s: string) => api.addWatch(s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const del = useMutation({
    mutationFn: (s: string) => api.delWatch(s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const rows = (data?.data || []) as {
    symbol: string;
    name?: string;
    price?: number;
    change_percent?: number;
    timeframes?: Record<string, string>;
    error?: string;
  }[];
  const extended = useQueries({
    queries: showExtended
      ? rows.map((r) => ({
          queryKey: keys.marketContext(r.symbol),
          queryFn: ({ signal }: { signal?: AbortSignal }) => api.marketContext(r.symbol, signal),
          staleTime: 15_000,
        }))
      : [],
  });
  const extendedBySymbol = Object.fromEntries(
    rows.map((r, i) => [r.symbol, (extended[i]?.data?.data || null) as TickerMarketContext | null]),
  );

  function needsLogin() {
    if (loading || user) return false;
    requireAccount({
      title: "Create Watchlist",
      message: "Please log in to create and manage your watchlist.",
      next: "/watchlist",
      pending: { kind: "add-watch" },
    });
    return true;
  }

  function addTicker(preset?: string) {
    if (needsLogin()) return;
    const s = preset || prompt("Add ticker");
    if (s) add.mutate(s.toUpperCase());
  }

  useEffect(() => {
    if (!user) return;
    const pending = takePendingAuthAction();
    if (pending?.kind === "add-watch") addTicker(pending.symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Watchlist</h1>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-400 inline-flex items-center gap-1">
            <input type="checkbox" checked={showExtended} onChange={(e) => setShowExtended(e.target.checked)} />
            Extended hours
          </label>
          <button className="text-xs border border-line px-3 py-1.5 rounded" onClick={() => addTicker()}>
            Add ticker
          </button>
        </div>
      </div>
      {isLoading && <div className="panel p-8 text-slate-400">Scoring watchlist across 5 timeframes…</div>}
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-widest text-slate-500 border-b border-line">
            <tr>
              <th className="text-left px-3 py-2">TICKER</th>
              <th className="text-left px-3 py-2">PRICE</th>
              {showExtended && (
                <>
                  <th className="text-left px-3 py-2">SESSION</th>
                  <th className="text-left px-3 py-2">PM %</th>
                  <th className="text-left px-3 py-2">PM HIGH</th>
                  <th className="text-left px-3 py-2">PM LOW</th>
                </>
              )}
              {TIMEFRAMES.map((t) => (
                <th key={t.id} className="text-left px-3 py-2">
                  {t.id.toUpperCase()}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="border-b border-white/5">
                <td className="px-3 py-2">
                  <button className="text-left" onClick={() => setSymbol(r.symbol)}>
                    <div className="font-semibold">{r.symbol}</div>
                    <div className="text-[11px] text-slate-500">{r.name}</div>
                  </button>
                </td>
                <td className="px-3 py-2 tick">
                  {usd(extendedBySymbol[r.symbol]?.quote.price ?? r.price)}{" "}
                  <span className={toneClass(extendedBySymbol[r.symbol]?.quote.changePercent ?? r.change_percent)}>
                    {pct(extendedBySymbol[r.symbol]?.quote.changePercent ?? r.change_percent)}
                  </span>
                </td>
                {showExtended && (
                  <>
                    <td className="px-3 py-2"><SessionBadge session={extendedBySymbol[r.symbol]?.session} /></td>
                    <td className="px-3 py-2 tick">{pct(extendedBySymbol[r.symbol]?.sessions.preMarket.changePercent)}</td>
                    <td className="px-3 py-2 tick">{usd(extendedBySymbol[r.symbol]?.sessions.preMarket.high)}</td>
                    <td className="px-3 py-2 tick">{usd(extendedBySymbol[r.symbol]?.sessions.preMarket.low)}</td>
                  </>
                )}
                {TIMEFRAMES.map((t) => (
                  <td key={t.id} className={`px-3 py-2 font-semibold ${toneClass(r.timeframes?.[t.id])}`}>
                    {signalLabel(r.timeframes?.[t.id])}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <button
                    className="text-bear text-xs"
                    onClick={() => {
                      if (needsLogin()) return;
                      del.mutate(r.symbol);
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
