"use client";

import Link from "next/link";
import { NewsItem } from "@/lib/types";

export function PulseNews({ items }: { items: NewsItem[] }) {
  return (
    <div className="panel overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <div className="text-[11px] tracking-[0.18em] text-slate-500">MARKET NEWS</div>
        <Link href="/news" className="text-[11px] text-accent">
          View All
        </Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5 max-h-[360px]">
        {items.slice(0, 8).map((n, i) => (
          <a key={n.id || i} href={n.url || "#"} target="_blank" rel="noreferrer" className="block px-4 py-3 hover:bg-white/5">
            <div className="text-[10px] text-slate-500">
              {n.published_at ? String(n.published_at).replace("T", " ").slice(0, 16) : ""} · {n.source}
            </div>
            <div className="text-sm text-white mt-0.5 leading-snug">{n.headline}</div>
          </a>
        ))}
        {!items.length && <div className="p-6 text-slate-500 text-sm">No headlines loaded.</div>}
      </div>
    </div>
  );
}
