import { TWELVE_INTERVAL, getSettings } from "@/src/config/env";
import { httpGetJson, toFloat } from "@/src/lib/http";
import { ProviderError, freshness } from "@/src/providers/base";
import type { MarketDataProvider } from "@/src/providers/base";
import type { OHLCVBar, Quote } from "@/src/types/domain";

export class TwelveDataProvider implements MarketDataProvider {
  name = "TwelveData";
  available() {
    return Boolean(getSettings().twelveDataApiKey);
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const settings = getSettings();
    const data = await httpGetJson<T & { status?: string; message?: string }>(
      `${settings.twelveDataBaseUrl.replace(/\/$/, "")}${path}`,
      { ...params, apikey: settings.twelveDataApiKey },
    );
    if (data && typeof data === "object" && (data as { status?: string }).status === "error") {
      throw new ProviderError(this.name, (data as { message?: string }).message || "Twelve Data error");
    }
    return data;
  }

  async fetchQuote(symbol: string): Promise<Quote> {
    const data = await this.get<Record<string, unknown>>("/quote", { symbol });
    const price = Number(data.close);
    const prev = Number(data.previous_close || price);
    return {
      symbol: symbol.toUpperCase(),
      name: String(data.name || symbol),
      exchange: String(data.exchange || ""),
      sector: "",
      industry: "",
      price,
      open: toFloat(data.open),
      high: toFloat(data.high),
      low: toFloat(data.low),
      previous_close: prev,
      change: Number(data.change || price - prev),
      change_percent: Number(data.percent_change || 0),
      volume: toFloat(data.volume),
      average_volume: toFloat(data.average_volume),
      volume_ratio: null,
      market_cap: toFloat(data.market_cap),
      pe: null,
      forward_pe: null,
      beta: null,
      week52_low: null,
      week52_high: null,
      currency: "USD",
      market_state: "UNKNOWN",
      freshness: freshness(this.name, "LIVE"),
    };
  }

  async fetchBars(symbol: string, timeframe: string, outputsize = 500): Promise<OHLCVBar[]> {
    const data = await this.get<{ values?: Array<Record<string, string>> }>("/time_series", {
      symbol,
      interval: TWELVE_INTERVAL[timeframe] || "1day",
      outputsize: String(outputsize),
      timezone: "UTC",
    });
    const values = [...(data.values || [])].reverse();
    const bars = values.map((row) => {
      let ts = new Date(row.datetime.replace(" ", "T") + (row.datetime.includes("Z") ? "" : "Z"));
      if (Number.isNaN(ts.getTime())) ts = new Date(row.datetime + "Z");
      return {
        symbol: symbol.toUpperCase(),
        timestamp: ts,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume || 0),
        timeframe,
        source: this.name,
      };
    });
    if (!bars.length) throw new ProviderError(this.name, `Empty time series for ${symbol} ${timeframe}`);
    return bars;
  }

  async fetchFundamentals(symbol: string): Promise<Record<string, unknown> | null> {
    try {
      const data = await this.get<Record<string, unknown>>("/statistics", { symbol });
      const stats = (data.statistics || data) as Record<string, unknown>;
      const val = (stats.valuations_metrics || {}) as Record<string, unknown>;
      const fin = (stats.financials || {}) as Record<string, unknown>;
      const gm = fin.gross_margin;
      return {
        pe: toFloat(val.trailing_pe),
        forward_pe: toFloat(val.forward_pe),
        peg: toFloat(val.peg_ratio),
        price_to_sales: toFloat(val.price_to_sales_ttm),
        gross_margin: toFloat(typeof gm === "object" && gm ? (gm as Record<string, unknown>).ttm : gm),
        source: this.name,
      };
    } catch {
      return null;
    }
  }

  async fetchEarnings(symbol: string): Promise<Record<string, unknown> | null> {
    let est: unknown = {};
    let rec: unknown = {};
    try {
      est = await this.get("/earnings_estimate", { symbol });
    } catch {
      est = {};
    }
    try {
      rec = await this.get("/recommendations", { symbol });
    } catch {
      rec = {};
    }
    return { eps_revision_trend: "stable", recommendations: rec, estimates: est, source: this.name };
  }
}
