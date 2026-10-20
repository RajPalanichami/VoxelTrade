"use client";

import {
  Activity,
  BarChart3,
  Bell,
  Bookmark,
  CandlestickChart,
  GitCompare,
  Map,
  HelpCircle,
  Compass,
  Crosshair,
  Crown,
  Layers,
  LayoutDashboard,
  LineChart,
  Newspaper,
  PieChart,
  Radar,
  Radio,
  Repeat,
  Scale,
  Triangle,
  Table2,
  Target,
  Wrench,
  X,
  Flame,
  Zap,
  Bitcoin,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { config } from "@/lib/config";

const NAV = [
  { href: "/", label: "Overview", icon: Radio },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/signals", label: "Signal Analyzer", icon: Activity },
  { href: "/technical", label: "Technical Analysis", icon: CandlestickChart },
  { href: "/scalp-analyzer", label: "Scalp Analyzer", icon: Zap },
  { href: "/trade-your-plan", label: "Trade Your Plan", icon: Map },
  { href: "/stock-decision", label: "Stock Decision", icon: Compass },
  { href: "/patterns", label: "Chart Pattern", icon: Triangle },
  { href: "/stock-buying-engine", label: "Stock Buying Engine", icon: Target },
  { href: "/breakout-potential", label: "Breakout Potential", icon: Flame },
  { href: "/opportunity", label: "Opportunity Monitor", icon: Radar },
  { href: "/options", label: "Option Visualizer", icon: Layers },
  { href: "/option-analyzer", label: "Option Analyzer", icon: Crosshair },
  { href: "/swing", label: "Swing Trading", icon: Repeat },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
  { href: "/compare", label: "Ticker Comparison", icon: GitCompare },
  { href: "/multi-timeframe", label: "Multi-Time Frame", icon: Table2 },
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/mag7", label: "The Magnificent Seven", icon: Crown },
  { href: "/mag7-compare", label: "Mag 7 Comparison", icon: BarChart3 },
  { href: "/comparison", label: "Comparison", icon: Scale },
  { href: "/sector/technology", label: "Technology", icon: PieChart },
  { href: "/sector/semiconductors", label: "Semiconductors", icon: PieChart },
  { href: "/sector/communication", label: "Communication", icon: PieChart },
  { href: "/sector/financials", label: "Financial", icon: PieChart },
  { href: "/sector/energy", label: "Energy", icon: PieChart },
  { href: "/sector/healthcare", label: "Healthcare", icon: PieChart },
  { href: "/sector/discretionary", label: "Consumer Discretionary", icon: PieChart },
  { href: "/sector/industrials", label: "Industrials", icon: PieChart },
  { href: "/sector/staples", label: "Consumer Staples", icon: PieChart },
  { href: "/sector/materials", label: "Materials", icon: PieChart },
  { href: "/sector/utilities", label: "Utilities", icon: PieChart },
  { href: "/sector/real-estate", label: "Real Estate", icon: PieChart },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/fundamentals", label: "Fundamentals", icon: LineChart },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

function Brand() {
  // Always the same element tree on server and client. Switching <a> vs <div>
  // from an env value that Next could not inline caused a hydration mismatch.
  const brandHref = config.brandSiteUrl || "https://voxel-ai-lab.com";
  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-md bg-bull/15 border border-bull/40 grid place-items-center text-bull font-black">
        VT
      </div>
      <div>
        <div className="text-[13px] font-bold tracking-[0.14em] text-white">Voxel Trading</div>
        <a
          href={brandHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-slate-500 hover:text-accent"
        >
          A Voxel AI Lab Product
        </a>
      </div>
    </div>
  );
}

function Links({ onClose }: { onClose?: () => void }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
      {NAV.map((item) => {
        const active = path === item.href || (item.href !== "/" && path.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onMouseEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            onClick={onClose}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] leading-tight transition ${
                active
                  ? "bg-accent/15 text-white border border-accent/40"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
          >
            <Icon size={15} className={`shrink-0 ${active ? "text-accent" : ""}`} />
            {item.label}
            {item.href === "/breakout-potential" ? (
              <span aria-hidden className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">New</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  return (
    <>
      <aside className="hidden lg:flex w-[220px] shrink-0 flex-col border-r border-line bg-navy">
        <div className="px-4 py-5 border-b border-line">
          <Brand />
        </div>
        <Links />
        <div className="p-3 text-[10px] text-slate-600 border-t border-line flex items-center gap-2">
          <HelpCircle size={12} />
          They trade when their rules align.
        </div>
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={onClose} />
          <aside className="relative h-full w-[260px] max-w-[85vw] flex flex-col border-r border-line bg-navy">
            <div className="px-4 py-4 border-b border-line flex items-center justify-between">
              <Brand />
              <button onClick={onClose} className="text-slate-400 p-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <Links onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
