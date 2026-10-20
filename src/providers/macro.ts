import { CACHE_TTL, getSettings } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { httpGetJson, httpGetText, toFloat } from "@/src/lib/http";
import { singleFlight } from "@/src/lib/singleFlight";
import { YFinanceProvider } from "@/src/providers/yfinance";

const YF_YIELD: Record<string, string> = { DGS10: "^TNX", DGS30: "^TYX" };

export async function fetchFredCsv(seriesId: string): Promise<[string, number][] | null> {
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 4);
  const cosd = start.toISOString().slice(0, 10);
  const key = `fred:csv:v2:${seriesId}:${cosd}`;
  const cached = cacheGet<[string, number][]>(key);
  if (cached?.length) return cached;
  return singleFlight(key, async () => {
    const again = cacheGet<[string, number][]>(key);
    if (again?.length) return again;
    const settings = getSettings();
    const text = await httpGetText(settings.fredCsvUrl, { id: seriesId, cosd }, { "User-Agent": settings.resolvedSecUserAgent() });
    const rows: [string, number][] = [];
    for (const line of text.split(/\r?\n/).slice(1)) {
      const parts = line.split(",");
      if (parts.length < 2 || [".", "", "NA"].includes(parts[1])) continue;
      const n = Number(parts[1]);
      if (!Number.isFinite(n)) continue;
      rows.push([parts[0].trim(), n]);
    }
    const trimmed = rows.length ? rows.slice(-450) : null;
    if (trimmed) cacheSet(key, trimmed, CACHE_TTL.macro);
    return trimmed;
  });
}

export function fromYields(vals: [string, number][], source: string) {
  const y = vals[vals.length - 1][1];
  const d1 = vals.length > 1 ? y - vals[vals.length - 2][1] : 0;
  const d5 = vals.length > 6 ? y - vals[vals.length - 6][1] : null;
  const window = vals.length >= 20 ? vals.slice(-20) : vals;
  const slope = window[window.length - 1][1] - window[0][1];
  const trend = slope < -0.08 ? "falling" : slope > 0.08 ? "rising" : "stable";
  return { yield: y, change_1d: d1, change_5d: d5, trend_20d: trend, as_of: vals[vals.length - 1][0], source };
}

export class FredProvider {
  name = "FRED";
  available() {
    return Boolean(getSettings().fredApiKey);
  }

  async dgs10() {
    return this.series("DGS10");
  }

  async series(seriesId: string) {
    if (this.available()) {
      try {
        const settings = getSettings();
        const data = await httpGetJson<{ observations?: Array<{ date: string; value: string }> }>(settings.fredApiBaseUrl, {
          series_id: seriesId,
          api_key: settings.fredApiKey,
          file_type: "json",
          sort_order: "desc",
          limit: "40",
        });
        const obs = (data.observations || []).filter((o) => o.value && o.value !== ".");
        if (obs.length) {
          const vals = obs.map((o) => [o.date, Number(o.value)] as [string, number]).sort((a, b) => a[0].localeCompare(b[0]));
          return fromYields(vals, `FRED ${seriesId}`);
        }
      } catch {
        /* fall through */
      }
    }
    try {
      const csv = await fetchFredCsv(seriesId);
      if (csv) return fromYields(csv, `FRED CSV ${seriesId}`);
    } catch {
      /* fall through */
    }
    const yfSym = YF_YIELD[seriesId];
    if (yfSym) return this.fallbackViaYahoo(yfSym);
    return null;
  }

  private async fallbackViaYahoo(symbol: string) {
    try {
      const yf = new YFinanceProvider();
      const bars = await yf.fetchBars(symbol, "1d", 80);
      const series: [string, number][] = bars.map((b) => {
        let val = b.close;
        if (val > 20) val = val / 10;
        return [b.timestamp.toISOString().slice(0, 10), val];
      });
      return fromYields(series, `yfinance:${symbol}`);
    } catch {
      return null;
    }
  }
}

export class SecProvider {
  name = "SEC";
  private map: Record<string, string> | null = null;

  private headers() {
    return {
      "User-Agent": getSettings().resolvedSecUserAgent(),
      "Accept-Encoding": "gzip, deflate",
    };
  }

  async cikFor(symbol: string): Promise<string | null> {
    if (!this.map) {
      try {
        const settings = getSettings();
        const data = await httpGetJson<Record<string, { ticker: string; cik_str: number }>>(settings.secTickersUrl, undefined, this.headers());
        this.map = {};
        for (const row of Object.values(data)) {
          this.map[String(row.ticker).toUpperCase()] = String(row.cik_str).padStart(10, "0");
        }
      } catch {
        this.map = {};
      }
    }
    return this.map[symbol.toUpperCase()] || null;
  }

  async companyFacts(symbol: string) {
    const cik = await this.cikFor(symbol);
    if (!cik) return null;
    try {
      const settings = getSettings();
      return await httpGetJson(settings.secFactsUrl.replace("{cik}", cik), undefined, this.headers());
    } catch {
      return null;
    }
  }
}

export function toFloatSafe(v: unknown) {
  return toFloat(v);
}
