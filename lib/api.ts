import { apiUrl } from "./config";
import { AnalysisBundle, Envelope, SearchHit, Timeframe } from "./types";

export function parseApiError(text: string, status?: number): string {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
  } catch {
    /* raw text */
  }
  const trimmed = (text || "").trim();
  if (trimmed && !trimmed.startsWith("{")) return trimmed;
  return status ? `Request failed ${status}` : "Request failed";
}

async function get<T>(path: string, signal?: AbortSignal): Promise<Envelope<T>> {
  const res = await fetch(apiUrl(path), { cache: "no-store", signal });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiError(text, res.status));
  }
  return res.json();
}

async function send<T>(path: string, method: string, body?: unknown): Promise<Envelope<T>> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(parseApiError(await res.text(), res.status));
  return res.json();
}

export const api = {
  search: (q: string) => get<SearchHit[]>(`/api/v1/search?q=${encodeURIComponent(q)}`),
  analysis: (symbol: string, tf: Timeframe, signal?: AbortSignal) =>
    get<AnalysisBundle>(`/api/v1/stocks/${symbol}/analysis?timeframe=${tf}`, signal),
  market: () => get<Record<string, unknown>>("/api/v1/market/overview"),
  pulse: (range: string) => get<import("./pulse").PulsePayload>(`/api/v1/market/pulse?range=${range}`),
  status: () => get<{ state: string }>("/api/v1/market/status"),
  watchlist: () => get<unknown[]>("/api/v1/watchlist"),
  addWatch: (symbol: string) => send(`/api/v1/watchlist/${symbol}`, "POST"),
  delWatch: (symbol: string) => send(`/api/v1/watchlist/${symbol}`, "DELETE"),
  alerts: () => get<unknown[]>("/api/v1/alerts"),
  createAlert: (body: unknown) => send("/api/v1/alerts", "POST", body),
  deleteAlert: (id: string) => send(`/api/v1/alerts/${id}`, "DELETE"),
  backtest: (body: unknown) => send("/api/v1/backtests", "POST", body),
  fundamentals: (symbol: string) => get(`/api/v1/stocks/${symbol}/fundamentals`),
  news: (symbol: string) => get(`/api/v1/stocks/${symbol}/news`),
  providers: () => get("/api/v1/health/providers"),
  optionChain: (symbol: string, expiration?: string) =>
    get<import("./optionsMath").OptionChain>(
      `/api/v1/options/${symbol}/chain${expiration ? `?expiration=${encodeURIComponent(expiration)}` : ""}`,
    ),
  optionPayoff: (body: unknown) => send<import("./optionsMath").OptionPayoff>("/api/v1/options/payoff", "POST", body),
  mag7: (timeframe: string, range: string) =>
    get<import("./mag7").Mag7Payload>(`/api/v1/market/mag7?timeframe=${encodeURIComponent(timeframe)}&range=${encodeURIComponent(range)}`),
  sector: (slug: string, timeframe: string, range: string) =>
    get<import("./sectors").SectorPayload>(
      `/api/v1/market/sector/${encodeURIComponent(slug)}?timeframe=${encodeURIComponent(timeframe)}&range=${encodeURIComponent(range)}`,
    ),
};

export const keys = {
  analysis: (s: string, tf: Timeframe) => ["analysis", s, tf] as const,
  quote: (s: string) => ["quote", s] as const,
  bars: (s: string, tf: Timeframe) => ["bars", s, tf] as const,
  market: ["market"] as const,
  pulse: (range: string) => ["pulse", range] as const,
  watchlist: ["watchlist"] as const,
  alerts: ["alerts"] as const,
  optionChain: (s: string, exp?: string) => ["option-chain", s, exp || ""] as const,
  optionPayoff: (key: string) => ["option-payoff", key] as const,
  mag7: (tf: string, range: string) => ["mag7", tf, range] as const,
  sector: (slug: string, tf: string, range: string) => ["sector", slug, tf, range] as const,
};
