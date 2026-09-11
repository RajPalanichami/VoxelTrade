import { CACHE_TTL } from "@/src/config/env";
import { attachMacroStatus } from "@/src/engines/regime";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { fetchFredCsv } from "@/src/providers/macro";
import { fetchCpi } from "@/src/providers/inflation";
import { analysis } from "@/src/services/analysis";
import { scanMarketMovers } from "@/src/services/movers";

const PULSE_RANGE: Record<string, string> = { "1D": "5m", "1W": "1h", "1M": "1d", "3M": "1d", "1Y": "1d" };
const RANGE_BARS: Record<string, number> = { "1D": 90, "1W": 50, "1M": 24, "3M": 70, "1Y": 260 };

const INDICES = [
  { symbol: "SPY", display: "SPY", name: "SPDR S&P 500 ETF", unit: "usd" },
  { symbol: "QQQ", display: "QQQ", name: "Invesco QQQ Trust", unit: "usd" },
  { symbol: "IWM", display: "IWM", name: "iShares Russell 2000 ETF", unit: "usd" },
  { symbol: "^VIX", display: "VIX", name: "CBOE Volatility Index", unit: "pts" },
  { symbol: "^TNX", display: "US10Y", name: "U.S. 10-Year Treasury Yield", unit: "yield" },
  { symbol: "^TYX", display: "US30Y", name: "U.S. 30-Year Treasury Yield", unit: "yield" },
  { symbol: "DX-Y.NYB", display: "DXY", name: "US Dollar Index", unit: "pts" },
  { symbol: "CL=F", display: "WTI", name: "WTI Crude Oil", unit: "usd" },
  { symbol: "BZ=F", display: "BRENT", name: "Brent Crude Oil", unit: "usd" },
  { symbol: "^GSPC", display: "SPX", name: "S&P 500", unit: "pts" },
  { symbol: "^IXIC", display: "COMP", name: "Nasdaq Composite", unit: "pts" },
  { symbol: "BTC-USD", display: "BTC", name: "Bitcoin", unit: "usd" },
];

const PERF_KEYS = ["SPY", "QQQ", "IWM", "^GSPC", "^IXIC"];
const MOVER_UNIVERSE = ["NVDA", "AMD", "TSLA", "AAPL", "MSFT", "AMZN", "META", "GOOGL", "AVGO", "MU", "NFLX", "AMAT", "SMCI", "PLTR", "COIN", "CRM", "ORCL", "INTC", "QCOM", "UBER"];
const SECTORS: [string, string, string][] = [
  ["Technology", "XLK", "#38bdf8"],
  ["Communication Services", "XLC", "#a78bfa"],
  ["Financials", "XLF", "#34d399"],
  ["Energy", "XLE", "#fbbf24"],
  ["Health Care", "XLV", "#fb7185"],
  ["Consumer Discretionary", "XLY", "#fb923c"],
  ["Industrials", "XLI", "#94a3b8"],
  ["Consumer Staples", "XLP", "#22d3ee"],
  ["Materials", "XLB", "#c084fc"],
  ["Utilities", "XLU", "#4ade80"],
  ["Real Estate", "XLRE", "#60a5fa"],
  ["Semiconductors", "SOXX", "#f472b6"],
];

async function closes(symbol: string, timeframe: string, limit: number) {
  const [bars] = await analysis.bars(symbol, timeframe);
  return bars.slice(-limit).map((b) => ({ time: Math.floor(b.timestamp.getTime() / 1000), close: b.close }));
}

function pctSeries(rows: { time: number; close: number }[]) {
  if (!rows.length || !rows[0].close) return [];
  const base = rows[0].close;
  return rows.map((p) => ({ time: p.time, value: Math.round((p.close / base - 1) * 10000) / 100 }));
}

async function card(meta: (typeof INDICES)[number]) {
  try {
    const q = await analysis.quote(meta.symbol);
    let price = q.price;
    let change = q.change;
    if (meta.unit === "yield" && price && price > 20) {
      price = price / 10;
      change = change != null ? change / 10 : null;
    }
    let spark: number[] = [];
    try {
      spark = (await closes(meta.symbol, "1d", 20)).map((p) => p.close);
      if (meta.unit === "yield" && spark.length && spark[spark.length - 1] > 20) spark = spark.map((c) => c / 10);
    } catch {
      spark = [];
    }
    return {
      symbol: meta.display,
      ticker: meta.symbol,
      name: q.name || meta.name,
      price,
      change,
      change_percent: q.change_percent,
      open: q.open,
      high: q.high,
      low: q.low,
      previous_close: q.previous_close,
      week52_high: q.week52_high,
      week52_low: q.week52_low,
      volume: q.volume,
      unit: meta.unit,
      spark,
      source: q.freshness.source,
    };
  } catch {
    return null;
  }
}

async function mover(symbol: string) {
  try {
    const q = await analysis.quote(symbol);
    if (q.price == null || q.change_percent == null) return null;
    return { symbol: q.symbol, name: q.name, price: q.price, change: q.change, change_percent: q.change_percent, volume: q.volume };
  } catch {
    return null;
  }
}

function takeaways(cards: Record<string, unknown>[], sectors: Record<string, unknown>[], movers: Record<string, unknown>, rates: Record<string, unknown> | null) {
  const notes: string[] = [];
  const by = Object.fromEntries(cards.map((c) => [c.symbol, c]));
  const spy = by.SPY as Record<string, number> | undefined;
  const qqq = by.QQQ as Record<string, number> | undefined;
  const vix = by.VIX as Record<string, unknown> | undefined;
  const spx = by.SPX as Record<string, number> | undefined;
  const nasdaq = by.COMP as Record<string, number> | undefined;
  if (spy && qqq && (spy.change_percent || 0) > 0 && (qqq.change_percent || 0) > 0) {
    notes.push(`SPY (${(spy.change_percent >= 0 ? "+" : "") + spy.change_percent.toFixed(2)}%) and QQQ (${(qqq.change_percent >= 0 ? "+" : "") + qqq.change_percent.toFixed(2)}%) are trending higher.`);
  } else if (spy && qqq) {
    notes.push(`Index tape is mixed: SPY ${(spy.change_percent || 0) >= 0 ? "+" : ""}${(spy.change_percent || 0).toFixed(2)}%, QQQ ${(qqq.change_percent || 0) >= 0 ? "+" : ""}${(qqq.change_percent || 0).toFixed(2)}%.`);
  }
  if (vix && (vix.status as { label?: string; reason?: string } | undefined)) {
    const st = vix.status as { label: string; reason: string };
    notes.push(`VIX ${Number(vix.price).toFixed(1)}: ${st.label} — ${st.reason}`);
  }
  for (const key of ["US2Y", "US10Y", "US20Y", "US30Y", "WTI", "BRENT", "CPI", "DXY", "BTC"]) {
    const row = by[key] as Record<string, unknown> | undefined;
    if (row && row.status) {
      const st = row.status as { label: string; reason: string };
      notes.push(`${row.name}: ${st.label} — ${st.reason}`);
    }
  }
  if (sectors.length) {
    const ranked = [...sectors].sort((a, b) => (Number(b.change_percent) || 0) - (Number(a.change_percent) || 0));
    const lead = ranked[0];
    const lag = ranked[ranked.length - 1];
    if (lead.change_percent != null) notes.push(`${lead.name} leads sectors at ${Number(lead.change_percent) >= 0 ? "+" : ""}${Number(lead.change_percent).toFixed(2)}% (${lead.etf}).`);
    if (lag.change_percent != null && lag.name !== lead.name) notes.push(`${lag.name} is the laggard at ${Number(lag.change_percent) >= 0 ? "+" : ""}${Number(lag.change_percent).toFixed(2)}%.`);
  }
  const gainers = (movers.gainers as Array<Record<string, unknown>>) || [];
  if (gainers.length) notes.push(`Top gainer in the scanned universe: ${gainers[0].symbol} ${Number(gainers[0].change_percent) >= 0 ? "+" : ""}${Number(gainers[0].change_percent).toFixed(2)}%.`);
  if (rates && rates.yield != null) notes.push(`10-year yield is ${Number(rates.yield).toFixed(2)}% and ${rates.trend_20d || "stable"} (direction matters more than level).`);
  if (spx && nasdaq && spx.change_percent != null && nasdaq.change_percent != null) {
    notes.push(`S&P 500 ${spx.change_percent >= 0 ? "+" : ""}${spx.change_percent.toFixed(2)}% vs Nasdaq Composite ${nasdaq.change_percent >= 0 ? "+" : ""}${nasdaq.change_percent.toFixed(2)}%.`);
  }
  return notes.slice(0, 6);
}

export async function buildPulse(rangeKey = "1W") {
  let key = (rangeKey || "1W").toUpperCase();
  if (!(key in PULSE_RANGE)) key = "1W";
  const cached = cacheGet<{ payload: Record<string, unknown> }>(`pulse:v3:${key}`);
  if (cached?.payload) return cached.payload;
  const t0 = Date.now();
  const cards: Record<string, unknown>[] = (await Promise.all(INDICES.map(card))).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );
  const tf = PULSE_RANGE[key];
  const limit = RANGE_BARS[key];
  const series: Record<string, unknown[]> = {};
  const legend: Record<string, string> = { SPY: "SPY", QQQ: "QQQ", IWM: "IWM", "^GSPC": "S&P 500", "^IXIC": "Nasdaq" };
  await Promise.all(
    PERF_KEYS.map(async (sym) => {
      try {
        const pts = pctSeries(await closes(sym, tf, limit));
        if (pts.length) series[legend[sym]] = pts;
      } catch {
        /* skip */
      }
    }),
  );
  let scanned: Record<string, unknown> = {};
  try {
    scanned = await scanMarketMovers();
  } catch {
    scanned = {};
  }
  let gainers = (scanned.gainers as Record<string, unknown>[]) || [];
  let losers = (scanned.losers as Record<string, unknown>[]) || [];
  let active = (scanned.active as Record<string, unknown>[]) || [];
  if (gainers.length < 5 || losers.length < 5) {
    const moversRaw = (await Promise.all(MOVER_UNIVERSE.map(mover))).filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (gainers.length < 5) gainers = [...moversRaw].sort((a, b) => Number(b.change_percent) - Number(a.change_percent)).slice(0, 5);
    if (losers.length < 5) losers = [...moversRaw].sort((a, b) => Number(a.change_percent) - Number(b.change_percent)).slice(0, 5);
    if (!active.length) active = [...moversRaw].sort((a, b) => Number(b.volume || 0) - Number(a.volume || 0)).slice(0, 8);
  }
  const sectors = (
    await Promise.all(
      SECTORS.map(async ([name, etf, color]) => {
        try {
          const q = await analysis.quote(etf);
          return { name, etf, color, price: q.price, change_percent: q.change_percent };
        } catch {
          return null;
        }
      }),
    )
  )
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0));

  let news: Record<string, unknown>[] = [];
  for (const sym of ["SPY", "QQQ"]) {
    try {
      news = news.concat(((await analysis.first("fetchNews", sym)) as Record<string, unknown>[]) || []);
    } catch {
      /* skip */
    }
  }
  const seen = new Set<string>();
  news = news.filter((n) => {
    const h = String(n.headline || "");
    if (!h || seen.has(h)) return false;
    seen.add(h);
    return true;
  }).slice(0, 12);

  const treasury: Record<string, Record<string, unknown>> = {};
  for (const [seriesId, display, name] of [
    ["DGS2", "US2Y", "U.S. 2-Year Treasury Yield"],
    ["DGS10", "US10Y", "U.S. 10-Year Treasury Yield"],
    ["DGS20", "US20Y", "U.S. 20-Year Treasury Yield"],
    ["DGS30", "US30Y", "U.S. 30-Year Treasury Yield"],
  ] as const) {
    try {
      const row = await analysis.fred.series(seriesId);
      if (!row) continue;
      treasury[display] = row;
      const existing = cards.find((c) => c.symbol === display);
      let spark: number[] = [];
      try {
        spark = ((await fetchFredCsv(seriesId)) || []).slice(-20).map(([, v]) => v);
      } catch {
        spark = [];
      }
      const payloadCard = {
        symbol: display,
        ticker: seriesId,
        name,
        price: row.yield,
        change: row.change_1d,
        change_percent: null,
        unit: "yield",
        spark,
        source: row.source,
        as_of: row.as_of,
        has_signal: true,
      };
      if (existing) Object.assign(existing, payloadCard, { name });
      else cards.push(payloadCard as (typeof cards)[number]);
    } catch {
      continue;
    }
  }

  let cpi: Record<string, unknown> | null = null;
  try {
    cpi = await fetchCpi();
  } catch {
    cpi = null;
  }
  if (cpi && cpi.yoy != null) {
    cards.push({
      symbol: "CPI",
      ticker: "CPI-U",
      name: "U.S. CPI Inflation (YoY)",
      price: cpi.yoy as number,
      change: cpi.mom as number | null,
      change_percent: cpi.mom as number | null,
      unit: "inflation",
      spark: (cpi.spark as number[]) || [],
      source: cpi.source as string,
      as_of: cpi.as_of as string,
      has_signal: true,
    } as (typeof cards)[number]);
  }

  const extras: Record<string, Record<string, unknown>> = {
    US2Y: treasury.US2Y || {},
    US10Y: treasury.US10Y || {},
    US20Y: treasury.US20Y || {},
    US30Y: treasury.US30Y || {},
  };
  const macroSyms = new Set(["VIX", "US2Y", "US10Y", "US20Y", "US30Y", "DXY", "WTI", "BRENT", "CPI"]);
  for (const c of cards) {
    attachMacroStatus(c as unknown as Record<string, unknown>, extras[c.symbol as string]);
    (c as Record<string, unknown>).group = macroSyms.has(String(c.symbol)) ? "macro" : "equity";
  }
  const order = ["SPY", "QQQ", "IWM", "SPX", "COMP", "VIX", "US2Y", "US10Y", "US20Y", "US30Y", "DXY", "WTI", "BRENT", "CPI", "BTC"];
  cards.sort((a, b) => {
    const ia = order.indexOf(String(a.symbol));
    const ib = order.indexOf(String(b.symbol));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const rates = treasury.US10Y;
  const payload = {
    range: key,
    last_updated: new Date().toISOString(),
    cards,
    performance: series,
    movers: { gainers, losers, active },
    sectors,
    news,
    table: cards,
    takeaways: takeaways(cards as unknown as Record<string, unknown>[], sectors, { gainers }, rates).slice(0, 8),
    treasury: rates,
    treasury_curve: treasury,
    inflation: cpi,
    movers_universe: scanned.universe || "market-wide",
    latency_ms: Date.now() - t0,
  };
  cacheSet(`pulse:v3:${key}`, { payload, source: "composite" }, CACHE_TTL.macro);
  return payload;
}
