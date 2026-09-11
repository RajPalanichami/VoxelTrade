"use client";

import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { MultiTimeframeMatrix } from "@/components/mtf/MultiTimeframeMatrix";
import { TimeframeSelect } from "@/components/search/TimeframeSelect";

export default function MtfPage() {
  const { symbol, timeframe, setTimeframe, autoRefresh } = useTerminal();
  const { data, isLoading, error } = useQuery({
    queryKey: keys.analysis(symbol, timeframe),
    queryFn: () => api.analysis(symbol, timeframe),
    refetchInterval: autoRefresh ? 60_000 : false,
  });
  const bundle = data?.data;
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Multi-Timeframe</h1>
          <p className="text-sm text-slate-400">
            Each timeframe is scored independently. A 5-minute BUY does not imply a bullish daily trend.
          </p>
        </div>
        <TimeframeSelect value={timeframe} onChange={setTimeframe} />
      </div>
      {isLoading && <div className="panel p-8 text-slate-400">Calculating all five engines…</div>}
      {error && <div className="panel p-6 text-bear">{(error as Error).message}</div>}
      {bundle && (
        <>
          <div className="panel p-4 text-sm text-slate-300">{bundle.signal.explanation}</div>
          {bundle.signal.alignment && (
            <div className="text-accent text-sm">ALIGNMENT {bundle.signal.alignment} · Confidence {bundle.signal.confidence}</div>
          )}
          <MultiTimeframeMatrix rows={bundle.multi_timeframe} selected={timeframe} />
        </>
      )}
    </div>
  );
}
