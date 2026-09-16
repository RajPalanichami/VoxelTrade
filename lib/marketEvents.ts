import type { MarketEventImpact, MarketEventStatus } from "@/src/engines/marketEvents";

export type MarketEvent = {
  id: string;
  name: string;
  category: string;
  dateLabel: string;
  timeLabel: string;
  timeZoneLabel: string;
  datetimeEst: string;
  occursAt: string | null;
  impact: MarketEventImpact;
  previous: string | null;
  forecast: string | null;
  actual: string | null;
  status: MarketEventStatus;
  country: string;
  source: string;
  hasClock: boolean;
};

export type MarketEventsPayload = {
  week_label: string;
  last_updated: string;
  last_updated_est: string;
  time_zone_label: string;
  events: MarketEvent[];
  source: string;
  sources: string[];
  data_status: "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";
  error?: string;
};
