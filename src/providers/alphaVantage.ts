import { AV_INTERVAL, getSettings } from "@/src/config/env";
import { httpGetJson, toFloat } from "@/src/lib/http";
import { ProviderError, freshness } from "@/src/providers/base";
import type { MarketDataProvider } from "@/src/providers/base";
import { barsToFrame } from "@/src/engines/indicators";
import { resampleOhlcv } from "@/src/lib/series";
import type { OHLCVBar, Quote } from "@/src/types/domain";

export class AlphaVantageProvider implements MarketDataProvider {
  name = "AlphaVantage";
  available() {
    return Boolean(getSettings().alphaVantageApiKey);
  }

  private async get(params: Record<string, string>) {
    const settings = getSettings();
    const data = await httpGetJson<Record<string, unknown>>(settings.alphaVantageBaseUrl, {
      ...params,
      apikey: settings.alphaVantageApiKey,
    });
    if (data.Note || data.Information) {
      throw new ProviderError(this.name, String(data.Note || data.Information || "rate limited"));
    }
    if (data["Error Message"]) throw new ProviderError(this.name, String(data["Error Message"]));
    return data;
  }

  async fetchQuote(symbol: string): Promise<Quote> {
    const data = await this.get({ function: "GLOBAL_QUOTE", symbol });
    const q = (data["Global Quote"] || {}) as Record<string, string>;
    if (!q || !q["05. price"]) throw new ProviderError(this.name, `No quote for ${symbol}`);
    const price = Number(q["05. price"]);
    const prev = Number(q["08. previous close"] || price);
    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      exchange: "",
      sector: "",
      industry: "",
      price,
      open: toFloat(q["02. open"]),
      high: toFloat(q["03. high"]),
      low: toFloat(q["04. low"]),
      previous_close: prev,
      change: toFloat(q["09. change"]),
      change_percent: Number(String(q["10. change percent"] || "0").replace("%", "") || 0),
      volume: toFloat(q["06. volume"]),
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
      freshness: freshness(this.name, "DELAYED"),
    };
  }

  async fetchBars(symbol: string, timeframe: string, outputsize = 500): Promise<OHLCVBar[]> {
    let series: Record<string, Record<string, string>> = {};
    if (timeframe === "1d") {
      const data = await this.get({ function: "TIME_SERIES_DAILY", symbol, outputsize: "full" });
      series = (data["Time Series (Daily)"] || {}) as Record<string, Record<string, string>>;
    } else {
      const interval = AV_INTERVAL[timeframe] || "60min";
      const data = await this.get({
        function: "TIME_SERIES_INTRADAY",
        symbol,
        interval,
        outputsize: "full",
        adjusted: "false",
      });
      series = (data[`Time Series (${interval})`] || {}) as Record<string, Record<string, string>>;
    }
    if (!series || !Object.keys(series).length) {
      throw new ProviderError(this.name, `Empty AV series for ${symbol} ${timeframe}`);
    }
    let bars: OHLCVBar[] = Object.entries(series)
      .map(([k, v]) => ({
        symbol: symbol.toUpperCase(),
        timestamp: new Date(k.includes("T") || k.includes(" ") ? k.replace(" ", "T") + "Z" : k + "T00:00:00Z"),
        open: Number(v["1. open"]),
        high: Number(v["2. high"]),
        low: Number(v["3. low"]),
        close: Number(v["4. close"]),
        volume: Number(v["5. volume"] || 0),
        timeframe,
        source: this.name,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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
        source: this.name,
      }));
    }
    return bars.slice(-outputsize);
  }

  async fetchNews(symbol: string, limit = 20): Promise<Record<string, unknown>[]> {
    const data = await this.get({ function: "NEWS_SENTIMENT", tickers: symbol, limit: String(limit) });
    const feed = (data.feed || []) as Array<Record<string, unknown>>;
    return feed.slice(0, limit).map((item) => {
      let sent = "neutral";
      for (const t of (item.ticker_sentiment as Array<Record<string, unknown>>) || []) {
        if (t.ticker === symbol.toUpperCase()) {
          const score = Number(t.ticker_sentiment_score || 0);
          sent = score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral";
        }
      }
      const topics = ((item.topics as Array<Record<string, string>>) || []).map((x) => x.topic);
      const joined = `${topics.join(" ")} ${item.title || ""}`.toLowerCase();
      let cat = "General";
      if (joined.includes("earnings")) cat = "Earnings";
      else if (joined.includes("economy") || joined.includes("financial markets")) cat = "Macro";
      return {
        id: item.url || item.title,
        headline: item.title,
        source: item.source,
        url: item.url,
        published_at: item.time_published,
        sentiment: sent,
        category: cat,
      };
    });
  }
}
