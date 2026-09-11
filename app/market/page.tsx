"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MarketStrip } from "@/components/market/MarketStrip";
import { pct, money } from "@/lib/format";
import { MarketOverview } from "@/lib/types";

export default function MarketPage() {
  const { data } = useQuery({ queryKey: ["market"], queryFn: api.market, refetchInterval: 60_000 });
  const m = data?.data as MarketOverview & { treasury?: { yield?: number; change_1d?: number; trend_20d?: string; source?: string }; sectors?: Record<string, { etf: string; price: number; change_percent?: number | null }> };
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Market & Macro</h1>
      <MarketStrip market={m} />
      {m?.treasury && (
        <div className="panel p-4">
          <div className="text-[11px] tracking-widest text-slate-500 mb-2">10-YEAR TREASURY (DGS10)</div>
          <div className="text-2xl tick">{m.treasury.yield?.toFixed(2)}%</div>
          <div className="text-sm text-slate-400">
            1d {m.treasury.change_1d?.toFixed(3)} · trend {m.treasury.trend_20d} · source {m.treasury.source}
          </div>
          <p className="text-xs text-slate-500 mt-2">Direction matters more than absolute yield level.</p>
        </div>
      )}
      {m?.sectors && (
        <div className="panel p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(m.sectors).map(([name, s]) => (
            <div key={name} className="bg-white/5 rounded p-3">
              <div className="text-slate-400 text-xs">{name} · {s.etf}</div>
              <div className="tick">{money(s.price)}</div>
              <div className={(s.change_percent || 0) >= 0 ? "text-bull" : "text-bear"}>{pct(s.change_percent)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
