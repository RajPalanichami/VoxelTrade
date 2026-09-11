import { CACHE_TTL } from "@/src/config/env";
import { SECTORS, getSector } from "@/src/data/sectors";
import { analyzeStock, categories, finalizeScores, marketTone, normalizeTo100, sliceCloses } from "@/src/engines/mag7Score";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { resampleOhlcv, type Frame } from "@/src/lib/series";
import { toFrame } from "@/src/providers/base";
import { analysis } from "@/src/services/analysis";

export const INDICATOR_TF = new Set(["5m", "15m", "30m", "1h", "4h", "1d", "1w"]);
export const RANGES = new Set(["1W", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"]);

async function quote(symbol: string) {
  try {
    const q = await analysis.quote(symbol);
    return { symbol: q.symbol, name: q.name, price: q.price, change: q.change, change_percent: q.change_percent, volume: q.volume, source: q.freshness.source };
  } catch {
    return null;
  }
}

async function dailyFrame(symbol: string) {
  const [bars] = await analysis.bars(symbol, "1d", 1400);
  return toFrame(bars);
}

function toBench(frame: Frame) {
  return { closes: frame.get("close").filter((x): x is number => x != null), timestamps: frame.timestamps() };
}

async function one(symbol: string, name: string, timeframe: string, benches: Record<string, ReturnType<typeof toBench>>) {
  const q = await quote(symbol);
  if (!q || q.price == null) return null;
  const daily = await dailyFrame(symbol);
  let frame = daily;
  let used = "1d";
  if (timeframe && !["1d", "1m", "3m", "6m", "1y", "3y", "5y"].includes(timeframe.toLowerCase())) {
    try {
      let tf = timeframe.toLowerCase();
      if (tf === "15m") {
        const [bars] = await analysis.bars(symbol, "5m", 500);
        frame = resampleOhlcv(toFrame(bars), "15min");
        used = "15m";
      } else if (tf === "1w") {
        const [bars] = await analysis.bars(symbol, "1d", 1400);
        frame = resampleOhlcv(toFrame(bars), "W-FRI");
        used = "1w";
      } else {
        if (!["5m", "30m", "1h", "4h", "1d"].includes(tf)) tf = "1d";
        const [bars] = await analysis.bars(symbol, tf, tf === "1d" ? 1400 : 500);
        frame = toFrame(bars);
        used = tf;
      }
    } catch {
      frame = daily;
      used = "1d";
    }
  }
  if (frame.empty) frame = daily;
  const useIntraday = ["5m", "15m", "30m", "1h", "4h", "1w"].includes(timeframe);
  const row = analyzeStock(symbol, name, useIntraday ? frame : daily, q, benches);
  if (row) {
    row.timeframe_used = useIntraday ? used : "1d";
    row._daily = daily.empty ? null : daily;
  }
  return row;
}

export async function buildSector(slug: string, timeframe = "1d", rangeKey = "1M") {
  const meta = getSector(slug);
  if (!meta) throw new Error(`Unknown sector '${slug}'`);
  let tf = (timeframe || "1d").toLowerCase();
  if (!INDICATOR_TF.has(tf) && !RANGES.has(tf.toUpperCase())) tf = "1d";
  let rng = (rangeKey || "1M").toUpperCase();
  if (!RANGES.has(rng)) rng = "1M";
  const cacheKey = `sector:v1:${meta.slug}:${tf}:${rng}`;
  const cached = cacheGet<{ payload: Record<string, unknown> }>(cacheKey);
  if (cached?.payload) return cached.payload;
  const t0 = Date.now();
  const benches: Record<string, ReturnType<typeof toBench>> = {};
  const benchMap: Record<string, string> = { SPY: "SPY", QQQ: "QQQ", ETF: meta.etf, VIX: "^VIX", NDX: "^IXIC" };
  await Promise.all(
    Object.entries(benchMap).map(async ([k, s]) => {
      try {
        const df = await dailyFrame(s);
        if (!df.empty) {
          benches[k] = toBench(df);
          if (k === "ETF") benches.SOXX = toBench(df);
        }
      } catch {
        /* skip */
      }
    }),
  );
  const rows = (await Promise.all(meta.members.map(([sym, name]) => one(sym, name, tf, benches)))).filter((r): r is NonNullable<typeof r> => Boolean(r));
  finalizeScores(rows);
  const lastRank = rows.length;
  for (const r of rows) {
    let why = String(r.why || "").replace("Magnificent 7", meta.name);
    if (r.rank === lastRank && !why.includes("Weakest")) {
      why = `${r.symbol} — ${r.strength}/100. Weakest ${meta.name} name in this basket. ${why.includes(". ") ? why.split(". ").slice(1).join(". ") : why}`;
    }
    r.why = why;
  }
  const ctx: Record<string, unknown> = {};
  for (const [key, ticker] of [["SPY", "SPY"], ["QQQ", "QQQ"], [meta.etf, meta.etf], ["VIX", "^VIX"]] as const) {
    const q = await quote(ticker);
    if (q) ctx[key] = q;
  }
  try {
    const rates = await analysis.fred.dgs10();
    if (rates?.yield != null) ctx.US10Y = { symbol: "US10Y", name: "10-Year Treasury", price: rates.yield, change_percent: null };
  } catch {
    /* skip */
  }
  const series: Record<string, unknown[]> = {};
  const legend: Record<string, number | null> = {};
  for (const r of rows) {
    const daily = r._daily as Frame | null;
    delete r._daily;
    if (!daily || daily.empty) continue;
    const pts = normalizeTo100(sliceCloses(toBench(daily).closes, toBench(daily).timestamps, rng));
    if (pts.length) {
      series[r.symbol as string] = pts;
      legend[r.symbol as string] = pts[pts.length - 1].value;
    }
    delete r.closes;
  }
  const spyChg = (ctx.SPY as { change_percent?: number } | undefined)?.change_percent ?? null;
  const qqqChg = (ctx.QQQ as { change_percent?: number } | undefined)?.change_percent ?? null;
  const winner = rows[0];
  const payload = {
    slug: meta.slug,
    sector: meta.name,
    etf: meta.etf,
    stocks: rows,
    leaderboard: rows.map((r) => ({
      rank: r.rank,
      symbol: r.symbol,
      name: r.name,
      strength: r.strength,
      risk: r.risk_score,
      signal: r.signal,
      trend: (r.trend as { alignment: string }).alignment,
      momentum: r.momentum_label,
      volume: (r.volume as { confirm: string }).confirm,
      volatility: (r.volatility as { label: string }).label,
      perf_1m: (r.performance as Record<string, number | null>)["1M"],
    })),
    categories: categories(rows),
    series,
    legend,
    range: rng,
    timeframe: tf,
    context: ctx,
    market_status: marketTone(rows, spyChg, qqqChg),
    headline: winner
      ? `${winner.symbol} is the strongest ${meta.name} stock right now (${winner.strength}/100). ${winner.why}`
      : `${meta.name} data is unavailable.`,
    updated: new Date().toISOString(),
    latency_ms: Date.now() - t0,
    missing: meta.members.map(([s]) => s).filter((s) => !rows.some((r) => r.symbol === s)),
  };
  cacheSet(cacheKey, { payload }, CACHE_TTL["1d"] || 90);
  return payload;
}

export function listSectors() {
  return Object.values(SECTORS).map((s) => ({ slug: s.slug, name: s.name, etf: s.etf }));
}
