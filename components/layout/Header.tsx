"use client";

import { useQuery } from "@tanstack/react-query";
import { Menu, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { statusDot } from "@/lib/format";
import { TickerSearch } from "@/components/search/TickerSearch";
import { ThemeToggle } from "./ThemeToggle";
import { AuthControls } from "@/components/auth/AuthControls";

export function Header({
  symbol,
  onSymbol,
  autoRefresh,
  onToggleRefresh,
  onMenu,
}: {
  symbol: string;
  onSymbol: (s: string) => void;
  autoRefresh: boolean;
  onToggleRefresh: () => void;
  onMenu?: () => void;
}) {
  const { data } = useQuery({ queryKey: ["market-status"], queryFn: api.status, refetchInterval: 30_000 });
  const state = data?.data?.state || "—";
  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", month: "short", day: "numeric", year: "numeric" });

  return (
    <header className="h-14 sm:h-16 shrink-0 border-b border-line bg-navy/90 backdrop-blur flex items-center gap-2 sm:gap-4 px-3 sm:px-4">
      <button className="lg:hidden text-slate-300 p-1.5 border border-line rounded" onClick={onMenu} aria-label="Open menu">
        <Menu size={18} />
      </button>
      <div className="hidden lg:block w-[180px]">
        <div className="text-[11px] tracking-[0.28em] text-slate-500">MULTI-TIMEFRAME</div>
        <div className="text-sm font-semibold text-slate-200">Stock Signal Platform</div>
      </div>
      <div className="flex-1 max-w-2xl mx-auto">
        <TickerSearch value={symbol} onSelect={onSymbol} />
      </div>
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md border border-line bg-panel">
          <span className={`h-2 w-2 rounded-full ${statusDot(state)}`} />
          <span className="hidden sm:inline text-slate-300">Market {state}</span>
        </div>
        <div className="hidden xl:block text-slate-500 tick">{now} ET</div>
        <AuthControls />
        <ThemeToggle />
        <button
          onClick={onToggleRefresh}
          className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md border ${
            autoRefresh ? "border-bull/40 text-bull" : "border-line text-slate-400"
          }`}
        >
          <RefreshCw size={12} className={autoRefresh ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Auto Refresh: {autoRefresh ? "On" : "Off"}</span>
        </button>
      </div>
    </header>
  );
}
