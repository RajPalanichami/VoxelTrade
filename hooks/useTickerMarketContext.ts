"use client";

import { useQuery } from "@tanstack/react-query";
import { api, keys } from "@/lib/api";

export function useTickerMarketContext(symbol: string) {
  return useQuery({
    queryKey: keys.marketContext(symbol),
    queryFn: ({ signal }) => api.marketContext(symbol, signal),
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: Boolean(symbol),
  });
}
