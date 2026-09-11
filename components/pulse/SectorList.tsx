"use client";

import { PulseSector } from "@/lib/pulse";
import { pct } from "@/lib/format";
import Link from "next/link";

export function SectorList({ sectors }: { sectors: PulseSector[] }) {
  return (
    <div className="panel overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div className="text-[11px] tracking-[0.18em] text-slate-500">SECTOR PERFORMANCE</div>
        <Link href="/sectors" className="text-[11px] text-accent">
          View All
        </Link>
      </div>
      <div className="divide-y divide-white/5">
        {sectors.map((s) => (
          <div key={s.etf} className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{s.name}</div>
                <div className="text-[10px] text-slate-500">{s.etf}</div>
              </div>
            </div>
            <div className={`text-sm tick ${(s.change_percent || 0) >= 0 ? "text-bull" : "text-bear"}`}>
              {pct(s.change_percent)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
