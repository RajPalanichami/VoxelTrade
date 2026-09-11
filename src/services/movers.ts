import { CACHE_TTL, getSettings } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { httpGetJson } from "@/src/lib/http";

const NON_EQUITY = new Set(["ETF", "ETN", "MUTUALFUND", "WARRANT", "PREFERRED", "CLOSEDEND", "INDEX", "CRYPTOCURRENCY", "ECNQUOTE"]);

export type MoverCfg = {
  min_significant: number;
  min_gainer: number;
  min_loser: number;
  min_price: number;
  min_volume: number;
  exclude_etf: boolean;
  exclude_otc: boolean;
  exchanges: Set<string>;
};

export function moverCfg(): MoverCfg {
  const s = getSettings();
  return {
    min_significant: s.moversMinSignificantMove,
    min_gainer: s.moversMinGainerPercent,
    min_loser: s.moversMinLoserPercent,
    min_price: s.moversMinPrice,
    min_volume: s.moversMinVolume,
    exclude_etf: s.moversExcludeEtf,
    exclude_otc: s.moversExcludeOtc,
    exchanges: new Set(s.moversExchanges.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean)),
  };
}

export function calculatedChangePercent(price: number, previousClose: number): number {
  return ((price - previousClose) / previousClose) * 100;
}

export function isValidMover(row: Record<string, unknown>, cfg?: MoverCfg): boolean {
  const c = cfg || moverCfg();
  if (row.price == null || row.previous_close == null) return false;
  const price = Number(row.price);
  const prev = Number(row.previous_close);
  const vol = Number(row.volume || 0);
  if (!Number.isFinite(price) || !Number.isFinite(prev) || price <= 0 || prev <= 0) return false;
  if (price < c.min_price || vol < c.min_volume) return false;
  const qtype = String(row.quote_type || "EQUITY").toUpperCase();
  if (c.exclude_etf && NON_EQUITY.has(qtype)) return false;
  const exch = String(row.exchange || "").toUpperCase();
  if (c.exclude_otc && ["PNK", "OTC", "OTCBB", "OTCQB", "OTCQX", "GREY"].includes(exch)) return false;
  const calc = calculatedChangePercent(price, prev);
  const providedRaw = row.change_percent == null ? null : Number(row.change_percent);
  if (providedRaw == null || !Number.isFinite(providedRaw)) {
    row.change_percent = calc;
  } else if (Math.abs(providedRaw) > 900 || (Math.abs(providedRaw - calc) > 8 && Math.abs(calc) < 400)) {
    row.change_percent = calc;
  }
  row.change = price - prev;
  return true;
}

function normalizeYahoo(q: Record<string, unknown>) {
  return {
    symbol: q.symbol,
    name: q.shortName || q.longName || q.symbol,
    price: q.regularMarketPrice,
    previous_close: q.regularMarketPreviousClose,
    change: q.regularMarketChange,
    change_percent: q.regularMarketChangePercent,
    volume: q.regularMarketVolume,
    quote_type: q.quoteType,
    exchange: q.fullExchangeName || q.exchange,
    source: "yahoo-screener",
  };
}

async function yahooScreener(scrId: string, count = 40) {
  const settings = getSettings();
  const body = await httpGetJson<{ finance?: { result?: Array<{ quotes?: Array<Record<string, unknown>> }> } }>(
    settings.yahooScreenerUrl,
    { formatted: "false", scrIds: scrId, count: String(count) },
    { "User-Agent": settings.resolvedSecUserAgent(), Accept: "application/json" },
  );
  const quotes = body.finance?.result?.[0]?.quotes || [];
  const out: Record<string, unknown>[] = [];
  for (const q of quotes) {
    const row = normalizeYahoo(q);
    if (row.symbol && isValidMover(row)) out.push(row);
  }
  return out;
}

async function twelveMovers() {
  const key = getSettings().twelveDataApiKey;
  if (!key) return null;
  try {
    const settings = getSettings();
    const body = await httpGetJson<{ values?: Record<string, Array<Record<string, unknown>>> }>(
      settings.twelveDataMoversUrl,
      { apikey: key, country: "United States" },
    );
    const values = body.values || (body as unknown as Record<string, Array<Record<string, unknown>>>);
    if (!values || typeof values !== "object") return null;
    const conv = (items: Array<Record<string, unknown>> = []) => {
      const rows: Record<string, unknown>[] = [];
      for (const it of items) {
        const row = {
          symbol: it.symbol,
          name: it.name || it.symbol,
          price: it.last || it.price || it.close,
          previous_close: it.previous_close || it.close,
          change: it.change,
          change_percent: it.percent_change || it.change_percent,
          volume: it.volume,
          quote_type: "EQUITY",
          exchange: it.exchange,
          source: "twelve_data",
        };
        if (row.symbol && isValidMover(row)) rows.push(row);
      }
      return rows;
    };
    return {
      gainers: conv((values as Record<string, Array<Record<string, unknown>>>).gainers),
      losers: conv((values as Record<string, Array<Record<string, unknown>>>).losers),
      active: conv((values as Record<string, Array<Record<string, unknown>>>).actives || (values as Record<string, Array<Record<string, unknown>>>).most_active),
    };
  } catch {
    return null;
  }
}

export function rankMovers(rows: Record<string, unknown>[], losers: boolean, cfg: MoverCfg): Record<string, unknown>[] {
  const unique = new Map<string, Record<string, unknown>>();
  for (const r of rows) unique.set(String(r.symbol).toUpperCase(), r);
  const items = [...unique.values()].sort((a, b) => (Number(b.change_percent) || 0) - (Number(a.change_percent) || 0));
  if (losers) items.sort((a, b) => (Number(a.change_percent) || 0) - (Number(b.change_percent) || 0));
  const threshold = cfg.min_significant;
  const extra = losers ? cfg.min_loser : cfg.min_gainer;
  const cut = losers ? -Math.abs(extra === 0 ? threshold : extra) : Math.abs(extra === 0 ? threshold : extra);
  const significant: Record<string, unknown>[] = [];
  const rest: Record<string, unknown>[] = [];
  for (const r of items) {
    const pct = Number(r.change_percent) || 0;
    if (losers && pct <= cut) significant.push(r);
    else if (!losers && pct >= cut) significant.push(r);
    else rest.push(r);
  }
  return [...significant, ...rest].slice(0, 5).map((r) => ({
    symbol: r.symbol,
    name: r.name,
    price: r.price,
    change: r.change,
    change_percent: r.change_percent,
    volume: r.volume,
  }));
}

export async function scanMarketMovers() {
  const cached = cacheGet<{ payload: Record<string, unknown> }>("movers:marketwide:v1");
  if (cached?.payload) return cached.payload;
  const cfg = moverCfg();
  let gainers: Record<string, unknown>[] = [];
  let losers: Record<string, unknown>[] = [];
  let active: Record<string, unknown>[] = [];
  const td = await twelveMovers();
  if (td) {
    gainers = td.gainers;
    losers = td.losers;
    active = td.active;
  }
  if (gainers.length < 5 || losers.length < 5) {
    try {
      const [yg, yl, ya] = await Promise.all([yahooScreener("day_gainers"), yahooScreener("day_losers"), yahooScreener("most_actives")]);
      gainers = [...gainers, ...yg];
      losers = [...losers, ...yl];
      if (!active.length) active = ya;
    } catch {
      /* ignore */
    }
  }
  const payload = {
    gainers: rankMovers(gainers, false, cfg),
    losers: rankMovers(losers, true, cfg),
    active: active.length ? rankMovers(active, false, { ...cfg, min_significant: 0, min_gainer: 0 }).slice(0, 8) : [],
    universe: "market-wide",
  };
  if (!payload.active.length && active.length) {
    payload.active = [...active]
      .sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))
      .slice(0, 8)
      .map((r) => ({
        symbol: r.symbol,
        name: r.name,
        price: r.price,
        change: r.change,
        change_percent: r.change_percent || 0,
        volume: r.volume,
      }));
  }
  cacheSet("movers:marketwide:v1", { payload, source: "market-wide" }, CACHE_TTL.movers);
  return payload;
}
