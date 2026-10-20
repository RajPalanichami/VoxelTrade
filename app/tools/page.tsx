"use client";

import Link from "next/link";
import { PulseShell } from "@/components/pulse/PulseShell";

const TOOLS = [
  { href: "/stock-buying-engine", title: "Stock Buying Engine", body: "Horizon-aware decision context, levels, R:R, and explanations." },
  { href: "/trade-your-plan", title: "Trade Your Plan", body: "15m–4h structure map, Fibonacci, VWAP, and confirmation levels." },
  { href: "/stock-decision", title: "Stock Decision", body: "Any ticker, Daily default. Weighted 0–100 decision with factor table, MTF confirmation, and the existing setup map below." },
  { href: "/compare", title: "Ticker Comparison", body: "Side-by-side technical analysis of two symbols." },
  { href: "/backtesting", title: "Backtesting", body: "Replay strategy rules on historical bars." },
  { href: "/alerts", title: "Alerts", body: "Price and signal alerts for watched names." },
  { href: "/options", title: "Options Visualizer", body: "Teach payoff paths with listed contracts." },
  { href: "/option-analyzer", title: "Option Analyzer", body: "Expiration risk, max loss, and strike scenarios." },
  { href: "/technical", title: "Technical Analysis", body: "Single-ticker indicator workspace." },
];

export default function ToolsPage() {
  return (
    <PulseShell>
      <h1 className="text-xl font-semibold">Tools</h1>
      <p className="text-sm text-slate-400 mb-4">Existing utilities. Each card opens the current page — nothing was rebuilt.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="tools-hub">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="panel p-4 hover:border-accent/40 transition">
            <div className="font-semibold">{t.title}</div>
            <div className="text-sm text-slate-400 mt-1">{t.body}</div>
          </Link>
        ))}
      </div>
    </PulseShell>
  );
}
