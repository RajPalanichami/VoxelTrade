"use client";

import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import { Timeframe } from "@/lib/types";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface Ctx {
  symbol: string;
  setSymbol: (s: string) => void;
  timeframe: Timeframe;
  setTimeframe: (t: Timeframe) => void;
  autoRefresh: boolean;
}

const C = createContext<Ctx | null>(null);

export function useTerminal() {
  const v = useContext(C);
  if (!v) throw new Error("useTerminal");
  return v;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState("MSFT");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const value = useMemo(
    () => ({ symbol, setSymbol, timeframe, setTimeframe, autoRefresh }),
    [symbol, timeframe, autoRefresh],
  );
  return (
    <C.Provider value={value}>
      <ShellFrame symbol={symbol} onSymbol={setSymbol} autoRefresh={autoRefresh} onToggleRefresh={() => setAutoRefresh((v) => !v)}>
        {children}
      </ShellFrame>
    </C.Provider>
  );
}

function ShellFrame({
  children,
  symbol,
  onSymbol,
  autoRefresh,
  onToggleRefresh,
}: {
  children: ReactNode;
  symbol: string;
  onSymbol: (s: string) => void;
  autoRefresh: boolean;
  onToggleRefresh: () => void;
}) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="h-[100dvh] flex overflow-hidden">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header symbol={symbol} onSymbol={onSymbol} autoRefresh={autoRefresh} onToggleRefresh={onToggleRefresh} onMenu={() => setNavOpen(true)} />
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
