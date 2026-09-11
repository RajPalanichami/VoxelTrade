"use client";

import { MtfRow, Timeframe } from "@/lib/types";
import { signalLabel, toneClass } from "@/lib/format";
import { TIMEFRAMES } from "@/lib/types";

export function MultiTimeframeMatrix({
  rows,
  selected,
}: {
  rows: Record<string, MtfRow> | null | undefined;
  selected: Timeframe;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-line text-[11px] tracking-[0.2em] text-slate-500">
        MULTI-TIMEFRAME SIGNAL MATRIX
      </div>
      <table className="w-full text-xs">
        <thead className="text-slate-500 border-b border-line">
          <tr>
            {["TF", "TREND", "RSI", "MACD", "VWAP", "VOLUME", "SIGNAL"].map((h) => (
              <th key={h} className="text-left px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIMEFRAMES.map((tf) => {
            const r = rows?.[tf.id] || {};
            const active = tf.id === selected;
            return (
              <tr key={tf.id} className={`${active ? "bg-accent/10" : ""} border-b border-white/5`}>
                <td className="px-3 py-2 text-white font-semibold">{tf.label}</td>
                <td className={`px-3 py-2 ${r.trend === "↑" ? "text-bull" : "text-bear"}`}>{r.trend || "—"}</td>
                <td className="px-3 py-2 tick">{r.rsi ?? "—"}</td>
                <td className={`px-3 py-2 ${r.macd === "↑" ? "text-bull" : "text-bear"}`}>{r.macd || "—"}</td>
                <td className="px-3 py-2">{r.vwap || "—"}</td>
                <td className="px-3 py-2">{r.volume || "—"}</td>
                <td className={`px-3 py-2 font-bold ${toneClass(r.signal)}`}>{signalLabel(r.signal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
