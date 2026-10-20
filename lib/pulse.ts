import { apiUrl } from "./config";
import type { MarketGaugeData } from "./fearGreed";
import { Envelope, NewsItem } from "./types";

export type PulseRange = "1D" | "1W" | "1M" | "3M" | "1Y";

export interface PulseCard {
  symbol: string;
  ticker: string;
  name: string;
  price: number;
  change?: number | null;
  change_percent?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  previous_close?: number | null;
  week52_high?: number | null;
  week52_low?: number | null;
  volume?: number | null;
  unit: "usd" | "pts" | "yield" | "inflation";
  spark: number[];
  history?: {
    previousClose: number | null;
    oneWeekAgo: number | null;
    oneMonthAgo: number | null;
    oneYearAgo: number | null;
  };
  source?: string;
  as_of?: string;
  group?: "equity" | "macro";
  has_signal?: boolean;
  status?: {
    tone: "HEALTHY" | "CAUTION" | "STRESS";
    label: string;
    reason: string;
  };
}

export interface PulseMover {
  symbol: string;
  name?: string;
  price: number;
  change?: number | null;
  change_percent: number;
  volume?: number | null;
}

export interface PulseSector {
  name: string;
  etf: string;
  color: string;
  price?: number | null;
  change_percent?: number | null;
}

export interface PulsePayload {
  range: PulseRange;
  last_updated: string;
  cards: PulseCard[];
  performance: Record<string, { time: number; value: number }[]>;
  movers: { gainers: PulseMover[]; losers: PulseMover[]; active: PulseMover[] };
  sectors: PulseSector[];
  news: NewsItem[];
  table: PulseCard[];
  takeaways: string[];
  treasury?: { yield?: number; change_1d?: number; trend_20d?: string; source?: string } | null;
  movers_universe?: string;
  latency_ms?: number;
  gauge?: MarketGaugeData | null;
}

export async function fetchPulse(range: PulseRange): Promise<Envelope<PulsePayload>> {
  const res = await fetch(apiUrl(`/api/v1/market/pulse?range=${range}`), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
