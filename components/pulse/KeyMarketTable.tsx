"use client";

import { PulseCard } from "@/lib/pulse";
import { money, pct, usd } from "@/lib/format";
import { pulsePrice } from "./formatPulse";

export function KeyMarketTable({ rows }: { rows: PulseCard[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-line text-[11px] tracking-[0.18em] text-slate-500">KEY MARKET DATA</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-widest text-slate-500 border-b border-line">
            <tr>
              {["SYMBOL", "NAME", "LAST", "CHANGE", "% CHANGE", "SIGNAL", "52W HIGH", "52W LOW"].map((h) => (
                <th key={h} className="text-left px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="border-b border-white/5">
                <td className="px-3 py-2 text-white font-semibold">{r.symbol}</td>
                <td className="px-3 py-2 text-slate-400 text-xs">{r.name}</td>
                <td className="px-3 py-2 tick">{pulsePrice(r)}</td>
                <td className={`px-3 py-2 tick ${(r.change || 0) >= 0 ? "text-bull" : "text-bear"}`}>
                  {r.change === null || r.change === undefined
                    ? "—"
                    : r.unit === "inflation"
                      ? `${r.change > 0 ? "+" : ""}${r.change.toFixed(2)}% MoM`
                      : `${r.change > 0 ? "+" : ""}${money(r.change)}`}
                </td>
                <td className={`px-3 py-2 tick ${(r.change_percent || 0) >= 0 ? "text-bull" : "text-bear"}`}>
                  {pct(r.change_percent)}
                </td>
                <td className="px-3 py-2">
                  {r.status ? (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        r.status.tone === "HEALTHY"
                          ? "text-bull border-bull/40"
                          : r.status.tone === "STRESS"
                            ? "text-bear border-bear/40"
                            : "text-warn border-warn/40"
                      }`}
                    >
                      {r.status.label}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 tick text-slate-300">{r.week52_high ? usd(r.week52_high) : "—"}</td>
                <td className="px-3 py-2 tick text-slate-300">{r.week52_low ? usd(r.week52_low) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
