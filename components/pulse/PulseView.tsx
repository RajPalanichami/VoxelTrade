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
import { MarketEvents } from "./MarketEvents";
import { OverviewHub } from "./OverviewHub";
import { MarketHistorySection } from "./MarketHistorySection";

function PulsePlaceholder({ label }: { label: string }) {
  return <div className="panel p-6 text-sm text-slate-500">{label}</div>;
}

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
      {error && !p && (
        <div className="panel p-6 text-bear text-sm">
          DATA UNAVAILABLE — {(error as Error).message}. Values are never invented.
        </div>
      )}
      {variant === "overview" && (
        <>
          {p ? (
            <IndexCards cards={p.cards} gauge={p.gauge} gaugeLoading={!p.gauge} />
          ) : (
            <PulsePlaceholder label={isLoading ? "Loading market tiles…" : "Market tiles unavailable."} />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr] gap-4">
            <div className="md:col-span-2 xl:col-span-1 min-w-0">
              {p ? (
                <PerformanceChart series={p.performance} range={range} onRange={setRange} />
              ) : (
                <PulsePlaceholder label={isLoading ? "Loading performance…" : "Performance unavailable."} />
              )}
            </div>
            <MarketEvents />
            {p ? <PulseNews items={p.news} /> : <PulsePlaceholder label={isLoading ? "Loading news…" : "News unavailable."} />}
          </div>
          {p && (
            <>
              <Movers
                layout="band"
                gainers={p.movers.gainers}
                losers={p.movers.losers}
                active={p.movers.active}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr] gap-4">
                <div className="md:col-span-2 xl:col-span-1 min-w-0">
                  <KeyMarketTable rows={p.table} />
                </div>
                <SectorList sectors={p.sectors} />
                <Takeaways items={p.takeaways} />
              </div>
              <OverviewHub />
            </>
          )}
          <MarketHistorySection />
        </>
      )}
      {variant === "markets" && (
        <>
          {p ? (
            <>
              <IndexCards cards={p.cards} gauge={p.gauge} gaugeLoading={!p.gauge} />
              <PerformanceChart series={p.performance} range={range} onRange={setRange} />
              <KeyMarketTable rows={p.table} />
              <Movers gainers={p.movers.gainers} losers={p.movers.losers} active={p.movers.active} />
            </>
          ) : (
            <PulsePlaceholder label={isLoading ? "Loading live market pulse…" : "Market pulse unavailable."} />
          )}
        </>
      )}
      {variant === "sectors" && (
        p ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectorList sectors={p.sectors} />
            <Takeaways items={p.takeaways} />
          </div>
        ) : (
          <PulsePlaceholder label={isLoading ? "Loading sectors…" : "Sectors unavailable."} />
        )
      )}
    </PulseShell>
  );
}
