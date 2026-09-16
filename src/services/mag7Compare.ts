import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";
import { analysis } from "@/src/services/analysis";
import { resampleToMonthly } from "@/src/engines/chartPatterns";
import {
  COMPARE_SPECS,
  buildSnapshot,
  cellsFromSnap,
  chartPoints,
  toCard,
} from "@/src/engines/compareEngine";
import { CATEGORY_WEIGHTS, parseCompareTicker } from "@/lib/compare";
import {
  BASKET_COMPARE_MAX,
  MAG7_COMPARE_TF_LABELS,
  MAG7_COMPARE_TIMEFRAMES,
  MAG7_COMPARE_UNIVERSE,
  type Mag7ComparePayload,
  type Mag7CompareStock,
  type Mag7CompareTimeframe,
} from "@/lib/mag7Compare";
import type { CompareTimeframe } from "@/lib/compare";
import type { OHLCVBar } from "@/src/types/domain";

const OUTPUT: Record<string, number> = {
  "15m": 400,
  "30m": 400,
  "1h": 500,
  "4h": 500,
  "1d": 500,
  "1w": 260,
  "1M": 1400,
};

export function normalizeMag7CompareTimeframe(value: string): Mag7CompareTimeframe {
  const aliases: Record<string, Mag7CompareTimeframe> = {
    "15m": "15m",
    "15 minutes": "15m",
    "30m": "30m",
    "30 minutes": "30m",
    "1h": "1h",
    "1H": "1h",
    "1 hour": "1h",
    "4h": "4h",
    "4H": "4h",
    "4 hours": "4h",
    "1d": "1d",
    daily: "1d",
    "1w": "1w",
    weekly: "1w",
    "1M": "1M",
    monthly: "1M",
    "1mo": "1M",
  };
  const v = aliases[value] || aliases[value.toLowerCase()];
  if (!v || !MAG7_COMPARE_TIMEFRAMES.includes(v)) {
    throw new HttpError(400, `Unsupported timeframe '${value}'. Use: ${MAG7_COMPARE_TIMEFRAMES.join(", ")}`);
  }
  return v;
}

function band(score: number | null): string {
  if (score == null) return "—";
  if (score >= 80) return "Very Strong";
  if (score >= 68) return "Strong";
  if (score >= 55) return "Moderate";
  if (score >= 45) return "Neutral";
  if (score >= 32) return "Weak";
  return "Very Weak";
}

function avg(nums: Array<number | null>): number | null {
  const ok = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!ok.length) return null;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

function trimTrailingEmptyBars(bars: OHLCVBar[]) {
  const out = [...bars];
  while (out.length && !(out[out.length - 1].volume > 0) && out[out.length - 1].high === out[out.length - 1].low) {
    out.pop();
  }
  return out;
}

async function loadMag7Bars(symbol: string, tf: Mag7CompareTimeframe): Promise<{ bars: OHLCVBar[]; name: string; error: string | null }> {
  try {
    if (tf === "1M") {
      const [daily, quote] = await Promise.all([
        analysis.bars(symbol, "1d", OUTPUT["1M"]),
        analysis.quote(symbol).catch(() => null),
      ]);
      const monthly = trimTrailingEmptyBars(resampleToMonthly(daily[0] || []).map((bar) => ({ ...bar, symbol, timeframe: "1M" })));
      return {
        bars: monthly,
        name: quote && "name" in quote ? quote.name || symbol : symbol,
        error: monthly.length < 5 ? "INSUFFICIENT DATA" : null,
      };
    }
    const [barsPack, quote] = await Promise.all([
      analysis.bars(symbol, tf as CompareTimeframe, OUTPUT[tf] || 400),
      analysis.quote(symbol).catch(() => null),
    ]);
    const bars = trimTrailingEmptyBars(barsPack[0] || []);
    const mismatched = bars.find((b) => b.symbol && b.symbol.toUpperCase() !== symbol);
    if (mismatched) {
      return { bars: [], name: symbol, error: `INVALID TICKER — market data for ${symbol} was not returned.` };
    }
    return {
      bars,
      name: quote && "name" in quote ? quote.name || symbol : symbol,
      error: bars.length < 5 ? "INSUFFICIENT DATA" : null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unavailable";
    return {
      bars: [],
      name: symbol,
      error: message.includes("Unable") ? "INSUFFICIENT DATA" : `INVALID TICKER — ${symbol} is not available.`,
    };
  }
}

function normalizeCloses(bars: { time: number; close: number }[], points = 80) {
  const slice = bars.slice(-points);
  const first = slice.find((p) => p.close > 0)?.close;
  if (!first) return [] as { time: number; value: number }[];
  return slice.map((p) => ({ time: p.time, value: (p.close / first) * 100 }));
}

export function parseBasketTickers(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.map((item) => String(item || ""))
    : String(raw || "")
        .split(/[,\s]+/)
        .filter(Boolean);
  const out: string[] = [];
  for (const item of list) {
    const parsed = parseCompareTicker(item, "Ticker");
    if ("error" in parsed) throw new HttpError(400, parsed.error);
    if (out.includes(parsed.symbol)) throw new HttpError(400, `Duplicate ticker '${parsed.symbol}'.`);
    out.push(parsed.symbol);
  }
  if (!out.length) throw new HttpError(400, "At least one ticker is required.");
  if (out.length > BASKET_COMPARE_MAX) throw new HttpError(400, `A maximum of ${BASKET_COMPARE_MAX} tickers can be compared.`);
  return out;
}

export async function buildBasketCompare(
  tickers: string[],
  timeframe: string,
  opts?: { cachePrefix?: string; names?: Record<string, string> },
): Promise<Mag7ComparePayload> {
  const tf = normalizeMag7CompareTimeframe(timeframe);
  const requested = parseBasketTickers(tickers);
  const cacheKey = `${opts?.cachePrefix || "basket-compare:v1"}:${tf}:${requested.join(",")}`;
  const hit = cacheGet<Mag7ComparePayload>(cacheKey);
  if (hit) return hit;

  const started = Date.now();
  const loaded = await Promise.all(
    requested.map(async (symbol) => {
      const pack = await loadMag7Bars(symbol, tf);
      const fallbackName = opts?.names?.[symbol] || symbol;
      const snap = buildSnapshot(symbol, pack.name || fallbackName, pack.bars);
      const card = toCard(snap, pack.error);
      const cells = pack.error ? {} : cellsFromSnap(snap);
      const points = pack.error ? [] : chartPoints(snap);
      return { symbol, snap, card, cells, points, error: pack.error };
    }),
  );

  const stocks: Mag7CompareStock[] = loaded
    .map(({ symbol, snap, card, cells }) => ({
      ...card,
      symbol,
      price: snap.values.price ?? null,
      tfReturn: snap.values.ret_1 ?? null,
      ret5: snap.values.ret_5 ?? null,
      rsi14: snap.values.rsi14 ?? null,
      macd: snap.values.macd ?? null,
      adx: snap.values.adx ?? null,
      rvol: snap.values.rvol ?? null,
      volume: snap.values.volume ?? null,
      atrPct: snap.values.atr_pct ?? null,
      support: snap.values.s1 ?? snap.values.dyn_sup ?? null,
      resistance: snap.values.r1 ?? snap.values.dyn_res ?? null,
      trendLabel: band(card.categories.Trend ?? null),
      momentumLabel: band(card.categories.Momentum ?? null),
      volatilityLabel: band(card.categories.Volatility ?? null),
    }))
    .sort((a, b) => {
      if (a.score == null && b.score == null) return a.symbol.localeCompare(b.symbol);
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });

  const scored = stocks.filter((s) => s.score != null && !s.error);
  const strongest = scored[0] || null;
  const weakest = scored.length ? scored[scored.length - 1] : null;

  const indicators = COMPARE_SPECS.map((spec) => ({
    id: spec.id,
    category: spec.category,
    name: spec.name,
    calculation: spec.calc,
    values: Object.fromEntries(loaded.map((row) => [row.symbol, row.cells[spec.id] || { value: null, display: "INSUFFICIENT DATA", signal: "INSUFFICIENT DATA" as const, interpretation: "", confidence: null, validBars: 0 }])),
  }));

  const chart: Mag7ComparePayload["chart"] = {};
  const legend: Mag7ComparePayload["legend"] = {};
  for (const row of loaded) {
    const series = normalizeCloses(row.points);
    chart[row.symbol] = series;
    legend[row.symbol] = series.length ? series[series.length - 1].value - 100 : null;
  }

  const lastTs = loaded.map((r) => r.snap.latest).filter(Boolean).sort().slice(-1)[0] || new Date().toISOString();
  const asOfEt = new Date(lastTs).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const payload: Mag7ComparePayload = {
    timeframe: tf,
    timeframeLabel: MAG7_COMPARE_TF_LABELS[tf],
    as_of: lastTs,
    as_of_et: asOfEt,
    timezone: "America/New_York (ET)",
    stocks,
    strongest,
    weakest,
    indicators,
    chart,
    legend,
    averages: {
      score: avg(stocks.map((s) => s.score)),
      rsi14: avg(stocks.map((s) => s.rsi14)),
      tfReturn: avg(stocks.map((s) => s.tfReturn)),
      rvol: avg(stocks.map((s) => s.rvol)),
    },
    dataQuality: Object.fromEntries(
      loaded.map((row) => [
        row.symbol,
        {
          status: row.error || (row.snap.bars < 15 ? "INSUFFICIENT DATA" : "VALID"),
          candles: row.snap.bars,
          missing: row.snap.missing,
          latest: row.snap.latest ? asOfEt : "—",
        },
      ]),
    ),
    weightsNote: `Category weights (not claimed optimal): ${Object.entries(CATEGORY_WEIGHTS)
      .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
      .join(", ")}. Confidence measures data completeness and category agreement, not the probability of a future gain.`,
    missing: stocks.filter((s) => s.error).map((s) => s.symbol),
    requested,
  };
  cacheSet(cacheKey, payload, 30);
  console.info("[basket-compare]", { tf, tickers: requested, ms: Date.now() - started, stocks: stocks.length, missing: payload.missing });
  return payload;
}

export async function buildMag7Compare(timeframe: string): Promise<Mag7ComparePayload> {
  return buildBasketCompare(
    MAG7_COMPARE_UNIVERSE.map(([symbol]) => symbol),
    timeframe,
    {
      cachePrefix: "mag7-compare:v2",
      names: Object.fromEntries(MAG7_COMPARE_UNIVERSE),
    },
  );
}
