import type { OHLCVBar, Quote } from "@/src/types/domain";
import { ProviderError } from "@/src/lib/errors";
import { barsToFrame } from "@/src/engines/indicators";
import { resampleOhlcv, type Frame } from "@/src/lib/series";

export { ProviderError };

export interface MarketDataProvider {
  name: string;
  available(): boolean;
  fetchQuote(symbol: string): Promise<Quote>;
  fetchBars(symbol: string, timeframe: string, outputsize?: number): Promise<OHLCVBar[]>;
  fetchExtendedHoursBars?(symbol: string, timeframe?: string, outputsize?: number): Promise<OHLCVBar[]>;
  fetchFundamentals?(symbol: string): Promise<Record<string, unknown> | null>;
  fetchEarnings?(symbol: string): Promise<Record<string, unknown> | null>;
  fetchNews?(symbol: string, limit?: number): Promise<Record<string, unknown>[]>;
}

export function toFrame(bars: OHLCVBar[]): Frame {
  return barsToFrame(bars);
}

export function resampleBars(frame: Frame, rule: "4h" | "15min" | "W-FRI"): Frame {
  return resampleOhlcv(frame, rule);
}

export function isRegularHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  if (["Sat", "Sun"].includes(weekday)) return false;
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const minutes = hour * 60 + minute;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

export function headlineSentiment(title: string): string {
  const t = title.toLowerCase();
  const pos = ["beats", "surge", "record", "upgrade", "raises", "growth", "wins", "strong", "ai "];
  const neg = ["miss", "cut", "downgrade", "probe", "lawsuit", "fall", "drop", "weak", "recall", "lay off"];
  if (pos.some((w) => t.includes(w)) && !neg.some((w) => t.includes(w))) return "positive";
  if (neg.some((w) => t.includes(w))) return "negative";
  return "neutral";
}

export function headlineCategory(title: string): string {
  const t = title.toLowerCase();
  const mapping: [string, string][] = [
    ["earn", "Earnings"],
    ["guidance", "Guidance"],
    ["upgrade", "Analyst upgrade"],
    ["downgrade", "Analyst downgrade"],
    ["acqui", "M&A"],
    ["merger", "M&A"],
    ["fed", "Macro"],
    ["rate", "Macro"],
    ["sec ", "Regulation"],
    ["regulat", "Regulation"],
    ["ai ", "AI"],
    ["artificial intelligence", "AI"],
    ["launch", "Product"],
    ["product", "Product"],
  ];
  for (const [needle, cat] of mapping) {
    if (t.includes(needle)) return cat;
  }
  return "General";
}

export function freshness(source: string, status: Quote["freshness"]["data_status"] = "LIVE") {
  return {
    source,
    timestamp: new Date().toISOString(),
    data_status: status,
    latency_ms: 0,
    algorithm_version: "1.0.0",
  };
}
