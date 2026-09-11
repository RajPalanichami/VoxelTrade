"use client";

import { useState } from "react";
import { PulseMover } from "@/lib/pulse";
import { pct, usd } from "@/lib/format";
import { useTerminal } from "@/components/layout/AppShell";

type Tab = "gainers" | "losers" | "active";

export function Movers({
  gainers,
  losers,
  active,
}: {
  gainers: PulseMover[];
  losers: PulseMover[];
  active: PulseMover[];
}) {
  const [tab, setTab] = useState<Tab>("gainers");
  const { setSymbol } = useTerminal();
  const rows = tab === "gainers" ? gainers : tab === "losers" ? losers : active;
  return (
    <div className="panel overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] tracking-[0.18em] text-slate-500">TOP MARKET MOVERS</div>
          <div className="text-[9px] tracking-[0.16em] text-slate-500">MARKET-WIDE</div>
        </div>
        <div className="flex gap-2 mt-2">
          {(["gainers", "losers", "active"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs capitalize px-2 py-1 rounded ${tab === t ? "bg-accent/20 text-white" : "text-slate-500"}`}
            >
              {t === "active" ? "Most Active" : t}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <button
            key={r.symbol}
            onClick={() => setSymbol(r.symbol)}
            className="w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-white/5"
          >
            <div className="min-w-0">
              <div className="text-sm text-white font-semibold">{r.symbol}</div>
              {r.name && <div className="text-[11px] text-slate-500 truncate">{r.name}</div>}
              <div className="text-[11px] text-slate-500 tick">{usd(r.price)}</div>
            </div>
            <div className={`text-sm tick text-right ${r.change_percent >= 0 ? "text-bull" : "text-bear"}`}>
              {r.change != null ? `${r.change > 0 ? "+" : ""}${r.change.toFixed(2)}` : ""}
              <div>
                {r.change_percent >= 0 ? "▲" : "▼"} {pct(r.change_percent)}
              </div>
            </div>
          </button>
        ))}
        {!rows.length && <div className="p-6 text-slate-500 text-sm">No mover data loaded.</div>}
      </div>
    </div>
  );
}
