import { cacheGet, cacheSet } from "@/src/lib/cache";
import { HttpError } from "@/src/lib/errors";
import { analysis } from "@/src/services/analysis";
import {
  buildRows,
  buildSnapshot,
  chartPoints,
  lightweightTrend,
  relativePerformance,
  toCard,
} from "@/src/engines/compareEngine";
import {
  CATEGORY_WEIGHTS,
  COMPARE_PERIODS,
  COMPARE_TIMEFRAMES,
  parseCompareTicker,
  type ComparePayload,
  type ComparePeriod,
  type CompareSignal,
  type CompareTimeframe,
} from "@/lib/compare";
import type { OHLCVBar } from "@/src/types/domain";

const OUTPUT: Record<string, number> = {
  "5m": 400,
  "15m": 400,
  "30m": 400,
  "1h": 500,
  "4h": 500,
  "1d": 1600,
  "1w": 600,
};

export function normalizeCompareTimeframe(value: string): CompareTimeframe {
  const aliases: Record<string, CompareTimeframe> = {
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "1H": "1h",
    "4h": "4h",
    "4H": "4h",
    "1d": "1d",
    daily: "1d",
    "1w": "1w",
    weekly: "1w",
  };
  const v = aliases[value] || aliases[value.toLowerCase()];
  if (!v || !COMPARE_TIMEFRAMES.includes(v)) {
    throw new HttpError(400, `Unsupported timeframe '${value}'. Use: ${COMPARE_TIMEFRAMES.join(", ")}`);
  }
  return v;
}

export function normalizeComparePeriod(value: string): ComparePeriod {
  const v = value.toUpperCase() as ComparePeriod;
  if (!COMPARE_PERIODS.includes(v)) {
    throw new HttpError(400, `Unsupported period '${value}'. Use: ${COMPARE_PERIODS.join(", ")}`);
  }
  return v;
}

function slicePeriod(bars: OHLCVBar[], period: ComparePeriod) {
  if (period === "MAX" || !bars.length) return bars;
  const last = bars[bars.length - 1].timestamp instanceof Date ? (bars[bars.length - 1].timestamp as Date) : new Date(bars[bars.length - 1].timestamp);
  const start = new Date(last);
  if (period === "YTD") start.setUTCMonth(0, 1);
  else {
    const months: Record<string, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "5Y": 60 };
    start.setUTCMonth(start.getUTCMonth() - (months[period] || 12));
  }
  return bars.filter((b) => {
    const t = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return t >= start;
  });
}

async function loadTicker(symbol: string, tf: CompareTimeframe, period: ComparePeriod) {
  const parsed = parseCompareTicker(symbol);
  if ("error" in parsed) {
    return { error: parsed.error, snap: buildSnapshot(symbol.toUpperCase().trim(), symbol, []), bars: [] as OHLCVBar[] };
  }
  const upper = parsed.symbol;
  try {
    const [quote, barsPack] = await Promise.all([
      analysis.quote(upper).catch(() => null),
      analysis.bars(upper, tf, OUTPUT[tf] || 500),
    ]);
    const bars = barsPack[0] || [];
    const mismatched = bars.find((b) => b.symbol && b.symbol.toUpperCase() !== upper);
    if (mismatched) {
      return {
        error: `INVALID TICKER — market data for ${upper} was not returned.`,
        snap: buildSnapshot(upper, upper, []),
        bars: [] as OHLCVBar[],
      };
    }
    const sliced = slicePeriod(bars, period);
    if (!sliced.length) {
      return {
        error: `INVALID TICKER — no market data for ${upper}.`,
        snap: buildSnapshot(upper, quote && "name" in quote ? quote.name || upper : upper, []),
        bars: [],
      };
    }
    if (sliced.length < 5) {
      return {
        error: "INSUFFICIENT DATA",
        snap: buildSnapshot(upper, quote && "name" in quote ? quote.name || upper : upper, sliced),
        bars: sliced,
      };
    }
    const name = quote && "name" in quote ? quote.name || upper : upper;
    return { error: null as string | null, snap: buildSnapshot(upper, name, sliced), bars: sliced };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid ticker";
    return {
      error: message.includes("Unable") ? `INSUFFICIENT DATA for ${upper}` : `INVALID TICKER — ${upper} is not available.`,
      snap: buildSnapshot(upper, upper, []),
      bars: [] as OHLCVBar[],
    };
  }
}

async function mtfSignal(symbol: string, tf: CompareTimeframe): Promise<CompareSignal> {
  try {
    const [bars] = await analysis.bars(symbol, tf, 180);
    return lightweightTrend(bars);
  } catch {
    return "INSUFFICIENT DATA";
  }
}

export async function buildCompare(ticker1: string, ticker2: string, timeframe: string, period: string): Promise<ComparePayload> {
  const tf = normalizeCompareTimeframe(timeframe);
  const per = normalizeComparePeriod(period);
  const aParsed = parseCompareTicker(ticker1, "Ticker 1");
  const bParsed = parseCompareTicker(ticker2, "Ticker 2");
  if ("error" in aParsed) throw new HttpError(400, aParsed.error);
  if ("error" in bParsed) throw new HttpError(400, bParsed.error);
  const aSym = aParsed.symbol;
  const bSym = bParsed.symbol;
  const cacheKey = `compare:v1:${aSym}:${bSym}:${tf}:${per}`;
  const hit = cacheGet<ComparePayload>(cacheKey);
  if (hit) return hit;

  const started = Date.now();
  const [a, b] = await Promise.all([loadTicker(aSym, tf, per), loadTicker(bSym, tf, per)]);
  const mtfTfs = COMPARE_TIMEFRAMES;
  const mtf = await Promise.all(
    mtfTfs.map(async (t) => ({
      tf: t,
      t1: a.error ? ("INSUFFICIENT DATA" as CompareSignal) : await mtfSignal(aSym, t),
      t2: b.error ? ("INSUFFICIENT DATA" as CompareSignal) : await mtfSignal(bSym, t),
    })),
  );
  const align = (side: "t1" | "t2") => {
    const rows = mtf.filter((r) => r[side] !== "INSUFFICIENT DATA");
    const bull = rows.filter((r) => r[side].includes("BULLISH")).length;
    return `${bull} / ${rows.length || 0}`;
  };
  const card1 = toCard(a.snap, a.error);
  const card2 = toCard(b.snap, b.error);
  const lastTs = a.snap.latest || b.snap.latest || new Date().toISOString();
  const asOfEt = new Date(lastTs).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const payload: ComparePayload = {
    ticker1: card1,
    ticker2: card2,
    timeframe: tf,
    period: per,
    as_of: lastTs,
    as_of_et: asOfEt,
    timezone: "America/New_York (ET)",
    indicators: a.error && b.error ? [] : buildRows(a.snap, b.snap),
    relative: a.error || b.error ? [] : relativePerformance(a.snap, b.snap),
    multiTimeframe: mtf,
    alignment: { t1: `${aSym} alignment: ${align("t1")}`, t2: `${bSym} alignment: ${align("t2")}` },
    chart: {
      t1: a.error ? [] : chartPoints(a.snap),
      t2: b.error ? [] : chartPoints(b.snap),
    },
    dataQuality: {
      t1: {
        status: a.error || (a.snap.bars < 15 ? "INSUFFICIENT DATA" : "VALID"),
        candles: a.snap.bars,
        missing: a.snap.missing,
        latest: a.snap.latest ? asOfEt : "—",
      },
      t2: {
        status: b.error || (b.snap.bars < 15 ? "INSUFFICIENT DATA" : "VALID"),
        candles: b.snap.bars,
        missing: b.snap.missing,
        latest: b.snap.latest ? asOfEt : "—",
      },
    },
    weightsNote: `Category weights (not claimed optimal): ${Object.entries(CATEGORY_WEIGHTS)
      .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
      .join(", ")}. Confidence measures data completeness and category agreement, not the probability of a future gain.`,
  };
  cacheSet(cacheKey, payload, 45);
  console.info("[compare]", { ticker1: aSym, ticker2: bSym, tf, period: per, ms: Date.now() - started, indicators: payload.indicators.length });
  return payload;
}
