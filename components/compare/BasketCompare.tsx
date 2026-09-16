"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { parseCompareTicker } from "@/lib/compare";
import { BASKET_COMPARE_MAX, tickerColors, type Mag7ComparePayload, type Mag7CompareTimeframe } from "@/lib/mag7Compare";
import { TickerSearch } from "@/components/search/TickerSearch";
import { BasketCompareDashboard, type BasketCompareCopy } from "@/components/compare/BasketCompareDashboard";

const COPY: BasketCompareCopy = {
  title: "Comparison",
  subtitle:
    "The same Ticker Comparison engine used by Mag 7 Comparison, applied to the tickers you enter. Add up to 10 symbols, pick a timeframe, and see which name is strongest. This is an analytical snapshot, not a prediction of future prices.",
  loading: (label) => `Analyzing selected tickers on the ${label} timeframe…`,
  overview: "PERFORMANCE OVERVIEW",
  detailed: "DETAILED COMPARISON",
  strongestInsight: (stock, label) =>
    `${stock.symbol} is the strongest selected ticker on ${label} with a score of ${stock.score ?? "N/A"} (${stock.signal}).`,
  weakestInsight: (stock, label) =>
    `${stock.symbol} is the weakest on this timeframe with a score of ${stock.score ?? "N/A"} (${stock.signal}).`,
  averageInsight: (avg) => `Average score is ${avg} using the Ticker Comparison category weights.`,
  metrics: "KEY MARKET METRICS · AVERAGE",
  sectorTitle: "TICKER PERFORMANCE",
  showSectors: false,
  testId: "basket-compare",
  chartTestId: "basket-compare-chart",
  qualityTestId: "basket-compare-quality",
  rowTestId: (symbol) => `basket-compare-row-${symbol}`,
};

function addTickers(current: string[], raw: string): { next: string[]; error: string | null } {
  const parts = raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return { next: current, error: "Enter a supported ticker." };
  const next = [...current];
  for (const part of parts) {
    const parsed = parseCompareTicker(part, "Ticker");
    if ("error" in parsed) return { next: current, error: parsed.error };
    if (next.includes(parsed.symbol)) return { next: current, error: `${parsed.symbol} is already in the comparison.` };
    if (next.length >= BASKET_COMPARE_MAX) return { next: current, error: `A maximum of ${BASKET_COMPARE_MAX} tickers can be compared.` };
    next.push(parsed.symbol);
  }
  return { next, error: null };
}

export function BasketCompare() {
  const [tf, setTf] = useState<Mag7CompareTimeframe>("4h");
  const [tickers, setTickers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const colors = useMemo(() => tickerColors(tickers), [tickers]);
  const enabled = tickers.length > 0;
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.basketCompare(tickers, tf),
    queryFn: () => api.basketCompare(tickers, tf),
    enabled,
    staleTime: 20_000,
  });
  const raw = data?.data as Mag7ComparePayload | undefined;
  const payload =
    raw && raw.requested?.join(",") === tickers.join(",") && raw.timeframe === tf ? raw : undefined;

  function commit(rawValue: string) {
    const result = addTickers(tickers, rawValue);
    setInputError(result.error);
    if (!result.error) {
      setTickers(result.next);
      setDraft("");
    }
  }

  return (
    <BasketCompareDashboard
      copy={COPY}
      tf={tf}
      onTfChange={setTf}
      payload={payload}
      isLoading={enabled && isLoading}
      isFetching={isFetching}
      error={error as Error | null}
      headerExtra={
        <div className="panel p-4 space-y-3" data-testid="basket-compare-tickers">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] tracking-[0.18em] text-slate-500">TICKERS · {tickers.length} / {BASKET_COMPARE_MAX}</div>
            {tickers.length > 0 && (
              <button type="button" className="text-xs text-slate-400 hover:text-white" onClick={() => setTickers([])}>
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {tickers.map((symbol) => (
              <span key={symbol} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel2 px-2.5 py-1 text-sm">
                <span className="h-2 w-2 rounded-full" style={{ background: colors[symbol] }} />
                {symbol}
                <button
                  type="button"
                  aria-label={`Remove ${symbol}`}
                  className="text-slate-500 hover:text-white"
                  onClick={() => setTickers(tickers.filter((item) => item !== symbol))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          {tickers.length < BASKET_COMPARE_MAX && (
            <TickerSearch
              value={draft}
              onInputChange={setDraft}
              onSelect={commit}
              placeholder="Add ticker (Enter). Paste several, separated by commas."
              label="Add ticker"
            />
          )}
          {inputError && <div className="text-xs text-bear">{inputError}</div>}
        </div>
      }
      empty={
        !enabled ? (
          <div className="panel p-10 text-center text-slate-400">
            Add at least one ticker to run the comparison. There are no default symbols on this page.
          </div>
        ) : undefined
      }
    />
  );
}
