"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { toneClass } from "@/lib/format";
import { NewsItem } from "@/lib/types";

export default function NewsPage() {
  const { symbol } = useTerminal();
  const { data } = useQuery({ queryKey: ["news", symbol], queryFn: () => api.news(symbol) });
  const items = (data?.data || []) as NewsItem[];
  return (
    <div className="p-4 space-y-3 max-w-4xl">
      <h1 className="text-xl font-semibold">News & Catalysts — {symbol}</h1>
      {items.map((n, i) => (
        <a
          key={n.id || i}
          href={n.url || "#"}
          target="_blank"
          rel="noreferrer"
          className="panel p-4 block hover:border-accent/50"
        >
          <div className="flex items-center gap-2 text-[11px] mb-1">
            <span className={toneClass(n.sentiment)}>{(n.sentiment || "neutral").toUpperCase()}</span>
            <span className="text-slate-500">{n.category}</span>
            <span className="text-slate-600">{n.source}</span>
            <span className="text-slate-600 ml-auto">{n.published_at}</span>
          </div>
          <div className="text-sm text-white">{n.headline}</div>
        </a>
      ))}
      {!items.length && <div className="panel p-8 text-slate-400">No headlines loaded for {symbol}.</div>}
    </div>
  );
}
