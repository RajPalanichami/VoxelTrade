"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const { data } = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  return (
    <div className="p-4 max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="panel p-4 text-sm text-slate-300 space-y-2">
        <p>API keys live only on the server (.env / secret manager). The browser never receives provider keys.</p>
        <p>
          Primary: Twelve Data → failover Alpha Vantage → Finnhub → yfinance (development). FRED DGS10 for 10Y yields. SEC
          EDGAR for filings.
        </p>
        <p>Hard filters: R:R &lt; 1.5, stale data, earnings danger window, breakout without volume, selected TF bearish.</p>
        <p>
          Open-source licenses and attribution:{" "}
          <a href="/THIRD-PARTY-NOTICES.txt" className="text-accent hover:underline" target="_blank" rel="noreferrer">
            Third-party notices
          </a>
          . Company and index names identify listed securities and vendors only.
        </p>
      </div>
      <pre className="panel p-4 text-xs text-slate-400 overflow-auto">{JSON.stringify(data?.data, null, 2)}</pre>
    </div>
  );
}
