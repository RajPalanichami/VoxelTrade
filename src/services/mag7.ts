import { CACHE_TTL } from "@/src/config/env";
import {
  BENCH,
  MAG7,
  analyzeStock,
  categories,
  finalizeScores,
  marketTone,
  normalizeTo100,
  sliceCloses,
} from "@/src/engines/mag7Score";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { resampleOhlcv } from "@/src/lib/series";
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
  const [bars, source] = await analysis.bars(symbol, "1d", 1400);
  return { frame: toFrame(bars), source };
}

async function indicatorFrame(symbol: string, timeframe: string) {
  let tf = (timeframe || "1d").toLowerCase();
  if (tf === "15m") {
    const [bars, source] = await analysis.bars(symbol, "5m", 500);
    return { frame: resampleOhlcv(toFrame(bars), "15min"), source, used: "15m" };
  }
  if (tf === "1w") {
    const [bars, source] = await analysis.bars(symbol, "1d", 1400);
    return { frame: resampleOhlcv(toFrame(bars), "W-FRI"), source, used: "1w" };
  }
  if (!["5m", "30m", "1h", "4h", "1d"].includes(tf)) tf = "1d";
  const [bars, source] = await analysis.bars(symbol, tf, tf === "1d" ? 1400 : 500);
  return { frame: toFrame(bars), source, used: tf };
}

function toBench(frame: ReturnType<typeof toFrame>) {
  return { closes: frame.get("close").filter((x): x is number => x != null), timestamps: frame.timestamps() };
}

async function one(symbol: string, name: string, timeframe: string, benches: Record<string, ReturnType<typeof toBench>>) {
  const q = await quote(symbol);
  if (!q || q.price == null) return null;
  const daily = await dailyFrame(symbol);
  let frame = daily.frame;
  let used = "1d";
  if (timeframe && !["1d", "1m", "3m", "6m", "1y", "3y", "5y"].includes(timeframe.toLowerCase())) {
    try {
      const ind = await indicatorFrame(symbol, timeframe);
      frame = ind.frame;
      used = ind.used;
    } catch {
      frame = daily.frame;
      used = "1d";
    }
  }
  if (frame.empty) frame = daily.frame;
  const useIntraday = ["5m", "15m", "30m", "1h", "4h", "1w"].includes(timeframe);
  const row = analyzeStock(symbol, name, useIntraday ? frame : daily.frame, q, benches);
  if (row) {
    row.timeframe_used = useIntraday ? used : "1d";
    row._daily = daily.frame.empty ? null : daily.frame;
  }
  return row;
}

export async function buildMag7(timeframe = "1d", rangeKey = "1M") {
  let tf = (timeframe || "1d").toLowerCase();
  if (!INDICATOR_TF.has(tf) && !RANGES.has(tf.toUpperCase())) tf = "1d";
  let rng = (rangeKey || "1M").toUpperCase();
  if (!RANGES.has(rng)) rng = "1M";
  const cacheKey = `mag7:v1:${tf}:${rng}`;
  const cached = cacheGet<{ payload: Record<string, unknown> }>(cacheKey);
  if (cached?.payload) return cached.payload;
  const t0 = Date.now();
  const benches: Record<string, ReturnType<typeof toBench>> = {};
  await Promise.all(
    Object.entries(BENCH).map(async ([k, s]) => {
      try {
        const { frame } = await dailyFrame(s);
        if (!frame.empty) benches[k] = toBench(frame);
      } catch {
        /* skip */
      }
    }),
  );
  const rows = (await Promise.all(MAG7.map(([sym, name]) => one(sym, name, tf, benches)))).filter((r): r is NonNullable<typeof r> => Boolean(r));
  finalizeScores(rows);
  const ctx: Record<string, unknown> = {};
  await Promise.all(
    ([["SPY", "SPY"], ["QQQ", "QQQ"], ["SOXX", "SOXX"], ["VIX", "^VIX"]] as const).map(async ([key, ticker]) => {
      const q = await quote(ticker);
      if (q) ctx[key] = q;
    }),
  );
  try {
    const rates = await analysis.fred.dgs10();
    if (rates?.yield != null) ctx.US10Y = { symbol: "US10Y", name: "10-Year Treasury", price: rates.yield, change_percent: null };
  } catch {
    /* skip */
  }
  const series: Record<string, unknown[]> = {};
  const legend: Record<string, number | null> = {};
  for (const r of rows) {
    const daily = r._daily as ReturnType<typeof toFrame> | null;
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
      ? `${winner.symbol} is the strongest Magnificent 7 stock right now (${winner.strength}/100). ${winner.why}`
      : "Magnificent 7 data is unavailable.",
    updated: new Date().toISOString(),
    latency_ms: Date.now() - t0,
    missing: MAG7.map(([s]) => s).filter((s) => !rows.some((r) => r.symbol === s)),
  };
  cacheSet(cacheKey, { payload }, CACHE_TTL["1d"] || 90);
  return payload;
}
