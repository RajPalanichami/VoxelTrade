"use client";

import { Category } from "@/lib/types";
import { toneClass } from "@/lib/format";

const CHECK: Record<string, string> = {
  "Price Trend": "EMA 20/50/200 + price vs VWAP",
  "RSI Momentum": "RSI(14) level & slope",
  MACD: "MACD(12,26,9) line / hist",
  Volume: "Volume / 20-period average",
  "Support/Resistance": "S1–S3 / R1–R3 / pivot / VWAP",
  Fundamentals: "Growth, margins, FCF, valuation",
  "Earnings Revisions": "EPS/revenue revisions",
  "Market/Sector": "S&P, NDX, VIX, sector ETF",
  "Interest Rates": "FRED DGS10 direction",
  "Catalysts/Risk": "News sentiment & event window",
};

export function SignalTable({ categories, score }: { categories: Category[]; score: number }) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div>
          <div className="text-[11px] tracking-[0.2em] text-slate-500">10-SIGNAL ANALYSIS FRAMEWORK</div>
          <div className="text-sm text-white font-medium">Deterministic scoring · algorithm v1.0</div>
        </div>
        <div className="text-bull font-semibold tick">{score}/100</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-widest text-slate-500 border-b border-line">
            <tr>
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">SIGNAL</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell">WHAT TO CHECK</th>
              <th className="text-left px-3 py-2">STATUS</th>
              <th className="text-left px-3 py-2">SCORE</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">DETAILS</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-3 py-2.5 text-slate-500 tick">{c.id}</td>
                <td className="px-3 py-2.5 text-white font-medium">{c.name}</td>
                <td className="px-3 py-2.5 text-slate-500 hidden lg:table-cell text-xs">{CHECK[c.name]}</td>
                <td className={`px-3 py-2.5 font-semibold ${toneClass(c.status)}`}>{c.status}</td>
                <td className="px-3 py-2.5 tick text-slate-200">
                  {c.raw_score.toFixed(0)}/10
                  <span className="text-[10px] text-slate-600 ml-1">w{c.weight}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-400 text-xs hidden md:table-cell max-w-md">{c.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
