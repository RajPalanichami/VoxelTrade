"use client";

import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { compact, money, pct } from "@/lib/format";

function row(label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  let display = String(value);
  if (typeof value === "number") {
    if (Math.abs(value) < 3 && label.toLowerCase().includes("growth") || label.toLowerCase().includes("margin")) {
      display = pct(value * (Math.abs(value) <= 3 ? 100 : 1) / (Math.abs(value) <= 3 && Math.abs(value) > 0.0001 && Math.abs(value) < 3 ? 1 : 1));
      if (Math.abs(value) <= 2) display = `${(value * 100).toFixed(1)}%`;
      else display = money(value);
    } else if (Math.abs(value) > 1000) display = compact(value);
    else display = money(value);
  }
  if (typeof value === "boolean") display = value ? "Yes" : "No";
  return (
    <div className="flex justify-between py-2 border-b border-white/5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="tick text-white">{display}</span>
    </div>
  );
}

export default function FundamentalsPage() {
  const { symbol } = useTerminal();
  const { data, error, isLoading } = useQuery({
    queryKey: ["fundamentals", symbol],
    queryFn: () => api.fundamentals(symbol),
  });
  const fund = (data?.data as { fundamentals?: Record<string, unknown>; earnings?: Record<string, unknown> })?.fundamentals;
  const earn = (data?.data as { fundamentals?: Record<string, unknown>; earnings?: Record<string, unknown> })?.earnings;
  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">Fundamentals — {symbol}</h1>
      <p className="text-sm text-slate-400">
        Authoritative filings via SEC EDGAR when available. Missing fields are left blank — never fabricated.
      </p>
      {isLoading && <div className="panel p-8 text-slate-400">Loading fundamentals…</div>}
      {error && <div className="panel p-6 text-bear">{(error as Error).message}</div>}
      {fund && (
        <div className="panel p-4">
          {row("Revenue", fund.revenue)}
          {row("Revenue growth", fund.revenue_growth)}
          {row("EPS", fund.eps)}
          {row("EPS growth", fund.eps_growth)}
          {row("Gross margin", fund.gross_margin)}
          {row("Operating margin", fund.operating_margin)}
          {row("Free cash flow", fund.free_cash_flow)}
          {row("Total cash", fund.total_cash)}
          {row("Total debt", fund.total_debt)}
          {row("Healthy balance", fund.healthy_balance)}
          {row("P/E", fund.pe)}
          {row("Forward P/E", fund.forward_pe)}
          {row("Price/Sales", fund.price_to_sales)}
          {row("PEG", fund.peg)}
          {row("Source", fund.source)}
        </div>
      )}
      {earn && (
        <div className="panel p-4">
          <div className="text-[11px] tracking-widest text-slate-500 mb-2">EARNINGS / REVISIONS</div>
          {row("Days to earnings", earn.days_to_earnings)}
          {row("Recommendation", earn.recommendation)}
          {row("EPS revision trend", earn.eps_revision_trend)}
          {row("Target mean", earn.target_mean)}
          {row("Source", earn.source)}
        </div>
      )}
    </div>
  );
}
