"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";
import { type Mag7ComparePayload, type Mag7CompareTimeframe } from "@/lib/mag7Compare";
import { BasketCompareDashboard, type BasketCompareCopy } from "@/components/compare/BasketCompareDashboard";

const COPY: BasketCompareCopy = {
  title: "Mag 7 Comparison",
  subtitle:
    "The same Ticker Comparison engine, applied automatically to AAPL, MSFT, GOOGL, AMZN, NVDA, META, and TSLA for the selected timeframe. This is an analytical snapshot, not a prediction of future prices.",
  loading: (label) => `Analyzing Mag 7 on the ${label} timeframe…`,
  overview: "MAG 7 PERFORMANCE OVERVIEW",
  detailed: "MAG 7 DETAILED COMPARISON",
  strongestInsight: (stock, label) =>
    `${stock.symbol} is the strongest Mag 7 name on ${label} with a score of ${stock.score ?? "N/A"} (${stock.signal}).`,
  weakestInsight: (stock, label) =>
    `${stock.symbol} is the weakest on this timeframe with a score of ${stock.score ?? "N/A"} (${stock.signal}).`,
  averageInsight: (avg) => `Average Mag 7 score is ${avg} using the Ticker Comparison category weights.`,
  metrics: "KEY MARKET METRICS · MAG 7 AVERAGE",
  sectorTitle: "SECTOR PERFORMANCE",
  showSectors: true,
  testId: "mag7-compare",
  chartTestId: "mag7-compare-chart",
  qualityTestId: "mag7-compare-quality",
  rowTestId: (symbol) => `mag7-compare-row-${symbol}`,
};

export function Mag7Compare() {
  const [tf, setTf] = useState<Mag7CompareTimeframe>("4h");
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: keys.mag7Compare(tf),
    queryFn: () => api.mag7Compare(tf),
    staleTime: 20_000,
  });
  const payload = data?.data as Mag7ComparePayload | undefined;

  return (
    <BasketCompareDashboard
      copy={COPY}
      tf={tf}
      onTfChange={setTf}
      payload={payload}
      isLoading={isLoading}
      isFetching={isFetching}
      error={error as Error | null}
    />
  );
}
