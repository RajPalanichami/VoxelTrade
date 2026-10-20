import type { CryptoFreshness, CryptoFreshnessState } from "@/lib/crypto";

export const LIVE_SECONDS = 8;
export const RECENT_SECONDS = 45;
export const STALE_SECONDS = 180;

export function classifyFreshness(ageSeconds: number, available = true): CryptoFreshnessState {
  if (!available || !Number.isFinite(ageSeconds) || ageSeconds < 0) return "UNAVAILABLE";
  if (ageSeconds <= LIVE_SECONDS) return "LIVE";
  if (ageSeconds <= RECENT_SECONDS) return "RECENT";
  if (ageSeconds <= STALE_SECONDS) return "STALE";
  return "UNAVAILABLE";
}

export function freshnessFromTimestamps(input: {
  source: string;
  providerTimestamp?: string | Date | number | null;
  receivedTimestamp?: string | Date | number | null;
  now?: Date;
  available?: boolean;
}): CryptoFreshness {
  const now = input.now ?? new Date();
  const received = toDate(input.receivedTimestamp) ?? now;
  const provider = toDate(input.providerTimestamp);
  const anchor = provider ?? received;
  const ageSeconds = Math.max(0, (now.getTime() - anchor.getTime()) / 1000);
  return {
    state: classifyFreshness(ageSeconds, input.available !== false && Number.isFinite(ageSeconds)),
    source: input.source,
    providerTimestamp: provider ? provider.toISOString() : null,
    receivedTimestamp: received.toISOString(),
    ageSeconds: Math.round(ageSeconds),
  };
}

export function unavailableFreshness(source: string, now = new Date()): CryptoFreshness {
  return {
    state: "UNAVAILABLE",
    source,
    providerTimestamp: null,
    receivedTimestamp: now.toISOString(),
    ageSeconds: 0,
  };
}

function toDate(value?: string | Date | number | null): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
