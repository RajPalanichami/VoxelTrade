import { getSettings } from "@/src/config/env";
import { getTimeframeSpec, yahooChartWindows } from "@/src/config/timeframes";
import { BY_SYMBOL } from "@/src/data/universe";
import { toFloat } from "@/src/lib/http";
import { ProviderError, freshness, headlineCategory, headlineSentiment, isRegularHours } from "@/src/providers/base";
import type { MarketDataProvider } from "@/src/providers/base";
import { resampleOhlcv } from "@/src/lib/series";
import { barsToFrame } from "@/src/engines/indicators";
import type { OHLCVBar, Quote } from "@/src/types/domain";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type YahooSession = { cookie: string; crumb: string };
let session: YahooSession | null = null;
let sessionAt = 0;

function collectCookies(res: Response): string {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (raw.length) return raw.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

let sessionPromise: Promise<YahooSession> | null = null;

async function ensureYahooSession(): Promise<YahooSession> {
  if (session && Date.now() - sessionAt < 30 * 60 * 1000) return session;
  if (!sessionPromise) {
    sessionPromise = openYahooSession().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

async function openYahooSession(): Promise<YahooSession> {
  if (session && Date.now() - sessionAt < 30 * 60 * 1000) return session;
  const headers = { "User-Agent": UA, Accept: "*/*" };
  const consent = await fetch("https://fc.yahoo.com", { headers, redirect: "manual", cache: "no-store" });
  let cookie = collectCookies(consent);
  if (!cookie) {
    const home = await fetch("https://finance.yahoo.com", { headers, redirect: "follow", cache: "no-store" });
    cookie = collectCookies(home);
  }
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...headers, Cookie: cookie, Accept: "text/plain" },
    cache: "no-store",
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length > 40 || crumb.includes("<")) {
    session = { cookie, crumb: "" };
  } else {
    session = { cookie, crumb };
  }
  sessionAt = Date.now();
  return session;
}

async function yahooGet<T>(url: string, params?: Record<string, string>): Promise<T> {
  const auth = await ensureYahooSession();
  const target = new URL(url);
  if (params) for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  if (auth.crumb) target.searchParams.set("crumb", auth.crumb);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getSettings().httpTimeout * 1000);
  try {
    const res = await fetch(target.toString(), {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Cookie: auth.cookie,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      session = null;
      sessionAt = 0;
    }
    let body: T & { chart?: { error?: { description?: string } }; finance?: { error?: { description?: string } } };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new Error(`Yahoo HTTP ${res.status}`);
    }
    if (!res.ok) {
      const desc = body.chart?.error?.description || body.finance?.error?.description || "";
      const technical = desc ? `Yahoo HTTP ${res.status}: ${desc}` : `Yahoo HTTP ${res.status}`;
      if (res.status === 404 || /delisted|no data found|not found|invalid symbol/i.test(desc)) {
        console.error("[yfinance] symbol unavailable", { url: target.pathname, status: res.status, detail: technical });
        throw new ProviderError("yfinance", "No market data found for this symbol.");
      }
      throw new Error(technical);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export class YFinanceProvider implements MarketDataProvider {
  name = "yfinance";
  available() {
    return true;
  }

  async fetchQuote(symbol: string): Promise<Quote> {
    const chart = await yahooGet<{
      chart?: { result?: Array<Record<string, unknown>>; error?: unknown };
    }>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      interval: "1d",
      range: "5d",
    });
    const result = chart.chart?.result?.[0];
    if (!result) throw new ProviderError(this.name, `No quote data for ${symbol}`);
    const meta = (result.meta || {}) as Record<string, unknown>;
    const closes = (((result.indicators as Record<string, unknown>)?.quote as Record<string, unknown>[])?.[0]?.close ||
      []) as (number | null)[];
    let price = toFloat(meta.regularMarketPrice);
    let prev = toFloat(meta.chartPreviousClose ?? meta.previousClose);
    if (price == null) {
      const finite = closes.filter((x): x is number => x != null);
      if (!finite.length) throw new ProviderError(this.name, `No quote data for ${symbol}`);
      price = finite[finite.length - 1];
      prev = finite.length > 1 ? finite[finite.length - 2] : price;
    }
    const change = prev != null ? price - prev : null;
    const chgPct = change != null && prev ? (change / prev) * 100 : null;
    const vol = toFloat(meta.regularMarketVolume);
    const avgVol = toFloat(meta.averageDailyVolume3Month ?? meta.averageDailyVolume10Day);
    const metaRow = BY_SYMBOL[symbol.toUpperCase()] || {};
    const state = String(meta.currentTradingPeriod ? (isRegularHours() ? "REGULAR" : "CLOSED") : meta.marketState || (isRegularHours() ? "REGULAR" : "CLOSED"));
    const status = ["REGULAR", "PRE", "POST"].includes(state) ? "LIVE" : "EOD";
    return {
      symbol: symbol.toUpperCase(),
      name: String(meta.shortName || meta.longName || metaRow.name || symbol),
      long_name: String(meta.longName || meta.shortName || metaRow.name || symbol),
      exchange: String(meta.exchangeName || meta.fullExchangeName || metaRow.exchange || ""),
      sector: "",
      industry: "",
      price,
      open: toFloat(meta.regularMarketOpen),
      high: toFloat(meta.regularMarketDayHigh),
      low: toFloat(meta.regularMarketDayLow),
      previous_close: prev,
      change,
      change_percent: chgPct,
      volume: vol,
      average_volume: avgVol,
      volume_ratio: vol && avgVol ? vol / avgVol : null,
      market_cap: toFloat(meta.marketCap),
      pe: toFloat(meta.trailingPE),
      forward_pe: null,
      beta: null,
      week52_low: toFloat(meta.fiftyTwoWeekLow),
      week52_high: toFloat(meta.fiftyTwoWeekHigh),
      currency: String(meta.currency || "USD"),
      market_state: state,
      freshness: freshness("yfinance", status),
    };
  }

  async fetchBars(symbol: string, timeframe: string, outputsize = 500): Promise<OHLCVBar[]> {
    const spec = getTimeframeSpec(timeframe);
    const windows = yahooChartWindows(timeframe);
    let lastError: unknown = null;
    let chart: { chart?: { result?: Array<Record<string, unknown>>; error?: { description?: string } } } | null = null;
    for (const window of windows) {
      const period2 = Math.floor(Date.now() / 1000);
      const period1 = period2 - window.lookbackSec;
      try {
        chart = await yahooGet<{
          chart?: { result?: Array<Record<string, unknown>>; error?: { description?: string } };
        }>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
          interval: window.interval,
          period1: String(period1),
          period2: String(period2),
          includePrePost: "false",
        });
        if (chart.chart?.result?.[0]) break;
        lastError = new Error(chart.chart?.error?.description || `Empty Yahoo chart for ${symbol} ${timeframe}`);
      } catch (err) {
        lastError = err;
        chart = null;
      }
    }
    const result = chart?.chart?.result?.[0];
    if (!result) {
      const detail = lastError instanceof Error ? lastError.message : `No bars for ${symbol} ${timeframe}`;
      console.error("[yfinance] bars failed", { symbol, timeframe, interval: spec.yahooInterval, detail });
      throw new ProviderError(this.name, `Unable to retrieve enough market data for the selected timeframe.`);
    }
    const timestamps = (result.timestamp as number[]) || [];
    const quote = ((result.indicators as Record<string, unknown>)?.quote as Record<string, unknown>[])?.[0] || {};
    const opens = (quote.open as (number | null)[]) || [];
    const highs = (quote.high as (number | null)[]) || [];
    const lows = (quote.low as (number | null)[]) || [];
    const closes = (quote.close as (number | null)[]) || [];
    const vols = (quote.volume as (number | null)[]) || [];
    let bars: OHLCVBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (opens[i] == null || highs[i] == null || lows[i] == null || closes[i] == null) continue;
      bars.push({
        symbol: symbol.toUpperCase(),
        timestamp: new Date(timestamps[i] * 1000),
        open: Number(opens[i]),
        high: Number(highs[i]),
        low: Number(lows[i]),
        close: Number(closes[i]),
        volume: Number(vols[i] || 0),
        timeframe,
        source: "yfinance",
      });
    }
    if (timeframe === "4h") {
      const frame = resampleOhlcv(barsToFrame(bars), "4h");
      bars = frame.rows.map((r) => ({
        symbol: symbol.toUpperCase(),
        timestamp: r.timestamp,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
        timeframe,
        source: "yfinance",
      }));
    }
    bars = bars.slice(-outputsize);
    if (!bars.length) throw new ProviderError(this.name, `No bars for ${symbol} ${timeframe}`);
    return bars;
  }

  async fetchExtendedHoursBars(symbol: string, timeframe = "1m", outputsize = 2000): Promise<OHLCVBar[]> {
    const interval = timeframe === "5m" ? "5m" : "1m";
    const lookback = interval === "1m" ? 5 * 86_400 : 10 * 86_400;
    const period2 = Math.floor(Date.now() / 1000);
    const chart = await yahooGet<{
      chart?: { result?: Array<Record<string, unknown>>; error?: { description?: string } };
    }>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      interval,
      period1: String(period2 - lookback),
      period2: String(period2),
      includePrePost: "true",
    });
    const result = chart.chart?.result?.[0];
    if (!result) throw new ProviderError(this.name, `No extended-hours bars for ${symbol}`);
    const timestamps = (result.timestamp as number[]) || [];
    const quote = ((result.indicators as Record<string, unknown>)?.quote as Record<string, unknown>[])?.[0] || {};
    const opens = (quote.open as (number | null)[]) || [];
    const highs = (quote.high as (number | null)[]) || [];
    const lows = (quote.low as (number | null)[]) || [];
    const closes = (quote.close as (number | null)[]) || [];
    const vols = (quote.volume as (number | null)[]) || [];
    const bars: OHLCVBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (opens[i] == null || highs[i] == null || lows[i] == null || closes[i] == null) continue;
      bars.push({
        symbol: symbol.toUpperCase(),
        timestamp: new Date(timestamps[i] * 1000),
        open: Number(opens[i]),
        high: Number(highs[i]),
        low: Number(lows[i]),
        close: Number(closes[i]),
        volume: Number(vols[i] || 0),
        timeframe: interval,
        source: "yfinance",
      });
    }
    const sliced = bars.slice(-outputsize);
    if (!sliced.length) throw new ProviderError(this.name, `No extended-hours bars for ${symbol}`);
    return sliced;
  }

  async fetchFundamentals(symbol: string): Promise<Record<string, unknown> | null> {
    try {
      const body = await yahooGet<{
        quoteSummary?: { result?: Array<Record<string, unknown>> };
      }>(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, {
        modules: "defaultKeyStatistics,financialData,summaryDetail,price",
      });
      const row = body.quoteSummary?.result?.[0];
      if (!row) return null;
      const stats = (row.defaultKeyStatistics || {}) as Record<string, Record<string, unknown>>;
      const fin = (row.financialData || {}) as Record<string, Record<string, unknown>>;
      const sum = (row.summaryDetail || {}) as Record<string, Record<string, unknown>>;
      const raw = (key: Record<string, unknown> | undefined) => toFloat(key?.raw);
      const totalCash = raw(fin.totalCash);
      const totalDebt = raw(fin.totalDebt);
      const healthy =
        totalCash != null && totalDebt != null ? totalCash >= 0.25 * totalDebt || totalDebt === 0 : null;
      return {
        revenue: raw(fin.totalRevenue),
        revenue_growth: raw(fin.revenueGrowth),
        eps: raw(stats.trailingEps),
        eps_growth: raw(fin.earningsGrowth),
        gross_margin: raw(fin.grossMargins),
        operating_margin: raw(fin.operatingMargins),
        profit_margin: raw(fin.profitMargins),
        free_cash_flow: raw(fin.freeCashflow),
        fcf_growth: null,
        total_cash: totalCash,
        total_debt: totalDebt,
        healthy_balance: healthy,
        pe: raw(sum.trailingPE),
        forward_pe: raw(sum.forwardPE),
        price_to_sales: raw(sum.priceToSalesTrailing12Months),
        peg: raw(stats.pegRatio),
        profitable: (raw(stats.trailingEps) || 0) > 0,
        market_cap: raw((row.price as Record<string, Record<string, unknown>>)?.marketCap),
        shares: raw(stats.sharesOutstanding),
        source: "yfinance",
      };
    } catch {
      return null;
    }
  }

  async fetchEarnings(symbol: string): Promise<Record<string, unknown> | null> {
    try {
      const body = await yahooGet<{
        quoteSummary?: { result?: Array<Record<string, unknown>> };
      }>(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, {
        modules: "calendarEvents,recommendationTrend,financialData",
      });
      const row = body.quoteSummary?.result?.[0];
      if (!row) return null;
      const cal = (row.calendarEvents || {}) as Record<string, unknown>;
      const earnings = (cal.earnings || {}) as Record<string, unknown>;
      const dates = (earnings.earningsDate as Array<{ raw?: number }>) || [];
      let days: number | null = null;
      let ts: number | null = null;
      if (dates[0]?.raw) {
        ts = dates[0].raw;
        const delta = Math.floor((ts * 1000 - Date.now()) / 86400000);
        days = delta >= 0 ? delta : null;
      }
      const recs = ((row.recommendationTrend as Record<string, unknown>)?.trend as Array<Record<string, unknown>>) || [];
      const latest = recs[0] || {};
      const strongBuy = Number(latest.strongBuy || 0);
      const buy = Number(latest.buy || 0);
      const sell = Number(latest.sell || 0) + Number(latest.strongSell || 0);
      let rec: string | null = null;
      let trend = "stable";
      if (strongBuy + buy > sell && strongBuy + buy > 0) {
        rec = strongBuy > buy ? "strong_buy" : "buy";
        trend = "up";
      } else if (sell > strongBuy + buy) {
        rec = "sell";
        trend = "down";
      }
      return {
        days_to_earnings: days,
        recommendation: rec,
        recommendation_mean: null,
        target_mean: toFloat(((row.financialData as Record<string, Record<string, unknown>>)?.targetMeanPrice)?.raw),
        eps_revision_trend: trend,
        earnings_date: ts,
        source: "yfinance",
      };
    } catch {
      return null;
    }
  }

  async fetchNews(symbol: string, limit = 20): Promise<Record<string, unknown>[]> {
    try {
      const body = await yahooGet<{ news?: Array<Record<string, unknown>> }>(
        "https://query1.finance.yahoo.com/v1/finance/search",
        { q: symbol, newsCount: String(limit), quotesCount: "0" },
      );
      return (body.news || []).slice(0, limit).map((item) => {
        const title = String(item.title || "");
        const pub = item.providerPublishTime;
        let published: string | null = null;
        if (typeof pub === "number") published = new Date(pub * 1000).toISOString();
        return {
          id: String(item.uuid || title.slice(0, 40)),
          headline: title,
          source: String(item.publisher || ""),
          url: String(item.link || ""),
          published_at: published,
          sentiment: headlineSentiment(title),
          category: headlineCategory(title),
        };
      });
    } catch {
      return [];
    }
  }
}

export async function fetchYahooOptionChain(symbol: string, expiration?: string | null) {
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  let first: { optionChain?: { result?: Array<Record<string, unknown>> } } | null = null;
  let lastError: unknown = null;
  for (const host of hosts) {
    try {
      first = await yahooGet<{ optionChain?: { result?: Array<Record<string, unknown>> } }>(
        `${host}/v7/finance/options/${encodeURIComponent(symbol)}`,
      );
      if (first.optionChain?.result?.[0]) break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!first?.optionChain?.result?.[0]) {
    throw new ProviderError("yfinance", lastError instanceof Error ? lastError.message : `No listed options for ${symbol}`);
  }
  const result = first.optionChain?.result?.[0];
  if (!result) throw new ProviderError("yfinance", `No listed options for ${symbol}`);
  const expirationsSec = ((result.expirationDates as number[]) || []).map((n) => n);
  const expirations = expirationsSec.map((n) => new Date(n * 1000).toISOString().slice(0, 10));
  if (!expirations.length) throw new ProviderError("yfinance", `No listed options for ${symbol}`);
  const today = new Date().toISOString().slice(0, 10);
  const future = expirations.filter((e) => e > today);
  const defaultExp = future[0] || expirations[0];
  let exp = expiration && expirations.includes(expiration) ? expiration : defaultExp;
  const expSec = expirationsSec[expirations.indexOf(exp)];
  let chain = result;
  if (exp !== expirations[0] || expiration) {
    const next = await yahooGet<{
      optionChain?: { result?: Array<Record<string, unknown>> };
    }>(`https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`, {
      date: String(expSec),
    });
    chain = next.optionChain?.result?.[0] || result;
    const opts = (chain.options as Array<Record<string, unknown>>)?.[0];
    if (opts) {
      return { chain, expirations, exp, quote: chain.quote as Record<string, unknown> | undefined, options: opts };
    }
  }
  const opts = (chain.options as Array<Record<string, unknown>>)?.[0] || {};
  return { chain, expirations, exp, quote: chain.quote as Record<string, unknown> | undefined, options: opts };
}
