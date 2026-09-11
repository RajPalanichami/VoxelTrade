"use client";

import { memo } from "react";
import { PulseCard } from "@/lib/pulse";
import { pct } from "@/lib/format";
import { orderMarketTiles } from "@/lib/tileOrder";
import { pulseChange, pulsePrice } from "./formatPulse";
import { Sparkline } from "./Sparkline";

const TONE: Record<string, string> = {
  HEALTHY: "bg-bull/15 text-bull border-bull/40",
  CAUTION: "bg-warn/15 text-warn border-warn/40",
  STRESS: "bg-bear/15 text-bear border-bear/40",
};

export const IndexCards = memo(function IndexCards({ cards }: { cards: PulseCard[] }) {
  const ordered = orderMarketTiles(cards);
  return (
    <div className="min-w-0">
      <div className="market-tile-lane overflow-x-auto overflow-y-hidden overscroll-x-contain">
        <div className="flex flex-nowrap gap-1.5 min-[1280px]:w-full" data-testid="market-tile-row">
          {ordered.map((c) => (
            <MarketTile key={c.symbol} card={c} />
          ))}
        </div>
      </div>
    </div>
  );
});

const MarketTile = memo(function MarketTile({ card }: { card: PulseCard }) {
  const up = (card.change || card.change_percent || 0) >= 0;
  const status = card.status;
  return (
    <div className="market-tile panel px-2.5 py-2 min-w-0 flex flex-col contain-layout" data-testid={`tile-${card.symbol}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-white leading-tight">{card.symbol}</div>
          <div className="text-[9px] text-slate-500 truncate leading-tight">{card.name}</div>
        </div>
        {status && (
          <span className={`shrink-0 text-[8px] font-bold tracking-wide px-1 py-0.5 rounded border ${TONE[status.tone] || TONE.CAUTION}`}>
            {status.label}
          </span>
        )}
      </div>
      <div className="tick text-[15px] text-white mt-0.5 leading-tight">{pulsePrice(card)}</div>
      <div className={`text-[10px] tick leading-tight ${up ? "text-bull" : "text-bear"}`}>
        {card.unit === "inflation"
          ? card.change != null
            ? `MoM ${card.change > 0 ? "+" : ""}${card.change.toFixed(2)}%`
            : card.as_of
              ? `As of ${card.as_of}`
              : "—"
          : `${pulseChange(card)}${card.change_percent != null ? ` (${pct(card.change_percent)})` : ""}`}
      </div>
      <div className="mt-0.5">
        <Sparkline values={card.spark || []} up={status ? status.tone !== "STRESS" : up} compact />
      </div>
      {status && <p className="mt-0.5 text-[9px] text-slate-400 leading-tight line-clamp-2">{status.reason}</p>}
      {card.source && (
        <div className="mt-auto pt-0.5 text-[8px] text-slate-600 truncate">
          {card.source}
          {card.as_of ? ` · ${card.as_of}` : ""}
        </div>
      )}
    </div>
  );
});
