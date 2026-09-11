import { CACHE_TTL, SECTOR_ETF, TIMEFRAMES, TIMEFRAME_LABELS, getSettings } from "@/src/config/env";
import { getTimeframeSpec } from "@/src/config/timeframes";
import { searchUniverse } from "@/src/data/universe";
import { computeAll, last, slope, structureFlags } from "@/src/engines/indicators";
import { applyHardFilters, buildExplanation, classify, computeConfidence, scoreAll } from "@/src/engines/scoring";
import { calculateLevels } from "@/src/engines/supportResistance";
import { buildPlans } from "@/src/engines/tradingPlan";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError, ProviderError } from "@/src/lib/errors";
import { AlphaVantageProvider } from "@/src/providers/alphaVantage";
import { FinnhubProvider } from "@/src/providers/finnhub";
import { FredProvider } from "@/src/providers/macro";
import { TwelveDataProvider } from "@/src/providers/twelveData";
import { YFinanceProvider } from "@/src/providers/yfinance";
import { toFrame } from "@/src/providers/base";
import type { MarketDataProvider } from "@/src/providers/base";
import type { Indicators, OHLCVBar, Quote, SignalLabel } from "@/src/types/domain";
import { emptyIndicators } from "@/src/types/domain";

const providerCtors: Record<string, new () => MarketDataProvider> = {
  twelve_data: TwelveDataProvider,
  alpha_vantage: AlphaVantageProvider,
  finnhub: FinnhubProvider,
  yfinance: YFinanceProvider,
};

function serializeQuote(q: Quote) {
  return { ...q };
}

export class AnalysisService {
  fred = new FredProvider();
  health: Record<string, Record<string, unknown>> = {};

  chain(): MarketDataProvider[] {
    const instances: MarketDataProvider[] = [];
    for (const key of getSettings().providerChain) {
      const Ctor = providerCtors[key];
      if (!Ctor) continue;
      const inst = new Ctor();
      if (inst.available()) instances.push(inst);
    }
    if (!instances.length) instances.push(new YFinanceProvider());
    return instances;
  }

  async failover<T>(fn: (p: MarketDataProvider) => Promise<T>, cacheKey: string | null, ttl: number): Promise<[T, string, number]> {
    if (cacheKey) {
      const hit = cacheGet<{ payload: T; source?: string }>(cacheKey);
      if (hit?.payload != null) return [hit.payload, hit.source || "Cache", 0];
    }
    const errors: string[] = [];
    let lastExc: unknown = null;
    for (const p of this.chain()) {
      const t0 = Date.now();
      try {
        const result = await fn(p);
        const latency = Date.now() - t0;
        this.health[p.name] = { status: "ok", latency_ms: latency, at: new Date().toISOString() };
        if (cacheKey) cacheSet(cacheKey, { payload: result, source: p.name }, ttl);
        return [result, p.name, latency];
      } catch (exc) {
        lastExc = exc;
        errors.push(`${p.name}: ${exc instanceof Error ? exc.message : String(exc)}`);
        this.health[p.name] = { status: "error", error: String(exc), at: new Date().toISOString() };
      }
    }
    if (cacheKey) {
      const cached = cacheGet<{ payload: T }>(cacheKey);
      if (cached?.payload) return [cached.payload, "Cache", 0];
    }
    const joined = errors.join(" | ");
    console.error("[analysis] all providers failed", { errors });
    if (errors.every((e) => /enough market data|no market data|no quote|no bars|delisted|404/i.test(e))) {
      throw new ProviderError("composite", "Unable to retrieve enough market data for the selected timeframe.");
    }
    throw new ProviderError("composite", "All providers failed: " + joined);
  }

  search(q: string) {
    const local = searchUniverse(q);
    if (local.length) return local;
    const needle = q.trim().toUpperCase();
    if (needle.length >= 1 && needle.length <= 6 && /^[A-Z0-9.]+$/.test(needle)) {
      return [{ symbol: needle, name: needle, exchange: "", type: "EQUITY" }];
    }
    return [];
  }

  async quote(symbol: string): Promise<Quote> {
    const cached = cacheGet<{ payload: Quote }>(`quote:${symbol.toUpperCase()}`);
    if (cached?.payload) {
      const q = cached.payload;
      const age = (Date.now() - new Date(q.freshness.timestamp).getTime()) / 1000;
      if (age < CACHE_TTL.quote) return q;
      if (age > getSettings().staleQuoteSeconds) q.freshness.data_status = "STALE";
    }
    const [result, source, latency] = await this.failover((p) => p.fetchQuote(symbol), `quote:${symbol.toUpperCase()}`, CACHE_TTL.quote);
    result.freshness.source = source;
    result.freshness.latency_ms = latency;
    return result;
  }

  async bars(symbol: string, timeframe: string, outputsize = 500): Promise<[OHLCVBar[], string, number]> {
    let key = `bars:${symbol.toUpperCase()}:${timeframe}`;
    if (outputsize !== 500) key += `:${outputsize}`;
    const [data, source, latency] = await this.failover((p) => p.fetchBars(symbol, timeframe, outputsize), key, CACHE_TTL[timeframe] || 60);
    return [reviveBars(data), source, latency];
  }

  async indicators(symbol: string, timeframe: string): Promise<[Indicators, OHLCVBar[], string, number]> {
    const [bars, source, latency] = await this.bars(symbol, timeframe);
    const spec = getTimeframeSpec(timeframe);
    const df = toFrame(bars);
    if (df.empty || df.rows.length < 15) {
      throw new HttpError(422, `Unable to retrieve enough market data for the selected timeframe.`);
    }
    if (df.rows.length < spec.minBars) {
      console.warn("[analysis] short history", { symbol, timeframe, bars: df.rows.length, min: spec.minBars });
    }
    const framed = computeAll(df);
    const lastRow = framed.rows[framed.rows.length - 1];
    const prev = framed.rows.length > 1 ? framed.rows[framed.rows.length - 2] : lastRow;
    const num = (row: typeof lastRow, col: string) => {
      const v = row[col];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const struct = structureFlags(framed.get("high"), framed.get("low"));
    const ind = emptyIndicators({
      ema9: last(framed.get("ema9")),
      ema20: last(framed.get("ema20")),
      ema21: last(framed.get("ema21")),
      ema50: last(framed.get("ema50")),
      ema200: last(framed.get("ema200")),
      ema9_slope: slope(framed.get("ema9")),
      ema20_slope: slope(framed.get("ema20")),
      ema21_slope: slope(framed.get("ema21")),
      ema50_slope: slope(framed.get("ema50")),
      ema200_slope: slope(framed.get("ema200")),
      rsi: last(framed.get("rsi")),
      rsi_prev: num(prev, "rsi"),
      macd: last(framed.get("macd")),
      macd_signal: last(framed.get("macd_signal")),
      macd_hist: last(framed.get("macd_hist")),
      macd_hist_prev: num(prev, "macd_hist"),
      vwap: last(framed.get("vwap")),
      atr: last(framed.get("atr")),
      bb_upper: last(framed.get("bb_upper")),
      bb_mid: last(framed.get("bb_mid")),
      bb_lower: last(framed.get("bb_lower")),
      volume_sma20: last(framed.get("volume_sma20")),
      volume_ratio: last(framed.get("volume_ratio")),
      last_volume: Number(lastRow.volume),
      last_close: Number(lastRow.close),
      last_high: Number(lastRow.high),
      last_low: Number(lastRow.low),
      ...struct,
    });
    return [ind, bars, source, latency];
  }

  async levels(symbol: string, timeframe: string) {
    const [ind, bars, source, latency] = await this.indicators(symbol, timeframe);
    const lv = calculateLevels(toFrame(bars), ind, ind.last_close || 0);
    return [lv, ind, bars, source, latency] as const;
  }

  async first(method: "fetchFundamentals" | "fetchEarnings" | "fetchNews", symbol: string) {
    for (const p of this.chain()) {
      try {
        if (method === "fetchNews") {
          const val = await p.fetchNews?.(symbol);
          if (val && val.length) return val;
          continue;
        }
        const val = method === "fetchFundamentals" ? await p.fetchFundamentals?.(symbol) : await p.fetchEarnings?.(symbol);
        if (val) return val;
      } catch {
        continue;
      }
    }
    return method === "fetchNews" ? [] : null;
  }

  async marketOverview(sector?: string | null) {
    const cached = cacheGet<{ payload: Record<string, unknown> }>("market:overview");
    if (cached?.payload) {
      const data = { ...cached.payload };
      if (sector) {
        const etf = SECTOR_ETF[sector];
        if (etf) {
          try {
            const q = await this.quote(etf);
            data.sector = sector;
            data.sector_etf = etf;
            data.sector_change_pct = q.change_percent;
          } catch {
            /* ignore */
          }
        }
      }
      return data;
    }
    const out: Record<string, unknown> = { as_of: new Date().toISOString() };
    const mapping: Record<string, string> = { spx: "^GSPC", ndx: "^NDX", dji: "^DJI", vix: "^VIX", qqq: "QQQ" };
    const sectorPairs: [string, string][] = [
      ["Technology", "XLK"],
      ["Financials", "XLF"],
      ["Energy", "XLE"],
      ["Health Care", "XLV"],
      ["Consumer Discretionary", "XLY"],
      ["Industrials", "XLI"],
      ["Communication", "XLC"],
      ["Semiconductors", "SOXX"],
    ];
    await Promise.all(
      Object.entries(mapping).map(async ([key, sym]) => {
        try {
          const q = await this.quote(sym);
          out[key] = q.price;
          out[`${key}_change_pct`] = q.change_percent;
          out[`${key}_change`] = q.change;
        } catch {
          out[key] = null;
        }
      }),
    );
    const sectors: Record<string, { etf: string; price: number; change_percent?: number | null }> = {};
    await Promise.all(
      sectorPairs.map(async ([name, etf]) => {
        try {
          const q = await this.quote(etf);
          sectors[name] = { etf, price: q.price, change_percent: q.change_percent };
        } catch {
          /* skip */
        }
      }),
    );
    out.sectors = sectors;
    if (sector) {
      const etf = SECTOR_ETF[sector];
      const match = Object.values(sectors).find((s) => s.etf === etf);
      if (etf && match) {
        out.sector = sector;
        out.sector_etf = etf;
        out.sector_change_pct = match.change_percent;
      }
    }
    cacheSet("market:overview", { payload: out, source: "composite" }, CACHE_TTL.macro);
    return out;
  }

  async analyze(symbol: string, timeframe: string, withMtf = true) {
    const settings = getSettings();
    const t0 = Date.now();
    const quote = await this.quote(symbol);
    const [levels, ind, bars, source] = await this.levels(symbol, timeframe);
    let fund: Record<string, unknown> | null = null;
    let earn: Record<string, unknown> | null = null;
    let rates: Record<string, unknown> | null = null;
    let news: Record<string, unknown>[] = [];
    let market: Record<string, unknown> | null = null;
    try {
      fund = (await this.first("fetchFundamentals", symbol)) as Record<string, unknown> | null;
    } catch {
      fund = null;
    }
    try {
      earn = (await this.first("fetchEarnings", symbol)) as Record<string, unknown> | null;
    } catch {
      earn = null;
    }
    try {
      news = ((await this.first("fetchNews", symbol)) as Record<string, unknown>[]) || [];
    } catch {
      news = [];
    }
    try {
      rates = await this.fred.dgs10();
    } catch {
      rates = null;
    }
    try {
      market = await this.marketOverview(quote.sector || null);
    } catch {
      market = null;
    }

    const stale = quote.freshness.data_status === "STALE";
    const [cats, score, b, n, be] = scoreAll(symbol, timeframe, ind, levels, quote.freshness, fund, earn, market, rates, news, quote.sector);
    const [longPlan, shortPlan] = buildPlans(ind, levels, timeframe);
    const rawLabel = classify(score);
    let tfBearish = false;
    if (cats.length) {
      const trend = cats.find((c) => c.name === "Price Trend");
      tfBearish = trend?.status === "BEARISH";
    }
    let [label, filters] = applyHardFilters(rawLabel, score, ind, levels, longPlan, market, earn, stale, tfBearish);
    if (filters.length) {
      longPlan.trade_allowed = false;
      longPlan.block_reason = filters[0];
    }

    let mtfLabels: Record<string, SignalLabel> | null = null;
    let mtfTable: Record<string, unknown> | null = null;
    if (withMtf) {
      const lite = await this.mtfLite(symbol, timeframe, [timeframe, rawLabel, ind, score]);
      mtfTable = lite[0];
      mtfLabels = lite[1];
    }

    const volumeOk = (ind.volume_ratio || 0) >= 1.2;
    const marketOk = !(market && ((market.spx_change_pct as number) || 0) < -0.8);
    const conf = computeConfidence(label, mtfLabels, volumeOk, longPlan.risk_reward, marketOk);
    let alignment: string | null = null;
    let alignN: number | null = null;
    let alignT: number | null = null;
    if (mtfLabels) {
      const bullish = new Set<SignalLabel>(["BUY", "STRONG_BUY"]);
      alignN = Object.values(mtfLabels).filter((v) => bullish.has(v)).length;
      alignT = Object.keys(mtfLabels).length;
      alignment = `${alignN} / ${alignT} BULLISH`;
    }
    let mtfNote: string | null = null;
    if (mtfLabels) {
      const higher = mtfLabels["1d"] || mtfLabels["4h"];
      if (timeframe === "5m" && (higher === "WAIT" || higher === "WEAK" || higher === "SELL")) {
        mtfNote = "Short-term momentum may be bullish, but higher timeframe is not aligned.";
      } else if (timeframe === "1h") {
        mtfNote = "Higher-timeframe context is shown in the multi-timeframe matrix.";
      }
    }

    const lastBar = bars[bars.length - 1];
    const result = {
      symbol: symbol.toUpperCase(),
      timeframe,
      timeframe_label: TIMEFRAME_LABELS[timeframe],
      score,
      signal: label,
      confidence: conf,
      bullish_signals: b,
      neutral_signals: n,
      bearish_signals: be,
      categories: cats,
      explanation: buildExplanation(timeframe, label, cats, longPlan, mtfNote),
      hard_filters: filters,
      alignment,
      alignment_bullish: alignN,
      alignment_total: alignT,
      data_timestamp: lastBar ? asDate(lastBar.timestamp).toISOString() : new Date().toISOString(),
      algorithm_version: settings.algorithmVersion,
      freshness: {
        source,
        timestamp: new Date().toISOString(),
        data_status: quote.freshness.data_status,
        latency_ms: Date.now() - t0,
        algorithm_version: settings.algorithmVersion,
      },
    };

    const chartBars = bars.slice(-300).map((b) => ({
      time: Math.floor(asDate(b.timestamp).getTime() / 1000),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    return {
      quote: serializeQuote(quote),
      indicators: ind,
      levels,
      signal: result,
      long_plan: longPlan,
      short_plan: shortPlan,
      bars: chartBars,
      fundamentals: fund,
      earnings: earn,
      rates,
      news: news.slice(0, 12),
      market,
      multi_timeframe: mtfTable,
      freshness: result.freshness,
    };
  }

  async mtfLite(symbol: string, skip: string | null, seed?: [string, SignalLabel, Indicators, number]) {
    const table: Record<string, unknown> = {};
    const labels: Record<string, SignalLabel> = {};
    await Promise.all(
      TIMEFRAMES.map(async (tf) => {
        try {
          if (seed && tf === seed[0]) {
            table[tf] = rowFromInd(seed[2], seed[1], seed[3]);
            labels[tf] = seed[1];
            return;
          }
          const [ind, bars] = await this.indicators(symbol, tf);
          const lv = calculateLevels(toFrame(bars), ind, ind.last_close || 0);
          const [, score] = scoreAll(symbol, tf, ind, lv, null);
          const label = classify(score);
          table[tf] = rowFromInd(ind, label, score);
          labels[tf] = label;
        } catch (exc) {
          table[tf] = { error: String(exc), signal: "UNAVAILABLE" };
        }
      }),
    );
    const ordered = Object.fromEntries(TIMEFRAMES.map((tf) => [tf, table[tf] || { signal: "UNAVAILABLE" }]));
    return [ordered, labels] as const;
  }

  providerHealth() {
    return { chain: this.chain().map((p) => ({ name: p.name, available: true })), health: this.health };
  }
}

function rowFromInd(ind: Indicators, label: SignalLabel, score: number) {
  let trend = "↑";
  if (ind.ema9 && ind.ema21) trend = ind.ema9 >= ind.ema21 ? "↑" : "↓";
  else if (ind.ema20 && ind.ema50) trend = ind.ema20 >= ind.ema50 ? "↑" : "↓";
  const macd = ind.macd != null && ind.macd_signal != null && ind.macd > ind.macd_signal ? "↑" : "↓";
  let vwapRel = "N/A";
  if (ind.vwap && ind.last_close) vwapRel = ind.last_close > ind.vwap ? "Above" : "Below";
  let vol = "Normal";
  if (ind.volume_ratio != null) {
    if (ind.volume_ratio >= 1.5) vol = "Strong";
    else if (ind.volume_ratio >= 1.2) vol = "Good";
    else if (ind.volume_ratio < 0.8) vol = "Weak";
  }
  return {
    trend,
    rsi: ind.rsi != null ? Math.round(ind.rsi * 10) / 10 : null,
    macd,
    vwap: vwapRel,
    volume: vol,
    score,
    signal: label,
  };
}

export function asDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

export function reviveBars(bars: OHLCVBar[]): OHLCVBar[] {
  return bars.map((bar) => ({
    ...bar,
    timestamp: asDate(bar.timestamp as Date | string | number),
  }));
}

export const analysis = new AnalysisService();
