"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { TimeframeSelect } from "@/components/search/TimeframeSelect";
import { Timeframe } from "@/lib/types";
import { pct } from "@/lib/format";

export default function BacktestPage() {
  const { symbol, timeframe, setTimeframe } = useTerminal();
  const [start, setStart] = useState("2025-01-01");
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const run = useMutation({
    mutationFn: () => api.backtest({ symbol, timeframe, start, end }),
  });
  const r = run.data?.data as Record<string, unknown> | undefined;
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Backtesting</h1>
      <p className="text-sm text-slate-400">
        Point-in-time only. Indicators at bar i use history[:i]. Future bars are never used to fill signals.
      </p>
      <div className="panel p-4 flex flex-wrap gap-4 items-end">
        <div>
          <div className="text-[10px] text-slate-500">TICKER</div>
          <div className="text-lg">{symbol}</div>
        </div>
        <TimeframeSelect value={timeframe} onChange={setTimeframe} />
        <label className="text-xs">
          Start
          <input className="block bg-panel2 border border-line rounded px-2 py-1 mt-1" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-xs">
          End
          <input className="block bg-panel2 border border-line rounded px-2 py-1 mt-1" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button onClick={() => run.mutate()} className="bg-accent text-white px-4 py-2 rounded text-sm">
          {run.isPending ? "Running…" : "Run strategy v1.0"}
        </button>
      </div>
      {run.error && <div className="panel p-4 text-bear text-sm">{(run.error as Error).message}</div>}
      {r && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {([
              ["Trades", r.trades_count],
              ["Win rate", r.win_rate],
              ["Profit factor", r.profit_factor],
              ["Max DD", r.max_drawdown],
              ["Sharpe", r.sharpe_ratio],
              ["Avg R", r.average_r],
              ["Expectancy", r.expectancy],
              ["Winners", r.winners],
              ["Losers", r.losers],
              ["End equity", r.ending_equity],
            ] as [string, unknown][]).map(([k, v]) => {
              const key = String(k);
              const asPct = typeof v === "number" && (key.includes("rate") || key.includes("DD"));
              const display = asPct ? pct(Number(v) <= 1 ? Number(v) * 100 : Number(v)) : String(v ?? "—");
              return (
              <div key={key} className="panel p-3">
                <div className="text-[10px] text-slate-500">{key}</div>
                <div className="tick text-white">{display}</div>
              </div>
              );
            })}
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  {["entry_time", "exit_time", "entry", "exit", "r", "pnl", "reason"].map((h) => (
                    <th key={h} className="text-left px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {((r.trades as Record<string, unknown>[]) || []).map((t, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-3 py-1">{String(t.entry_time).slice(0, 16)}</td>
                    <td className="px-3 py-1">{String(t.exit_time).slice(0, 16)}</td>
                    <td className="px-3 py-1 tick">{String(t.entry)}</td>
                    <td className="px-3 py-1 tick">{String(t.exit)}</td>
                    <td className={`px-3 py-1 tick ${Number(t.r) >= 0 ? "text-bull" : "text-bear"}`}>{String(t.r)}</td>
                    <td className="px-3 py-1 tick">{String(t.pnl)}</td>
                    <td className="px-3 py-1">{String(t.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
