"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { PulseRange } from "@/lib/pulse";
import { PulseShell } from "./PulseShell";
import { IndexCards } from "./IndexCards";
import { PerformanceChart } from "./PerformanceChart";
import { Movers } from "./Movers";
import { PulseNews } from "./PulseNews";
import { KeyMarketTable } from "./KeyMarketTable";
import { SectorList } from "./SectorList";
import { Takeaways } from "./Takeaways";

export function PulseView({ variant = "overview" }: { variant?: "overview" | "markets" | "sectors" }) {
  const [range, setRange] = useState<PulseRange>("1W");
  const { data, isLoading, error } = useQuery({
    queryKey: keys.pulse(range),
    queryFn: () => api.pulse(range),
    staleTime: 30_000,
  });
  const p = data?.data;

  return (
    <PulseShell updated={p?.last_updated}>
      {isLoading && <div className="panel p-10 text-center text-slate-400">Loading live market pulse…</div>}
      {error && (
        <div className="panel p-6 text-bear text-sm">
          DATA UNAVAILABLE — {(error as Error).message}. Values are never invented.
        </div>
      )}
      {p && variant === "overview" && (
        <>
          <IndexCards cards={p.cards} />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr] gap-4">
            <div className="md:col-span-2 xl:col-span-1">
              <PerformanceChart series={p.performance} range={range} onRange={setRange} />
            </div>
            <Movers gainers={p.movers.gainers} losers={p.movers.losers} active={p.movers.active} />
            <PulseNews items={p.news} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr] gap-4">
            <div className="md:col-span-2 xl:col-span-1 min-w-0">
              <KeyMarketTable rows={p.table} />
            </div>
            <SectorList sectors={p.sectors} />
            <Takeaways items={p.takeaways} />
          </div>
        </>
      )}
      {p && variant === "markets" && (
        <>
          <IndexCards cards={p.cards} />
          <PerformanceChart series={p.performance} range={range} onRange={setRange} />
          <KeyMarketTable rows={p.table} />
          <Movers gainers={p.movers.gainers} losers={p.movers.losers} active={p.movers.active} />
        </>
      )}
      {p && variant === "sectors" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectorList sectors={p.sectors} />
          <Takeaways items={p.takeaways} />
        </div>
      )}
    </PulseShell>
  );
}
