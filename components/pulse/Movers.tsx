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
  layout = "panel",
}: {
  gainers: PulseMover[];
  losers: PulseMover[];
  active: PulseMover[];
  layout?: "panel" | "band";
}) {
  const [tab, setTab] = useState<Tab>("gainers");
  const { setSymbol } = useTerminal();
  const rows = tab === "gainers" ? gainers : tab === "losers" ? losers : active;

  if (layout === "band") {
    return (
      <div className="panel overflow-hidden" data-testid="top-market-movers">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
          <div className="text-[11px] tracking-[0.18em] text-slate-500">TOP MARKET MOVERS</div>
          <div className="text-[9px] tracking-[0.16em] text-slate-500">MARKET-WIDE</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-y md:divide-y-0 divide-white/5">
          <MoverColumn title="Gainers" rows={gainers} onPick={setSymbol} />
          <MoverColumn title="Losers" rows={losers} onPick={setSymbol} />
          <MoverColumn title="Most Active" rows={active} onPick={setSymbol} />
        </div>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden h-full flex flex-col" data-testid="top-market-movers">
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
      <div className="divide-y divide-white/5 flex-1 min-h-0 overflow-y-auto">
        {rows.map((r) => (
          <MoverRow key={r.symbol} row={r} onPick={setSymbol} />
        ))}
        {!rows.length && <div className="p-6 text-slate-500 text-sm">No mover data loaded.</div>}
      </div>
    </div>
  );
}

function MoverColumn({ title, rows, onPick }: { title: string; rows: PulseMover[]; onPick: (symbol: string) => void }) {
  return (
    <div className="min-w-0 flex flex-col">
      <div className="px-4 py-2 text-[11px] tracking-[0.16em] text-slate-500 border-b border-white/5">{title.toUpperCase()}</div>
      <div className="divide-y divide-white/5 max-h-[240px] overflow-y-auto">
        {rows.map((r) => (
          <MoverRow key={r.symbol} row={r} onPick={onPick} compact />
        ))}
        {!rows.length && <div className="p-4 text-slate-500 text-sm">No mover data loaded.</div>}
      </div>
    </div>
  );
}

function MoverRow({
  row,
  onPick,
  compact = false,
}: {
  row: PulseMover;
  onPick: (symbol: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={() => onPick(row.symbol)}
      className={`w-full text-left px-4 flex items-center justify-between hover:bg-white/5 ${compact ? "py-2" : "py-2.5"}`}
    >
      <div className="min-w-0">
        <div className="text-sm text-white font-semibold">{row.symbol}</div>
        {row.name && <div className="text-[11px] text-slate-500 truncate">{row.name}</div>}
        {!compact && <div className="text-[11px] text-slate-500 tick">{usd(row.price)}</div>}
      </div>
      <div className={`text-sm tick text-right ${row.change_percent >= 0 ? "text-bull" : "text-bear"}`}>
        {!compact && row.change != null ? `${row.change > 0 ? "+" : ""}${row.change.toFixed(2)}` : ""}
        <div>
          {row.change_percent >= 0 ? "▲" : "▼"} {pct(row.change_percent)}
        </div>
      </div>
    </button>
  );
}
