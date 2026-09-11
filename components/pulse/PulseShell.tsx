"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity } from "lucide-react";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/markets", label: "Markets" },
  { href: "/sectors", label: "Sectors" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/news", label: "News" },
  { href: "/signals", label: "Tools" },
];

export function PulseShell({
  children,
  updated,
}: {
  children: React.ReactNode;
  updated?: string;
}) {
  const path = usePathname();
  const when = updated
    ? new Date(updated).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return (
    <div className="p-3 sm:p-4 space-y-4 pb-16 sm:pb-10">
      <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/15 border border-accent/40 grid place-items-center text-accent shrink-0">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-semibold tracking-tight">Market Pulse</div>
            <div className="text-xs text-slate-500">Real-Time Market Insights & Analysis</div>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 -mx-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = path === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 rounded-md text-sm ${
                  active ? "text-white border-b-2 border-accent" : "text-slate-400 hover:text-white"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        {when && <div className="text-[11px] text-slate-500">Last updated {when} ET</div>}
      </div>
      {children}
    </div>
  );
}
