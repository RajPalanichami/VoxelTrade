import { apiUrl } from "./config";
import { AnalysisBundle, Envelope, SearchHit, SwingAnalysis, SwingTimeframe, Timeframe } from "./types";

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
  swing: (symbol: string, tf: SwingTimeframe, signal?: AbortSignal) =>
    get<SwingAnalysis>(`/api/v1/stocks/${symbol}/swing?timeframe=${tf}`, signal),
  chartPattern: (symbol: string, tf: import("./types").PatternTimeframe, signal?: AbortSignal) =>
    get<import("./types").ChartPatternAnalysis>(
      `/api/v1/stocks/${symbol}/chart-pattern?timeframe=${encodeURIComponent(tf)}`,
      signal,
    ),
  market: () => get<Record<string, unknown>>("/api/v1/market/overview"),
  pulse: (range: string) => get<import("./pulse").PulsePayload>(`/api/v1/market/pulse?range=${range}`),
  marketHistory: (signal?: AbortSignal) => get<import("@/src/engines/marketHistory").MarketHistoryPayload>("/api/v1/market/history", signal),
  marketGauge: () => get<import("./fearGreed").MarketGaugeData>("/api/v1/market/gauge"),
  marketEvents: () => get<import("./marketEvents").MarketEventsPayload>("/api/v1/market/events"),
  status: () => get<{ state: string; session?: string; sessionLabel?: string; timezone?: string }>("/api/v1/market/status"),
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
  indicators: (symbol: string, tf: Timeframe) =>
    get<import("./types").Indicators>(`/api/v1/stocks/${symbol}/indicators?timeframe=${tf}`),
  levels: (symbol: string, tf: Timeframe) =>
    get<{
      support?: { s1?: number | null; s2?: number | null };
      resistance?: { r1?: number | null; r2?: number | null };
    }>(`/api/v1/stocks/${symbol}/levels?timeframe=${tf}`),
  bars: (symbol: string, tf: Timeframe) => get<import("./types").Candle[]>(`/api/v1/stocks/${symbol}/bars?timeframe=${tf}`),
  quote: (symbol: string, signal?: AbortSignal) => get<import("./types").Quote>(`/api/v1/stocks/${encodeURIComponent(symbol)}/quote`, signal),
  chartBars: (symbol: string, tf: string, signal?: AbortSignal) =>
    get<unknown[]>(`/api/v1/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${encodeURIComponent(tf)}`, signal),
  optionPayoff: (body: unknown) => send<import("./optionsMath").OptionPayoff>("/api/v1/options/payoff", "POST", body),
  mag7: (timeframe: string, range: string) =>
    get<import("./mag7").Mag7Payload>(`/api/v1/market/mag7?timeframe=${encodeURIComponent(timeframe)}&range=${encodeURIComponent(range)}`),
  sector: (slug: string, timeframe: string, range: string) =>
    get<import("./sectors").SectorPayload>(
      `/api/v1/market/sector/${encodeURIComponent(slug)}?timeframe=${encodeURIComponent(timeframe)}&range=${encodeURIComponent(range)}`,
    ),
  compare: (ticker1: string, ticker2: string, timeframe: string, period: string) =>
    send<import("./compare").ComparePayload>("/api/v1/compare", "POST", { ticker1, ticker2, timeframe, period }),
  mag7Compare: (timeframe: string) =>
    get<import("./mag7Compare").Mag7ComparePayload>(`/api/v1/compare/mag7?timeframe=${encodeURIComponent(timeframe)}`),
  basketCompare: (tickers: string[], timeframe: string) =>
    send<import("./mag7Compare").Mag7ComparePayload>("/api/v1/compare/basket", "POST", { tickers, timeframe }),
  opportunity: (body?: { tickers?: string[]; settings?: import("./opportunity").OpportunitySettings; persist?: boolean }) =>
    send<import("./opportunity").OpportunityPayload>("/api/v1/opportunity", "POST", body || {}),
  opportunityTicker: (symbol: string) =>
    get<import("./opportunity").OpportunityPayload & { row: import("@/src/engines/opportunityEngine").OpportunityRow | null }>(
      `/api/v1/opportunity/${encodeURIComponent(symbol)}`,
    ),
  opportunityUniverse: () => get<import("./opportunity").OpportunityPrefs>("/api/v1/opportunity/universe"),
  saveOpportunityUniverse: (tickers: string[], settings?: import("./opportunity").OpportunitySettings) =>
    send<import("./opportunity").OpportunityPrefs>("/api/v1/opportunity/universe", "PUT", { tickers, settings }),
  validateOpportunityUniverse: (tickers: string[]) =>
    send<{ tickers: string[]; errors: string[] }>("/api/v1/opportunity/universe/validate", "POST", { tickers }),
  resetOpportunityUniverse: () => send<import("./opportunity").OpportunityPrefs>("/api/v1/opportunity/universe/reset", "POST"),
  saveOpportunitySettings: (settings: import("./opportunity").OpportunitySettings) =>
    send<import("./opportunity").OpportunityPrefs>("/api/v1/opportunity/settings", "PUT", settings),
  breakoutPotential: (body?: {
    source?: import("./breakoutPotential").BreakoutUniverseSource;
    tickers?: string[];
    sector?: string;
    timeframe?: string;
    lifecycleTimeframe?: string;
    settings?: import("./breakoutPotential").BreakoutSettings;
    selected?: string;
  }) => send<import("@/src/services/breakoutPotential").BreakoutScannerPayload>("/api/v1/breakout-potential", "POST", body || {}),
  breakoutUniverses: () => get<ReturnType<typeof import("@/src/services/breakoutPotential").listBreakoutUniverses>>("/api/v1/breakout-potential/universes"),
  scalp: (symbol: string, tf: import("./scalp").ScalpTimeframe, signal?: AbortSignal) =>
    get<import("./scalp").ScalpAnalysis>(`/api/v1/stocks/${encodeURIComponent(symbol)}/scalp?timeframe=${encodeURIComponent(tf)}`, signal),
  marketContext: (symbol: string, signal?: AbortSignal) =>
    get<import("./extendedHours").TickerMarketContext>(`/api/v1/stocks/${encodeURIComponent(symbol)}/market-context`, signal),
  cryptoOverview: (signal?: AbortSignal) => get<import("./crypto").CryptoOverview>("/api/v1/crypto/overview", signal),
  cryptoAssets: (limit: number, signal?: AbortSignal) =>
    get<{ assets: import("./crypto").CryptoAsset[] }>(`/api/v1/crypto/assets?limit=${limit}`, signal),
  cryptoSearch: (q: string) =>
    get<Array<{ id: string; symbol: string; name: string; rank: number | null; image: string | null }>>(
      `/api/v1/crypto/search?q=${encodeURIComponent(q)}`,
    ),
  cryptoAsset: (symbol: string) => get<import("./crypto").CryptoAsset>(`/api/v1/crypto/asset/${encodeURIComponent(symbol)}`),
  cryptoHistory: (symbol: string, tf: string, signal?: AbortSignal) =>
    get<{ symbol: string; timeframe: string; bars: import("./crypto").CryptoCandle[]; source: string }>(
      `/api/v1/crypto/asset/${encodeURIComponent(symbol)}/history?timeframe=${encodeURIComponent(tf)}`,
      signal,
    ),
  cryptoMarketChart: (range: string, signal?: AbortSignal) =>
    get<{ range: string; series: import("./crypto").CryptoSeriesPoint[]; prices: import("./crypto").CryptoSeriesPoint[]; note: string; source: string }>(
      `/api/v1/crypto/market-chart?range=${encodeURIComponent(range)}`,
      signal,
    ),
  cryptoQuotes: (symbols: string[]) =>
    get<import("./crypto").CryptoQuote[]>(`/api/v1/crypto/quotes?symbols=${encodeURIComponent(symbols.join(","))}`),
  stockBuying: (symbol: string, horizon: import("./stockBuying").BuyingHorizon, tf: Timeframe, signal?: AbortSignal) =>
    get<import("./stockBuying").StockBuyingPayload>(
      `/api/v1/stocks/${encodeURIComponent(symbol)}/buying-engine?horizon=${encodeURIComponent(horizon)}&timeframe=${encodeURIComponent(tf)}`,
      signal,
    ),
  tradePlan: (symbol: string, tf: import("./tradePlan").TradePlanTimeframe, signal?: AbortSignal) =>
    get<import("./tradePlan").TradePlanMap>(
      `/api/v1/stocks/${encodeURIComponent(symbol)}/trade-plan?timeframe=${encodeURIComponent(tf)}`,
      signal,
    ),
  stockDecision: (symbol: string, tf: import("./stockDecision").StockDecisionTimeframe, signal?: AbortSignal) =>
    get<import("./stockDecision").StockDecisionMap>(
      `/api/v1/stocks/${encodeURIComponent(symbol)}/stock-decision?timeframe=${encodeURIComponent(tf)}`,
      signal,
    ),
};

export const keys = {
  analysis: (s: string, tf: Timeframe) => ["analysis", s, tf] as const,
  swing: (s: string, tf: SwingTimeframe) => ["swing", s, tf] as const,
  chartPattern: (s: string, tf: import("./types").PatternTimeframe) => ["chart-pattern", s, tf] as const,
  quote: (s: string) => ["quote", s] as const,
  bars: (s: string, tf: Timeframe) => ["bars", s, tf] as const,
  market: ["market"] as const,
  pulse: (range: string) => ["pulse", range] as const,
  marketHistory: ["market-history", "v1"] as const,
  marketGauge: ["market-gauge"] as const,
  marketEvents: ["market-events", "v6"] as const,
  watchlist: ["watchlist"] as const,
  alerts: ["alerts"] as const,
  optionChain: (s: string, exp?: string) => ["option-chain", s, exp || ""] as const,
  optionPayoff: (key: string) => ["option-payoff", key] as const,
  mag7: (tf: string, range: string) => ["mag7", tf, range] as const,
  sector: (slug: string, tf: string, range: string) => ["sector", slug, tf, range] as const,
  compare: (a: string, b: string, tf: string, period: string) => ["compare", a, b, tf, period] as const,
  mag7Compare: (tf: string) => ["mag7-compare", tf] as const,
  basketCompare: (tickers: string[], tf: string) => ["basket-compare", tickers.join(","), tf] as const,
  opportunity: (tickers: string[], settingsKey: string) => ["opportunity", tickers.join(","), settingsKey] as const,
  opportunityUniverse: ["opportunity-universe"] as const,
  breakoutPotential: (source: string, tickers: string[], tf: string, life: string, selected: string) =>
    ["breakout-potential", source, tickers.join(","), tf, life, selected] as const,
  breakoutUniverses: ["breakout-universes"] as const,
  scalp: (s: string, tf: string) => ["scalp", s, tf] as const,
  marketContext: (s: string) => ["market-context", s] as const,
  cryptoOverview: ["crypto-overview"] as const,
  cryptoAssets: (limit: number) => ["crypto-assets", limit] as const,
  cryptoHistory: (s: string, tf: string) => ["crypto-history", s, tf] as const,
  cryptoMarketChart: (range: string) => ["crypto-market-chart", range] as const,
  cryptoSearch: (q: string) => ["crypto-search", q] as const,
  stockBuying: (s: string, horizon: string, tf: Timeframe) => ["stock-buying", s, horizon, tf] as const,
  tradePlan: (s: string, tf: string) => ["trade-plan", s, tf] as const,
  stockDecision: (s: string, tf: string) => ["stock-decision", s, tf] as const,
};
