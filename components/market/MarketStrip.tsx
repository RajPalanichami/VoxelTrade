"use client";

import { MarketOverview } from "@/lib/types";
import { money, pct } from "@/lib/format";

export function MarketStrip({ market }: { market?: MarketOverview | null }) {
  if (!market) return null;
  const items = [
    ["S&P 500", market.spx, market.spx_change_pct],
    ["NASDAQ 100", market.ndx, market.ndx_change_pct],
    ["DOW", market.dji, market.dji_change_pct],
    ["VIX", market.vix, market.vix_change_pct],
    ["QQQ", market.qqq, market.qqq_change_pct],
  ] as const;
  return (
    <div className="panel p-3 grid grid-cols-2 md:grid-cols-5 gap-2">
      {items.map(([k, p, ch]) => (
        <div key={k}>
          <div className="text-[10px] tracking-widest text-slate-500">{k}</div>
          <div className="tick text-sm text-white">{money(p as number)}</div>
          <div className={`text-xs ${(ch as number) >= 0 ? "text-bull" : "text-bear"}`}>{pct(ch as number)}</div>
        </div>
      ))}
    </div>
  );
}

export function NewsTicker({ items }: { items: { headline: string; source?: string }[] }) {
  if (!items?.length) return null;
  const line = items.map((n) => `${n.headline}${n.source ? ` (${n.source})` : ""}`).join("  •  ");
  return (
    <div className="h-9 border-t border-line bg-navy overflow-hidden flex items-center text-xs text-slate-400">
      <div className="px-3 text-[10px] tracking-widest text-slate-500 shrink-0">NEWS</div>
      <div className="relative flex-1 overflow-hidden">
        <div className="marquee whitespace-nowrap">
          {line}  •  {line}
        </div>
      </div>
    </div>
  );
}
