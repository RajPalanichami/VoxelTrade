import { getSettings } from "@/src/config/env";
import { httpGetJson, toFloat } from "@/src/lib/http";
import { ProviderError, freshness } from "@/src/providers/base";
import type { MarketDataProvider } from "@/src/providers/base";
import type { OHLCVBar, Quote } from "@/src/types/domain";

export class FinnhubProvider implements MarketDataProvider {
  name = "Finnhub";
  available() {
    return Boolean(getSettings().finnhubApiKey);
  }

  private async get<T>(path: string, params: Record<string, string | number>) {
    const settings = getSettings();
    return httpGetJson<T>(`${settings.finnhubBaseUrl.replace(/\/$/, "")}${path}`, {
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      token: settings.finnhubApiKey,
    });
  }

  async fetchQuote(symbol: string): Promise<Quote> {
    const q = await this.get<Record<string, number>>("/quote", { symbol });
    if (!q || q.c == null || q.c === 0) throw new ProviderError(this.name, `No Finnhub quote for ${symbol}`);
    const price = Number(q.c);
    const prev = Number(q.pc || price);
    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      exchange: "",
      sector: "",
      industry: "",
      price,
      open: toFloat(q.o),
      high: toFloat(q.h),
      low: toFloat(q.l),
      previous_close: prev,
      change: toFloat(q.d),
      change_percent: toFloat(q.dp),
      volume: null,
      average_volume: null,
      volume_ratio: null,
      market_cap: null,
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
    const res = ({ "5m": "5", "30m": "30", "1h": "60", "1d": "D" } as Record<string, string>)[timeframe];
    if (!res) throw new ProviderError(this.name, `Finnhub does not natively support ${timeframe}`);
    const now = Math.floor(Date.now() / 1000);
    const span = { "5": 60 * 86400, "30": 90 * 86400, "60": 400 * 86400, D: 2000 * 86400 }[res]!;
    const data = await this.get<{ s?: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] }>(
      "/stock/candle",
      { symbol, resolution: res, from: now - span, to: now },
    );
    if (data.s !== "ok" || !data.t?.length) throw new ProviderError(this.name, `Finnhub candles ${data.s}`);
    const start = Math.max(0, data.t.length - outputsize);
    const bars: OHLCVBar[] = [];
    for (let idx = start; idx < data.t.length; idx++) {
      bars.push({
        symbol: symbol.toUpperCase(),
        timestamp: new Date(data.t[idx] * 1000),
        open: Number(data.o![idx]),
        high: Number(data.h![idx]),
        low: Number(data.l![idx]),
        close: Number(data.c![idx]),
        volume: Number(data.v![idx]),
        timeframe,
        source: this.name,
      });
    }
    return bars;
  }

  async fetchNews(symbol: string, limit = 20): Promise<Record<string, unknown>[]> {
    const to = new Date();
    const frm = new Date(to.getTime() - 14 * 86400000);
    const data = await this.get<Array<Record<string, unknown>>>("/company-news", {
      symbol,
      from: frm.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
    if (!Array.isArray(data)) return [];
    return data.slice(0, limit).map((item) => ({
      id: String(item.id || item.url),
      headline: item.headline,
      source: item.source,
      url: item.url,
      published_at: item.datetime ? new Date(Number(item.datetime) * 1000).toISOString() : null,
      sentiment: "neutral",
      category: item.category || "General",
    }));
  }
}
